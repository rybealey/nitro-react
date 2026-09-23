import { FC, KeyboardEvent, ReactElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

// How long an optimistic bubble may sit unconfirmed before we stop drawing it.
// The server echoes the real message back within a round trip; anything still
// pending after this lost its packet, and a bubble that lies about having sent
// is worse than one that disappears.
const PENDING_TIMEOUT = 8000;

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
    // Lines this viewer has sent that the server has not echoed back yet. They
    // render immediately and are reconciled away by the next view: a chat that
    // waits a round trip before showing your own words reads as broken.
    const [ pending, setPending ] = useState<SupportMessage[]>([]);
    const [ openId, setOpenId ] = useState<number>(0);
    const [ screen, setScreen ] = useState<Screen>('list');
    // Which way the last move went, so a screen slides in from the side it
    // came from - the same 26ms-per-30px feel as the phone's own transitions.
    const [ nav, setNav ] = useState<'fwd' | 'back'>('fwd');
    // Bumped on every NAVIGATION, and never by arriving data. It is the
    // animation wrapper's key, so the slide plays once per move and a message
    // landing mid-conversation does not replay it.
    const [ navSeq, setNavSeq ] = useState<number>(0);
    const [ category, setCategory ] = useState<string>('report');
    const [ draft, setDraft ] = useState<string>('');
    const [ reply, setReply ] = useState<string>('');
    const scrollRef = useRef<HTMLDivElement>(null);
    // Whether this conversation has already been laid out once, so the first
    // paint jumps to the bottom and later messages glide there.
    const settledRef = useRef<boolean>(false);

    // Braces, not a concise arrow body: SendMessageComposer returns a value and
    // React would take it for a cleanup function.
    useEffect(() =>
    {
        SendMessageComposer(new RpSupportOpenComposer(0));
    }, []);

    // A view is authoritative for a conversation only when it carries one.
    //
    // THIS IS THE BUG THAT MADE CHATS FLICKER EMPTY. The packet is whole-state,
    // so a refresh with openThreadId 0 used to overwrite the open conversation
    // with an empty message list - which is exactly what every push generated
    // by the OTHER person's message looked like. The server now remembers what
    // each viewer has open, and this is the belt to that braces.
    const applyMessages = (openThreadId: number, incoming: SupportMessage[]) =>
    {
        if(openThreadId > 0)
        {
            setOpenId(openThreadId);
            setMessages(incoming);
            // Anything the server has now said back is no longer pending.
            setPending(prevValue => prevValue.filter(entry => !incoming.some(message => ((message.body === entry.body) && (message.fromStaff === entry.fromStaff)))));

            return;
        }

        // No conversation in this payload: only safe to clear when the viewer
        // is not sitting in one.
        setOpenId(prevValue =>
        {
            if(!prevValue) setMessages([]);

            return prevValue;
        });
    }

    useMessageEvent<RpSupportEvent>(RpSupportEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setIsStaff(false);
        setByline(parser.byline);
        setOnline(parser.online);
        setThreads(parser.threads);
        applyMessages(parser.openThreadId, parser.messages);
    });

    useMessageEvent<RpSupportQueueEvent>(RpSupportQueueEvent, event =>
    {
        const parser = event.getParser();

        if(!parser) return;

        setIsStaff(true);
        setAvailable(parser.available);
        setAvailableStaff(parser.availableStaff);
        setThreads(parser.threads);
        applyMessages(parser.openThreadId, parser.messages);
    });

    // A bubble whose packet went missing must not sit there looking sent.
    useEffect(() =>
    {
        if(!pending.length) return;

        const timer = window.setTimeout(() => setPending(prevValue => prevValue.filter(entry => ((Date.now() - (entry.createdAt * 1000)) < PENDING_TIMEOUT))), PENDING_TIMEOUT);

        return () => window.clearTimeout(timer);
    }, [ pending ]);

    const shown = useMemo(() => [ ...messages, ...pending ], [ messages, pending ]);

    useLayoutEffect(() =>
    {
        const element = scrollRef.current;

        if(!element || (screen !== 'thread')) return;

        // Straight to the bottom the first time this conversation paints, and
        // eased from then on so an arriving reply reads as arriving.
        element.scrollTo({ top: element.scrollHeight, behavior: (settledRef.current ? 'smooth' : 'auto') });
        settledRef.current = true;
    }, [ screen, shown ]);

    const open = useMemo(() => threads.find(thread => (thread.id === openId)) ?? null, [ threads, openId ]);

    // Every navigation goes through this: it is what makes the slide play, and
    // what keeps the direction and the animation key in step.
    const go = (next: Screen, direction: 'fwd' | 'back') =>
    {
        setNav(direction);
        setScreen(next);
        setNavSeq(value => (value + 1));
        settledRef.current = false;
    }

    const openThread = (id: number) =>
    {
        setOpenId(id);
        setPending([]);
        setReply('');
        go('thread', 'fwd');
        SendMessageComposer(new RpSupportOpenComposer(id));
    }

    const backToList = () =>
    {
        setOpenId(0);
        setPending([]);
        go('list', 'back');
        SendMessageComposer(new RpSupportOpenComposer(0));
    }

    const queueBubble = (body: string, fromStaff: boolean) =>
        setPending(prevValue => [ ...prevValue, { id: -Date.now(), fromStaff, body, createdAt: Math.floor(Date.now() / 1000) } ]);

    const start = () =>
    {
        const body = draft.trim().substring(0, MAX_BODY);

        if(!body.length) return;

        SendMessageComposer(new RpSupportStartComposer(category, body));
        setDraft('');
        // The thread has no id until the server answers, so the screen opens on
        // the optimistic first line and the composer stays shut for that beat
        // rather than silently swallowing a second message.
        setOpenId(0);
        setPending([]);
        queueBubble(body, false);
        go('thread', 'fwd');
    }

    const send = () =>
    {
        const body = reply.trim().substring(0, MAX_BODY);

        if(!body.length || !openId) return;

        SendMessageComposer(new RpSupportSendComposer(openId, body));
        setReply('');
        queueBubble(body, isStaff);
    }

    const onReplyKey = (event: KeyboardEvent<HTMLInputElement>) =>
    {
        if(event.key !== 'Enter') return;

        event.preventDefault();
        send();
    }

    let body: ReactElement = null;

    // ---- staff ----------------------------------------------------------

    if(isStaff && (screen === 'list'))
    {
        const assigned = threads.filter(thread => ((thread.status === 'open') || (thread.status === 'offered')));
        const queued = threads.filter(thread => (thread.status === 'waiting'));

        body = (
            <div className="phone-screen phone-app-screen phone-support">
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

    else if(screen === 'list')
    {
        body = (
            <div className="phone-screen phone-app-screen phone-support">
                <div className="phone-app-scroll">
                    <div className="phone-app-header">
                        <div>
                            <div className="phone-app-kicker">PIXELRP SUPPORT</div>
                            <div className="phone-app-title">Support</div>
                        </div>
                        <div className="phone-tap phone-fab" title="Start a conversation" onClick={ event => go('compose', 'fwd') }>
                            <PhoneIcon icon="plus" size={ 16 } />
                        </div>
                    </div>

                    <div className="phone-tap phone-support-start" onClick={ event => go('compose', 'fwd') }>
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

    else if(screen === 'compose')
    {
        body = (
            <div className="phone-screen phone-app-screen phone-support">
                <div className="phone-app-scroll">
                    <div className="phone-support-bar">
                        <div className="phone-tap phone-support-back" onClick={ event => go('list', 'back') }>
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

    else
    {
        body = (
            <div className="phone-screen phone-app-screen phone-support">
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
                    { !shown.length &&
                        <div className="phone-support-blank">
                            <div className="phone-support-blank-mark"><PhoneIcon icon="life-ring" size={ 22 } /></div>
                            <div className="phone-support-blank-text">{ isStaff ? 'No messages yet.' : 'Say what happened and Trina will pick it up.' }</div>
                        </div> }
                    { shown.map(message => (
                        <div key={ message.id } className={ `phone-support-bubble${ (message.fromStaff === !isStaff) ? ' is-them' : ' is-me' }${ (message.id < 0) ? ' is-pending' : '' }` }>{ message.body }</div>
                    )) }
                    { !isStaff && !!open && (open.status === 'waiting') &&
                        <div className="phone-support-status">Delivered · waiting for a reply</div> }
                    { !isStaff && !!open && (open.status === 'resolved') &&
                        <div className="phone-support-status">This conversation is closed</div> }
                </div>

                { (!open || (open.status !== 'resolved')) &&
                    <div className="phone-support-composer">
                        <input type="text" className="phone-support-input" value={ reply } maxLength={ MAX_BODY } placeholder={ openId ? (isStaff ? 'Reply' : 'Message') : 'Sending…' } disabled={ !openId } onChange={ event => setReply(event.target.value) } onKeyDown={ onReplyKey } />
                        <button type="button" className="phone-support-send" aria-label="Send message" disabled={ !openId || !reply.trim().length } onClick={ event => send() }>
                            <PhoneIcon icon="arrow-up" size={ 15 } />
                        </button>
                    </div> }
            </div>
        );
    }

    // The animation lives on a WRAPPER, keyed by the navigation counter.
    //
    // It used to be a class on the screen itself, which never played: React
    // reuses that one element across screens, and swapping a class on a live
    // element does not restart a CSS animation. The keyframes also carry no
    // duration of their own - .phone-screen-anim is what supplies it - so
    // without this wrapper the name resolved to a 0s animation regardless.
    // Same pair, same key trick, as PhoneView uses between apps.
    return (
        <div key={ `${ screen }-${ navSeq }` } className={ `phone-screen-anim phone-anim-slide-${ (nav === 'fwd') ? 'right' : 'left' }` }>
            { body }
        </div>
    );
}
