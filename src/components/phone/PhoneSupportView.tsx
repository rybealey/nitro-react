import { FC, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SendMessageComposer } from '../../api';
import { RpSupportAvailabilityComposer, RpSupportEvent, RpSupportOpenComposer, RpSupportQueueEvent, RpSupportSendComposer, RpSupportStaffComposer, RpSupportStartComposer, SUPPORT_CATEGORIES, SupportByline, SupportCategoryLabel, SupportMessage, SupportThread } from '../../api/rp-phone/RpSupportMessages';
import { useMessageEvent } from '../../hooks';
import { PhoneIcon } from './PhoneIcon';

// Support app: a player opens a conversation and it goes into one queue, which
// is offered to staff in turn. The player always talks to TRINA - the same
// newsroom byline the News app publishes anonymous stories under - so nothing
// here ever renders a staff name on the player's side. It could not: the
// player's packet carries no field for one.
//
// Staff get a different screen from the same app: the queue, their own
// availability toggle, and the real names on both ends.

interface PhoneSupportViewProps
{
    onBack: () => void;
}

type Screen = 'list' | 'thread' | 'compose';

const MAX_BODY = 1000;

export const PhoneSupportView: FC<PhoneSupportViewProps> = props =>
{
    const { onBack = null } = props;

    const [ isStaff, setIsStaff ] = useState<boolean>(false);
    const [ byline, setByline ] = useState<SupportByline>({ id: 0, name: 'Trina', figure: '' });
    const [ online, setOnline ] = useState<boolean>(false);
    const [ available, setAvailable ] = useState<boolean>(false);
    const [ availableStaff, setAvailableStaff ] = useState<number>(0);
    const [ threads, setThreads ] = useState<SupportThread[]>([]);
    const [ messages, setMessages ] = useState<SupportMessage[]>([]);
    const [ openId, setOpenId ] = useState<number>(0);
    const [ screen, setScreen ] = useState<Screen>('list');
    // Which way the last move went, so a screen slides in from the side it
    // came from - the same 26ms-per-30px feel as the phone's own transitions.
    const [ nav, setNav ] = useState<'fwd' | 'back'>('fwd');
    const [ category, setCategory ] = useState<string>('report');
    const [ draft, setDraft ] = useState<string>('');
    const [ reply, setReply ] = useState<string>('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Braces, not a concise arrow body: SendMessageComposer returns a value and
    // React would take it for a cleanup function.
    useEffect(() =>
    {
        SendMessageComposer(new RpSupportOpenComposer(0));
    }, []);

    useMessageEvent<RpSupportEvent>(RpSupportEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setIsStaff(false);
        setByline(parser.byline);
        setOnline(parser.online);
        setThreads(parser.threads);
        setMessages(parser.messages);

        if(parser.openThreadId) setOpenId(parser.openThreadId);
    });

    useMessageEvent<RpSupportQueueEvent>(RpSupportQueueEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setIsStaff(true);
        setAvailable(parser.available);
        setAvailableStaff(parser.availableStaff);
        setThreads(parser.threads);
        setMessages(parser.messages);

        if(parser.openThreadId) setOpenId(parser.openThreadId);
    });

    useLayoutEffect(() =>
    {
        const element = scrollRef.current;

        if(!element || (screen !== 'thread')) return;

        element.scrollTop = element.scrollHeight;
    }, [ screen, messages ]);

    // phone-slide-right enters from the right (going deeper), -left from the
    // left (coming back), which is the same pair PhoneView uses between apps.
    const anim = ((nav === 'fwd') ? ' phone-anim-slide-right' : ' phone-anim-slide-left');

    const open = useMemo(() => threads.find(thread => (thread.id === openId)) ?? null, [ threads, openId ]);

    const openThread = (id: number) =>
    {
        setNav('fwd');
        setOpenId(id);
        setScreen('thread');
        setReply('');
        SendMessageComposer(new RpSupportOpenComposer(id));
    }

    const backToList = () =>
    {
        setNav('back');
        setOpenId(0);
        setScreen('list');
        SendMessageComposer(new RpSupportOpenComposer(0));
    }

    const start = () =>
    {
        const body = draft.trim();

        if(!body.length) return;

        SendMessageComposer(new RpSupportStartComposer(category, body.substring(0, MAX_BODY)));
        setDraft('');
        setNav('fwd');
        setScreen('thread');
    }

    const send = () =>
    {
        const body = reply.trim();

        if(!body.length || !openId) return;

        SendMessageComposer(new RpSupportSendComposer(openId, body.substring(0, MAX_BODY)));
        setReply('');
    }

    const onReplyKey = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if(event.key !== 'Enter') return;

        event.preventDefault();
        send();
    }

    const waiting = useMemo(() => threads.filter(thread => (thread.status !== 'resolved')), [ threads ]);
    const mine = useMemo(() => threads.filter(thread => (thread.status === 'open')), [ threads ]);

    // ---- staff ----------------------------------------------------------

    if(isStaff && (screen === 'list'))
    {
        const assigned = threads.filter(thread => ((thread.status === 'open') || (thread.status === 'offered')));
        const queued = threads.filter(thread => (thread.status === 'waiting'));

        return (
            <div className={ `phone-screen phone-app-screen phone-support${ anim }` }>
                <div className="phone-app-scroll">
                    <div className="phone-app-header">
                        <div>
                            <div className="phone-app-kicker">PIXELRP SUPPORT · STAFF</div>
                            <div className="phone-app-title">Queue</div>
                        </div>
                    </div>

                    <div className={ `phone-support-duty${ available ? ' is-on' : '' }` }>
                        <div className="phone-support-duty-text">
                            <div className="phone-support-duty-title">{ available ? 'Taking chats' : 'Not taking chats' }</div>
                            <div className="phone-support-duty-sub">{ availableStaff } { availableStaff === 1 ? 'person' : 'people' } on support</div>
                        </div>
                        <button type="button" role="switch" aria-checked={ available } aria-label="Taking chats" className={ `phone-support-switch${ available ? ' is-on' : '' }` } onClick={ event => SendMessageComposer(new RpSupportAvailabilityComposer(!available)) }>
                            <span className="phone-support-knob" />
                        </button>
                    </div>

                    <div className="phone-section-label">ASSIGNED TO YOU</div>
                    { !assigned.length &&
                        <div className="phone-support-empty">Nothing open.</div> }
                    { assigned.map(thread => (
                        <div key={ thread.id } className="phone-tap phone-support-row is-mine" onClick={ event => openThread(thread.id) }>
                            <div className="phone-support-row-main">
                                <div className="phone-support-row-top">
                                    <span className="phone-support-row-name">{ thread.playerName }</span>
                                    { (thread.status === 'offered') &&
                                        <span className="phone-support-chip is-offer">OFFERED</span> }
                                </div>
                                <div className="phone-support-row-meta">{ SupportCategoryLabel(thread.category) }</div>
                                <div className="phone-support-row-last">{ thread.lastBody }</div>
                            </div>
                        </div>
                    )) }

                    <div className="phone-section-label">WAITING</div>
                    { !queued.length &&
                        <div className="phone-support-empty">Queue is clear.</div> }
                    { queued.map(thread => (
                        <div key={ thread.id } className="phone-tap phone-support-row" onClick={ event => openThread(thread.id) }>
                            <div className="phone-support-row-main">
                                <div className="phone-support-row-top">
                                    <span className="phone-support-row-name">{ thread.playerName }</span>
                                    { !!thread.staffName &&
                                        <span className="phone-support-chip">{ thread.staffName }</span> }
                                </div>
                                <div className="phone-support-row-meta">{ SupportCategoryLabel(thread.category) }</div>
                                <div className="phone-support-row-last">{ thread.lastBody }</div>
                            </div>
                        </div>
                    )) }
                </div>
            </div>
        );
    }

    // ---- the player's list ----------------------------------------------

    if(screen === 'list')
    {
        return (
            <div className={ `phone-screen phone-app-screen phone-support${ anim }` }>
                <div className="phone-app-scroll">
                    <div className="phone-app-header">
                        <div>
                            <div className="phone-app-kicker">PIXELRP SUPPORT</div>
                            <div className="phone-app-title">Support</div>
                        </div>
                        <div className="phone-tap phone-fab" title="Start a conversation" onClick={ event => { setNav('fwd'); setScreen('compose'); } }>
                            <PhoneIcon icon="plus" size={ 16 } />
                        </div>
                    </div>

                    <div className="phone-tap phone-support-start" onClick={ event => { setNav('fwd'); setScreen('compose'); } }>
                        <PhoneIcon icon="comment-dots" size={ 18 } />
                        <div className="phone-support-start-text">
                            <div className="phone-support-start-title">Start a conversation</div>
                            <div className="phone-support-start-sub">{ online ? 'Trina is online now' : 'Trina will reply when someone is free' }</div>
                        </div>
                    </div>

                    <div className="phone-section-label">YOUR REQUESTS</div>
                    { !threads.length &&
                        <div className="phone-support-empty">Nothing yet.</div> }
                    { threads.map(thread => (
                        <div key={ thread.id } className="phone-tap phone-support-row" onClick={ event => openThread(thread.id) }>
                            <div className={ `phone-support-avatar${ (thread.status === 'resolved') ? ' is-done' : '' }` }>
                                <PhoneIcon icon={ (thread.status === 'resolved') ? 'check' : 'user' } size={ 16 } />
                            </div>
                            <div className="phone-support-row-main">
                                <div className="phone-support-row-top">
                                    <span className="phone-support-row-name">{ (thread.status === 'resolved') ? 'Closed by Trina' : byline.name }</span>
                                </div>
                                <div className="phone-support-row-meta">{ SupportCategoryLabel(thread.category) }</div>
                                <div className="phone-support-row-last">{ thread.lastBody }</div>
                            </div>
                        </div>
                    )) }
                </div>
            </div>
        );
    }

    // ---- a new request ---------------------------------------------------

    if(screen === 'compose')
    {
        return (
            <div className={ `phone-screen phone-app-screen phone-support${ anim }` }>
                <div className="phone-app-scroll">
                    <div className="phone-support-bar">
                        <div className="phone-tap phone-support-back" onClick={ event => { setNav('back'); setScreen('list'); } }>
                            <PhoneIcon icon="chevron-left" size={ 16 } />
                        </div>
                        <div className="phone-support-bar-title">New request</div>
                    </div>

                    <div className="phone-support-lede">Pick what this is about so Trina opens with the right details.</div>

                    { SUPPORT_CATEGORIES.map(entry => (
                        <div key={ entry.id } className={ `phone-tap phone-support-cat${ (category === entry.id) ? ' is-on' : '' }` } onClick={ event => setCategory(entry.id) }>
                            <div className="phone-support-cat-text">
                                <div className="phone-support-cat-title">{ entry.label }</div>
                                <div className="phone-support-cat-hint">{ entry.hint }</div>
                            </div>
                            { (category === entry.id) &&
                                <PhoneIcon icon="check" size={ 15 } /> }
                        </div>
                    )) }

                    <label className="phone-section-label" htmlFor="phone-support-first">WHAT HAPPENED</label>
                    <textarea id="phone-support-first" className="phone-support-text" rows={ 4 } maxLength={ MAX_BODY } value={ draft } placeholder="Tell us in your own words. Names and room help." onChange={ event => setDraft(event.target.value) } />
                    <div className="phone-support-note">Your room and username are attached automatically.</div>

                    <button type="button" className="phone-support-send-btn" disabled={ !draft.trim().length } onClick={ event => start() }>Send to Trina</button>
                </div>
            </div>
        );
    }

    // ---- one conversation -------------------------------------------------

    return (
        <div className={ `phone-screen phone-app-screen phone-support${ anim }` }>
            <div className="phone-support-bar">
                <div className="phone-tap phone-support-back" onClick={ event => backToList() }>
                    <PhoneIcon icon="chevron-left" size={ 16 } />
                </div>
                <div className="phone-support-bar-main">
                    <div className="phone-support-bar-title">{ isStaff ? (open?.playerName ?? 'Conversation') : byline.name }</div>
                    <div className="phone-support-bar-sub">{ isStaff ? SupportCategoryLabel(open?.category ?? 'other') : 'PixelRP Support' }</div>
                </div>
                { isStaff && !!open && (open.status !== 'resolved') &&
                    <div className="phone-tap phone-support-resolve" onClick={ event => { SendMessageComposer(new RpSupportStaffComposer(1, open.id)); backToList(); } }>Resolve</div> }
            </div>

            <div ref={ scrollRef } className="phone-support-thread">
                { !messages.length &&
                    <div className="phone-support-blank">
                        <div className="phone-support-blank-mark"><PhoneIcon icon="life-ring" size={ 22 } /></div>
                        <div className="phone-support-blank-text">{ isStaff ? 'No messages yet.' : 'Say what happened and Trina will pick it up.' }</div>
                    </div> }
                { messages.map(message => (
                    <div key={ message.id } className={ `phone-support-bubble${ (message.fromStaff === !isStaff) ? ' is-them' : ' is-me' }` }>{ message.body }</div>
                )) }
                { !isStaff && !!open && (open.status === 'waiting') &&
                    <div className="phone-support-status">Delivered · waiting for a reply</div> }
                { !isStaff && !!open && (open.status === 'resolved') &&
                    <div className="phone-support-status">This conversation is closed</div> }
            </div>

            { (!open || (open.status !== 'resolved')) &&
                <div className="phone-support-composer">
                    <input type="text" className="phone-support-input" value={ reply } maxLength={ MAX_BODY } placeholder={ isStaff ? 'Reply' : 'Message' } onChange={ event => setReply(event.target.value) } onKeyDown={ onReplyKey } />
                    <button type="button" className="phone-support-send" aria-label="Send message" disabled={ !reply.trim().length } onClick={ event => send() }>
                        <PhoneIcon icon="arrow-up" size={ 15 } />
                    </button>
                </div> }
        </div>
    );
}
