import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { CreateRoomSession, GetSessionDataManager, SendMessageComposer } from '../../api';
import { CalendarBirthday, CalendarEvent, RpCalendarEvent, RpDeleteCalendarEventComposer, RpGetCalendarComposer, RpSaveCalendarEventComposer } from '../../api/rp-phone/RpCalendarMessages';
import { useMessageEvent, useRoom } from '../../hooks';
import { PhoneIcon } from './PhoneIcon';

// Calendar app: an iOS-style day view. Staff-scheduled in-game events sit on
// an hourly timeline; birthdays (yours and your friends') sit in the all-day
// row. Everything is server-authoritative (RpCalendarEvent), and the server
// re-sends it to everyone after any staff change, so the view redraws live.
// Staff (canEdit) get a + button, and Edit / Delete on an event's sheet.

interface PhoneCalendarViewProps
{
    onBack: () => void;
}

const MONTHS: string[] = [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ];
const WEEKDAYS: string[] = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ];
const HOUR_PX = 44;
// the timeline covers the whole day, midnight to midnight
const FIRST_HOUR = 0;
const COLOURS: string[] = [ '#3f8fbf', '#8a3566', '#2ba88f', '#f0954a', '#e93a7d', '#8a8a90' ];
const ACCENT = '#f5352b';

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date, b: Date): boolean => ((a.getFullYear() === b.getFullYear()) && (a.getMonth() === b.getMonth()) && (a.getDate() === b.getDate()));
const formatTime = (unix: number): string => new Date(unix * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const hourLabel = (hour: number): string => `${ ((hour + 11) % 12) + 1 } ${ (hour >= 12) ? 'PM' : 'AM' }`;
// "16:30" -> unix seconds on the given day
const timeOn = (day: Date, hhmm: string): number =>
{
    const [ hours, minutes ] = hhmm.split(':').map(part => parseInt(part));

    return Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), (hours || 0), (minutes || 0)).getTime() / 1000);
}
const hhmm = (unix: number): string =>
{
    const date = new Date(unix * 1000);

    return `${ date.getHours().toString().padStart(2, '0') }:${ date.getMinutes().toString().padStart(2, '0') }`;
}

interface Draft
{
    id: number;
    title: string;
    description: string;
    starts: string;
    ends: string;
    roomId: number;
    colour: string;
    hostName: string;
}

export const PhoneCalendarView: FC<PhoneCalendarViewProps> = props =>
{
    const { onBack = null } = props;
    const { roomSession = null } = useRoom();
    const [ canEdit, setCanEdit ] = useState(false);
    const [ events, setEvents ] = useState<CalendarEvent[]>([]);
    const [ birthdays, setBirthdays ] = useState<CalendarBirthday[]>([]);
    const [ loaded, setLoaded ] = useState(false);
    const [ selected, setSelected ] = useState<Date>(() => startOfDay(new Date()));
    const [ openEventId, setOpenEventId ] = useState(0);
    const [ draft, setDraft ] = useState<Draft>(null);
    const [ confirmDelete, setConfirmDelete ] = useState(false);
    const [ now, setNow ] = useState(() => Date.now());
    // which way the last date change went, so the day slides in from that side
    const [ slideDir, setSlideDir ] = useState<'left' | 'right'>('right');

    const selectDay = (day: Date) =>
    {
        setSlideDir((day.getTime() >= selected.getTime()) ? 'right' : 'left');
        setSelected(day);
    }

    const ownId = GetSessionDataManager().userId;
    const ownName = (GetSessionDataManager().userName || 'You');

    useMessageEvent<RpCalendarEvent>(RpCalendarEvent, event =>
    {
        const parser = event.getParser();

        setCanEdit(parser.canEdit);
        setEvents(parser.events);
        setBirthdays(parser.birthdays);
        setLoaded(true);
        // a fresh list means a save/delete landed - close the editor
        setDraft(null);
        setConfirmDelete(false);
    });

    const scrollRef = useRef<HTMLDivElement>(null);
    const nowRef = useRef<HTMLDivElement>(null);

    useEffect(() =>
    {
        SendMessageComposer(new RpGetCalendarComposer());

        // the now line glides down the day: re-read the clock every 30s and
        // let the CSS transition carry it between readings
        const interval = setInterval(() => setNow(Date.now()), 30000);

        return () => clearInterval(interval);
    }, []);

    const today = startOfDay(new Date(now));
    const isToday = sameDay(selected, today);

    // opening on today (or coming back to it) lands the view on the now line,
    // the way a day view should - not on midnight
    useEffect(() =>
    {
        if(!isToday || !scrollRef.current || !nowRef.current) return;

        const container = scrollRef.current;
        const target = (nowRef.current.offsetTop + (container.querySelector<HTMLElement>('.phone-calendar-timeline')?.offsetTop ?? 0)) - (container.clientHeight * 0.45);

        container.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    }, [ isToday, selected ]);

    // the week strip shows the Sunday-to-Saturday week around the selected day
    const week = useMemo(() =>
    {
        const sunday = addDays(selected, -selected.getDay());

        return Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
    }, [ selected ]);

    const eventsOn = (day: Date) => events.filter(item => sameDay(new Date(item.startsAt * 1000), day)).sort((a, b) => (a.startsAt - b.startsAt));
    const birthdaysOn = (day: Date) => birthdays.filter(item => ((item.month === (day.getMonth() + 1)) && (item.day === day.getDate())));

    const dayEvents = eventsOn(selected);
    const dayBirthdays = birthdaysOn(selected);
    const firstHour = FIRST_HOUR;
    const hours = Array.from({ length: (24 - firstHour) + 1 }, (_, index) => (firstHour + index));
    const hourOffset = (unix: number) => ((new Date(unix * 1000).getHours() + (new Date(unix * 1000).getMinutes() / 60)) - firstHour);

    const openEvent = events.find(item => (item.id === openEventId)) ?? null;

    const newDraft = () => setDraft({ id: 0, title: '', description: '', starts: '19:00', ends: '20:30', roomId: (roomSession?.roomId ?? 0), colour: COLOURS[0], hostName: ownName });
    const editDraft = (item: CalendarEvent) =>
    {
        setSelected(startOfDay(new Date(item.startsAt * 1000)));
        setDraft({ id: item.id, title: item.title, description: item.description, starts: hhmm(item.startsAt), ends: hhmm(item.endsAt), roomId: item.roomId, colour: item.colour, hostName: item.hostName });
        setOpenEventId(0);
    }

    const canPost = (!!draft && (draft.title.trim().length > 0) && (timeOn(selected, draft.ends) > timeOn(selected, draft.starts)));

    const post = () =>
    {
        if(!canPost) return;

        SendMessageComposer(new RpSaveCalendarEventComposer(draft.id, draft.title.trim(), draft.description.trim(), timeOn(selected, draft.starts), timeOn(selected, draft.ends), draft.roomId, draft.colour, draft.hostName.trim()));
    }

    const remove = (item: CalendarEvent) =>
    {
        if(!confirmDelete)
        {
            setConfirmDelete(true);

            return;
        }

        SendMessageComposer(new RpDeleteCalendarEventComposer(item.id));
        setOpenEventId(0);
    }

    const goToRoom = (item: CalendarEvent) =>
    {
        if(item.roomId > 0) CreateRoomSession(item.roomId);

        setOpenEventId(0);
    }

    const titleFor = (day: Date) => (sameDay(day, today) ? `Today, ${ day.getDate() }` : `${ WEEKDAYS[day.getDay()] } ${ day.getDate() }`);

    return (
        <div className="phone-screen phone-app-screen phone-calendar">
            <div ref={ scrollRef } className="phone-app-scroll">
                <div className="phone-app-header">
                    <div className="phone-app-header-lead">
                        <div className="phone-tap phone-thread-back phone-calendar-back" onClick={ event => (onBack && onBack()) }>
                            <PhoneIcon icon="chevron-left" size={ 24 } />
                        </div>
                        <div>
                            <div className="phone-app-kicker phone-calendar-kicker">{ `${ MONTHS[selected.getMonth()] } ${ selected.getFullYear() }`.toUpperCase() }</div>
                            <div className="phone-app-title">{ titleFor(selected) }</div>
                        </div>
                    </div>
                    <div className="phone-calendar-header-actions">
                        { !isToday &&
                            <div className="phone-tap phone-calendar-today" onClick={ event => selectDay(today) }>Today</div> }
                        { canEdit &&
                            <div className="phone-tap phone-calendar-add" title="New event" onClick={ newDraft }>
                                <PhoneIcon icon="plus" size={ 16 } />
                            </div> }
                    </div>
                </div>
                <div key={ week[0].getTime() } className={ `phone-calendar-week is-from-${ slideDir }` }>
                    <div className="phone-tap phone-calendar-week-nav" onClick={ event => selectDay(addDays(selected, -7)) }><PhoneIcon icon="chevron-left" size={ 16 } /></div>
                    { week.map(day =>
                    {
                        const isSelected = sameDay(day, selected);
                        const busy = ((eventsOn(day).length > 0) || (birthdaysOn(day).length > 0));
                        const weekend = ((day.getDay() === 0) || (day.getDay() === 6));

                        return (
                            <div key={ day.getTime() } className={ `phone-tap phone-calendar-daycell${ isSelected ? ' is-selected' : '' }${ weekend ? ' is-weekend' : '' }${ sameDay(day, today) ? ' is-today' : '' }` } onClick={ event => selectDay(day) }>
                                <span className="phone-calendar-dayletter">{ WEEKDAYS[day.getDay()].charAt(0) }</span>
                                <span className="phone-calendar-daynum">{ day.getDate() }</span>
                                <span className={ `phone-calendar-daydot${ busy ? ' is-busy' : '' }` } />
                            </div>
                        );
                    }) }
                    <div className="phone-tap phone-calendar-week-nav" onClick={ event => selectDay(addDays(selected, 7)) }><PhoneIcon icon="chevron-right" size={ 16 } /></div>
                </div>
                { /* keyed by the day: a date change remounts this block and the
                     slide-in animation runs from the side you moved towards */ }
                <div key={ selected.getTime() } className={ `phone-calendar-day is-from-${ slideDir }` }>
                { (dayBirthdays.length > 0) &&
                    <div className="phone-calendar-allday">
                        <div className="phone-calendar-allday-label">all-day</div>
                        <div className="phone-calendar-allday-list">
                            { dayBirthdays.map(item => (
                                <div key={ item.userId } className="phone-calendar-birthday">
                                    <PhoneIcon icon="cake" size={ 12 } />
                                    <span>{ (item.userId === ownId) ? 'Your birthday' : `${ item.username }'s birthday` }</span>
                                </div>
                            )) }
                        </div>
                    </div> }
                { loaded && (dayEvents.length === 0) && (dayBirthdays.length === 0) &&
                    <div className="phone-calendar-empty">
                        <div className="phone-calendar-empty-title">Nothing on the { selected.getDate() }{ ([ 1, 21, 31 ].includes(selected.getDate()) ? 'st' : ([ 2, 22 ].includes(selected.getDate()) ? 'nd' : ([ 3, 23 ].includes(selected.getDate()) ? 'rd' : 'th'))) }</div>
                        <div className="phone-calendar-empty-sub">Staff post in-game events here. Friends' birthdays show up on the day once they set one.</div>
                    </div> }
                <div className="phone-calendar-timeline" style={ { height: `${ ((hours.length - 1) * HOUR_PX) + 16 }px` } }>
                    { hours.map(hour => (
                        <div key={ hour } className="phone-calendar-hour" style={ { top: `${ (hour - firstHour) * HOUR_PX }px` } }>
                            <span className="phone-calendar-hour-label">{ (hour === 24) ? '12 AM' : hourLabel(hour) }</span>
                            <span className="phone-calendar-hour-line" />
                        </div>
                    )) }
                    { dayEvents.map((item, index) =>
                    {
                        const top = (hourOffset(item.startsAt) * HOUR_PX) + 2;
                        const height = Math.max(26, (((item.endsAt - item.startsAt) / 3600) * HOUR_PX) - 4);

                        return (
                            <div key={ item.id } className="phone-tap phone-calendar-event" style={ { top: `${ top }px`, height: `${ height }px`, background: `${ item.colour }26`, borderLeftColor: item.colour, animationDelay: `${ 90 + (index * 45) }ms` } } onClick={ event => { setConfirmDelete(false); setOpenEventId(item.id); } }>
                                <div className="phone-calendar-event-title">{ item.title }</div>
                                { item.roomName &&
                                    <div className="phone-calendar-event-room"><PhoneIcon icon="map-pin-home" size={ 10 } />{ item.roomName }</div> }
                            </div>
                        );
                    }) }
                    { isToday &&
                        <div ref={ nowRef } className="phone-calendar-now" style={ { top: `${ ((new Date(now).getHours() + ((new Date(now).getMinutes() + (new Date(now).getSeconds() / 60)) / 60)) - firstHour) * HOUR_PX }px` } }>
                            <span className="phone-calendar-now-label">{ new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }</span>
                        </div> }
                </div>
                </div>
                <div className="phone-scroll-spacer" />
            </div>

            { /* ---- event sheet ------------------------------------------- */ }
            { openEvent &&
                <>
                    <div className="phone-calendar-scrim" onClick={ event => setOpenEventId(0) } />
                    <div className="phone-calendar-sheet">
                        <div className="phone-calendar-grabber" />
                        <div className="phone-calendar-sheet-head">
                            <div className="phone-calendar-sheet-bar" style={ { background: openEvent.colour } } />
                            <div className="phone-calendar-sheet-headtext">
                                <div className="phone-calendar-sheet-title">{ openEvent.title }</div>
                                <div className="phone-calendar-sheet-when">{ `${ WEEKDAYS[new Date(openEvent.startsAt * 1000).getDay()] } ${ new Date(openEvent.startsAt * 1000).getDate() } ${ MONTHS[new Date(openEvent.startsAt * 1000).getMonth()] } · ${ formatTime(openEvent.startsAt) } – ${ formatTime(openEvent.endsAt) }` }</div>
                            </div>
                            { canEdit &&
                                <div className="phone-tap phone-calendar-chip" onClick={ event => editDraft(openEvent) }>Edit</div> }
                        </div>
                        <div className="phone-calendar-sheet-body">
                            { openEvent.roomName &&
                                <div className="phone-calendar-sheet-row"><PhoneIcon icon="map-pin-home" size={ 14 } /><span>{ openEvent.roomName }</span></div> }
                            <div className="phone-calendar-sheet-row"><span className="phone-calendar-at">@</span><span>Hosted by { openEvent.hostName }</span>{ canEdit && openEvent.postedBy && <span className="phone-calendar-faint">· posted by { openEvent.postedBy }</span> }</div>
                            { openEvent.description &&
                                <div className="phone-calendar-sheet-desc">{ openEvent.description }</div> }
                        </div>
                        { (openEvent.roomId > 0) &&
                            <div className="phone-tap phone-calendar-primary" onClick={ event => goToRoom(openEvent) }>Go to { openEvent.roomName || 'the room' }</div> }
                        { canEdit &&
                            <div className="phone-tap phone-calendar-delete" onClick={ event => remove(openEvent) }>{ confirmDelete ? 'Tap again to delete' : 'Delete event' }</div> }
                    </div>
                </> }

            { /* ---- staff editor -------------------------------------------- */ }
            { draft &&
                <>
                    <div className="phone-calendar-scrim" onClick={ event => setDraft(null) } />
                    <div className="phone-calendar-sheet is-editor">
                        <div className="phone-calendar-editor-bar">
                            <span className="phone-tap phone-calendar-editor-cancel" onClick={ event => setDraft(null) }>Cancel</span>
                            <span className="phone-calendar-editor-title">{ draft.id ? 'Edit Event' : 'New Event' }</span>
                            <span className={ `phone-tap phone-calendar-editor-post${ canPost ? ' is-ready' : '' }` } onClick={ post }>{ draft.id ? 'Save' : 'Post' }</span>
                        </div>
                        <div className="phone-calendar-form">
                            <input className="phone-calendar-input phone-calendar-input--title" type="text" placeholder="Title" maxLength={ 64 } value={ draft.title } onChange={ event => setDraft({ ...draft, title: event.target.value }) } />
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Date</span>
                                <div className="phone-calendar-field-value phone-calendar-datenav">
                                    <span className="phone-tap" onClick={ event => selectDay(addDays(selected, -1)) }><PhoneIcon icon="chevron-left" size={ 14 } /></span>
                                    <span>{ `${ WEEKDAYS[selected.getDay()] } ${ selected.getDate() } ${ MONTHS[selected.getMonth()] }` }</span>
                                    <span className="phone-tap" onClick={ event => selectDay(addDays(selected, 1)) }><PhoneIcon icon="chevron-right" size={ 14 } /></span>
                                </div>
                            </div>
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Starts</span>
                                <input className="phone-calendar-input" type="time" value={ draft.starts } onChange={ event => setDraft({ ...draft, starts: event.target.value }) } />
                            </div>
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Ends</span>
                                <input className="phone-calendar-input" type="time" value={ draft.ends } onChange={ event => setDraft({ ...draft, ends: event.target.value }) } />
                            </div>
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Room</span>
                                <input className="phone-calendar-input" type="number" min={ 0 } placeholder="Room id" value={ draft.roomId || '' } onChange={ event => setDraft({ ...draft, roomId: (parseInt(event.target.value) || 0) }) } />
                                { (roomSession?.roomId > 0) && (draft.roomId !== roomSession.roomId) &&
                                    <span className="phone-tap phone-calendar-chip" onClick={ event => setDraft({ ...draft, roomId: roomSession.roomId }) }>This room</span> }
                            </div>
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Host</span>
                                <input className="phone-calendar-input" type="text" maxLength={ 32 } value={ draft.hostName } onChange={ event => setDraft({ ...draft, hostName: event.target.value }) } />
                            </div>
                            <div className="phone-calendar-field">
                                <span className="phone-calendar-field-label">Colour</span>
                                <div className="phone-calendar-swatches">
                                    { COLOURS.map(colour => (
                                        <span key={ colour } className={ `phone-tap phone-calendar-swatch${ (draft.colour === colour) ? ' is-picked' : '' }` } style={ { background: colour } } onClick={ event => setDraft({ ...draft, colour }) } />
                                    )) }
                                </div>
                            </div>
                            <textarea className="phone-calendar-input phone-calendar-input--notes" placeholder="What players should know…" maxLength={ 500 } value={ draft.description } onChange={ event => setDraft({ ...draft, description: event.target.value }) } />
                        </div>
                        <div className="phone-calendar-editor-note">{ draft.id ? 'Saving updates it on every player\'s calendar right away.' : 'Posting shows it on every player\'s calendar right away.' }</div>
                    </div>
                </> }
        </div>
    );
}
