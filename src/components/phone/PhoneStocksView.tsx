import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { CorpStock, RpGetStocksComposer, RpStocksEvent, STOCK_WINDOWS } from '../../api/rp-phone/RpStocksMessages';
import { SendMessageComposer } from '../../api';
import { useMessageEvent } from '../../hooks';
import { PhoneIcon } from './PhoneIcon';

// The phone's Stocks app.
//
// rp_corporations.stock is INVENTORY - how much a corporation is holding - not
// a share price, and nobody buys a share. So a falling number is the
// OPPORTUNITY: stores draining means they are consuming, which means they will
// pay for a haul. That inverts the convention this shape borrows, so there is
// no red anywhere: pink means "they are buying", grey means "no errand here".
//
// The market never closes, so there is no session, no previous close - the
// stats are windows, and a live stamp says the number is current. The app asks
// for the board when it opens and every 60s while it stays open; nothing runs
// while the phone is shut.

interface PhoneStocksViewProps
{
    onBack: () => void;
}

const REFRESH_MS = 60000;
const HALF = 50;   // below half full is the threshold that makes a haul worth carrying

interface Reading
{
    corp: CorpStock;
    fullness: number;
    delta: number;
    pct: number;
    draining: boolean;
    hasRoom: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

// Level over time. SVG y grows downward, so a rising level maps to a SMALLER
// y; a flat series draws flat rather than magnifying a unit of noise.
const path = (values: number[], w: number, h: number, pad: number) =>
{
    if(values.length < 2) return '';

    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const step = (w / (values.length - 1));

    return values.map((value, index) =>
    {
        const y = (hi === lo) ? (h / 2) : (h - pad - (((value - lo) / (hi - lo)) * (h - (pad * 2))));

        return `${ (index * step).toFixed(1) },${ y.toFixed(1) }`;
    }).join(' ');
}

const Spark: FC<{ values: number[], draining: boolean }> = ({ values, draining }) =>
{
    const points = path(values, 60, 30, 2);

    if(!points) return <div className="phone-stocks-spark" />;

    return (
        <svg className="phone-stocks-spark" viewBox="0 0 60 30" fill="none" aria-hidden="true">
            <polyline points={ points } stroke={ draining ? '#e93a7d' : '#6b6280' } strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export const PhoneStocksView: FC<PhoneStocksViewProps> = props =>
{
    const { onBack = null } = props;
    const [ windowMinutes, setWindowMinutes ] = useState<number>(STOCK_WINDOWS[0].minutes);
    const [ corps, setCorps ] = useState<CorpStock[]>(null);
    const [ openId, setOpenId ] = useState<number>(0);
    const [ stamp, setStamp ] = useState<number>(0);

    const request = useCallback((minutes: number) => SendMessageComposer(new RpGetStocksComposer(minutes)), []);

    useMessageEvent<RpStocksEvent>(RpStocksEvent, event =>
    {
        const parser = event.getParser();

        // A reply for a range the player has since moved off is stale.
        if(parser.windowMinutes !== windowMinutes) return;

        setCorps(parser.corps);
        setStamp(Date.now());
    });

    // Ask on open and on every range change, then keep it current while the
    // app is on screen. Nothing polls once this unmounts.
    useEffect(() =>
    {
        request(windowMinutes);

        const timer = window.setInterval(() => request(windowMinutes), REFRESH_MS);

        return () => window.clearInterval(timer);
    }, [ request, windowMinutes ]);

    // A corporation's reading: how full, and which way it has gone across the
    // window. Fewer than two samples means nothing has moved yet.
    const readings = useMemo<Reading[]>(() =>
    {
        if(!corps) return [];

        return corps.map(corp =>
        {
            const first = corp.samples.length ? corp.samples[0].value : corp.stock;
            const delta = (corp.stock - first);
            const pct = ((corp.samples.length > 1) && first) ? ((delta / first) * 100) : 0;
            const fullness = corp.capacity ? ((corp.stock / corp.capacity) * 100) : 0;

            return { corp, fullness, delta, pct, draining: (pct < 0), hasRoom: (corp.capacity > 0) && (fullness < HALF) };
        })
            // fastest-emptying first: the corporation worth walking to leads
            .sort((a, b) => (a.pct - b.pct));
    }, [ corps ]);

    const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
    const openReading = readings.find(reading => (reading.corp.id === openId));

    const chip = (reading: Reading) => (
        <div className="phone-stocks-chip" style={ { background: (reading.draining ? '#e93a7d' : '#4b4359') } }>
            { (reading.pct === 0) ? '0.00%' : `${ reading.pct > 0 ? '+' : '' }${ reading.pct.toFixed(2) }%` }
        </div>
    );

    const row = (reading: Reading) => (
        <div key={ reading.corp.id } className="phone-stocks-row phone-tap" onClick={ event => setOpenId(reading.corp.id) }>
            <div className="phone-stocks-row-main">
                <div className="phone-stocks-lead">
                    <div className="phone-stocks-tick">{ reading.corp.acronym }</div>
                    <div className="phone-stocks-corp">{ reading.corp.name }</div>
                </div>
                <Spark values={ reading.corp.samples.map(sample => sample.value) } draining={ reading.draining } />
                <div className="phone-stocks-tail">
                    <div className="phone-stocks-val">{ fmt(reading.corp.stock) }</div>
                    { chip(reading) }
                </div>
            </div>
            { (reading.corp.capacity > 0) &&
                <div className="phone-stocks-cap">
                    <div className="phone-stocks-cap-fill" style={ { width: `${ Math.min(100, Math.max(2, reading.fullness)) }%`, background: (reading.hasRoom ? '#e93a7d' : '#4b4359') } } />
                </div> }
        </div>
    );

    const header = (title: string, kicker: JSX.Element, onLead: () => void) => (
        <div className="phone-app-header">
            <div className="phone-app-header-lead">
                <div className="phone-tap phone-thread-back" onClick={ event => onLead() }>
                    <PhoneIcon icon="chevron-left" size={ 24 } />
                </div>
                <div>
                    { kicker }
                    <div className="phone-app-title">{ title }</div>
                </div>
            </div>
        </div>
    );

    // ---- one corporation ------------------------------------------------
    if(openReading)
    {
        const { corp, fullness, delta, pct, draining, hasRoom } = openReading;
        const values = corp.samples.map(sample => sample.value);
        const chartPoints = path(values, 300, 132, 14);
        const highs = values.length ? values : [ corp.stock ];

        return (
            <div className="phone-screen phone-app-screen phone-stocks">
                <div className="phone-app-scroll">
                    { header(corp.acronym, <div className="phone-app-kicker">STOCKS</div>, () => setOpenId(0)) }
                    <div className="phone-stocks-detail">
                        <div className="phone-stocks-dcorp">{ corp.name }</div>
                        <div className="phone-stocks-dval">
                            { fmt(corp.stock) } <span>{ corp.capacity ? `of ${ fmt(corp.capacity) }` : 'in store' }</span>
                        </div>
                        { (corp.capacity > 0) &&
                            <>
                                <div className="phone-stocks-dfull">
                                    <b>{ `${ Math.round(fullness) }% full` }</b>
                                    <span>room for { fmt(Math.max(0, corp.capacity - corp.stock)) }</span>
                                </div>
                                <div className="phone-stocks-dcap">
                                    <div className="phone-stocks-cap-fill" style={ { width: `${ Math.min(100, Math.max(2, fullness)) }%`, background: (hasRoom ? '#e93a7d' : '#4b4359') } } />
                                </div>
                            </> }
                        <div className="phone-stocks-dchg" style={ { color: (draining ? '#e93a7d' : 'var(--ph-soft)') } }>
                            { `${ delta > 0 ? '+' : '' }${ fmt(delta) } (${ pct > 0 ? '+' : '' }${ pct.toFixed(2) }%)` }
                            <span>· updated { seconds }s ago</span>
                        </div>
                    </div>
                    { draining &&
                        <div className="phone-stocks-banner"><b>Buying — stores are draining</b></div> }
                    <div className="phone-stocks-seg">
                        { STOCK_WINDOWS.map(range => (
                            <div key={ range.key } className={ `phone-stocks-seg-opt phone-tap${ (range.minutes === windowMinutes) ? ' is-on' : '' }` } onClick={ event => setWindowMinutes(range.minutes) }>{ range.key }</div>
                        )) }
                    </div>
                    <div className="phone-stocks-chart">
                        { chartPoints
                            ? <svg viewBox="0 0 300 132" fill="none" preserveAspectRatio="none">
                                <polyline points={ chartPoints } stroke={ draining ? '#e93a7d' : '#6b6280' } strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            : <div className="phone-stocks-nochart">Not enough readings yet.</div> }
                    </div>
                    <div className="phone-stocks-stats">
                        <div><span>Window high</span><b>{ fmt(Math.max(...highs)) }</b></div>
                        <div><span>Window low</span><b>{ fmt(Math.min(...highs)) }</b></div>
                        <div><span>Capacity</span><b>{ corp.capacity ? fmt(corp.capacity) : '—' }</b></div>
                    </div>
                    <div className="phone-stocks-desc">{ corp.description }</div>
                    <div className="phone-scroll-spacer" />
                </div>
            </div>
        );
    }

    // ---- the board ------------------------------------------------------
    const needs = readings.filter(reading => reading.hasRoom);
    const stocked = readings.filter(reading => !reading.hasRoom);

    return (
        <div className="phone-screen phone-app-screen phone-stocks">
            <div className="phone-app-scroll">
                { header('Stocks', null, () => (onBack && onBack())) }
                { !corps &&
                    <div className="phone-stocks-empty">Reading the board…</div> }
                { (!!corps && !readings.length) &&
                    <div className="phone-stocks-empty">No corporations are trading yet.</div> }
                <div className="phone-stocks-list">
                    { (needs.length > 0) &&
                        <>
                            <div className="phone-section-label">NEEDS STOCK</div>
                            <div className="phone-stocks-group">{ needs.map(row) }</div>
                        </> }
                    { (stocked.length > 0) &&
                        <>
                            <div className="phone-section-label">WELL STOCKED</div>
                            <div className="phone-stocks-group">{ stocked.map(row) }</div>
                        </> }
                </div>
                <div className="phone-scroll-spacer" />
            </div>
        </div>
    );
}
