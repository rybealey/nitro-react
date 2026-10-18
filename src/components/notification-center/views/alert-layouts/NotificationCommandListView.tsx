import { FC, useMemo, useState } from 'react';

const MARKER = 'This is the list of commands you have available:';

// The server writes a staff group's heading as "[Staff: Moderator]"
// (CommandListLayout.cs); a player group's is just "[General]".
const STAFF_PREFIX = 'Staff:';

// The rail's "All" item: every command this player has, staff or not. The
// window opens on it.
const ALL = -1;

// A command a VIP membership unlocks: the server starts its description with
// this, and the row shows a VIP tag instead.
const VIP_PREFIX = '[VIP]';

interface CommandRow
{
    command: string;
    params: string;
    description: string;
    vip: boolean;
}

interface CommandGroup
{
    // Position in the list: the rail can hold two groups of the same name
    // (Room & Furni under Player and under Staff), so the name is no key.
    id: number;
    name: string;
    staff: boolean;
    rows: CommandRow[];
}

// True when a MOTD payload is the `:commands` list (server prefixes it with the
// fixed marker line). Used to gate the window so no other alert is affected.
export const isCommandListText = (text: string): boolean => (text || '').trimStart().startsWith(MARKER);

// "%username% %ItemId%" -> "username item id". Optional ones ("[rank]") and
// plain words ("reset or batch on/off") read as they are.
const readableParams = (params: string): string => params
    .replace(/%([^%]+)%/g, (match, name: string) => name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();

// Parses the server text:
//   This is the list of commands you have available:
//   [Group] or [Staff: Group]
//   :key params - description
const parseCommandList = (text: string): CommandGroup[] =>
{
    const groups: CommandGroup[] = [];
    let current: CommandGroup = null;

    for(const raw of (text || '').split(/\r\n|\r|\n/))
    {
        const line = raw.trim();

        if(!line || (line === MARKER)) continue;

        const groupMatch = line.match(/^\[(.+)\]$/);

        if(groupMatch)
        {
            const heading = groupMatch[1].trim();
            const staff = heading.startsWith(STAFF_PREFIX);

            current = { id: groups.length, name: (staff ? heading.slice(STAFF_PREFIX.length).trim() : heading), staff, rows: [] };
            groups.push(current);
            continue;
        }

        if(!line.startsWith(':')) continue;

        const sep = line.indexOf(' - ');
        const left = ((sep >= 0) ? line.slice(0, sep) : line).trim(); // ":key params"
        let description = ((sep >= 0) ? line.slice(sep + 3) : '').trim();
        const vip = description.startsWith(VIP_PREFIX);

        if(vip) description = description.slice(VIP_PREFIX.length).trim();
        const space = left.indexOf(' ');
        const command = ((space >= 0) ? left.slice(0, space) : left).trim(); // ":key"
        const params = readableParams((space >= 0) ? left.slice(space + 1) : '');

        if(!current)
        {
            current = { id: groups.length, name: 'Commands', staff: false, rows: [] };
            groups.push(current);
        }

        current.rows.push({ command, params, description, vip });
    }

    return groups;
};

const countLabel = (count: number): string => ((count === 1) ? '1 command' : `${ count } commands`);

interface NotificationCommandListViewProps
{
    text: string;
}

export const NotificationCommandListView: FC<NotificationCommandListViewProps> = props =>
{
    const { text = '' } = props;
    const [ filter, setFilter ] = useState<string>('');
    const [ picked, setPicked ] = useState<number>(null);

    const groups = useMemo(() => parseCommandList(text), [ text ]);
    const playerGroups = useMemo(() => groups.filter(group => !group.staff), [ groups ]);
    const staffGroups = useMemo(() => groups.filter(group => group.staff), [ groups ]);

    // The server only sends staff groups to staff (Trial Moderator and up),
    // so a staff group in the list is the staff test.
    const isStaff = (staffGroups.length > 0);
    const query = filter.trim().toLowerCase().replace(/^:/, '');
    const searching = (query.length > 0);

    const selected = groups.some(group => group.id === picked) ? picked : ALL;

    // A search looks through every group, whichever one is open.
    const shown = useMemo(() =>
    {
        if(searching)
        {
            return groups
                .map(group => ({ ...group, rows: group.rows.filter(row => `${ row.command } ${ row.params } ${ row.description }`.toLowerCase().includes(query)) }))
                .filter(group => group.rows.length > 0);
        }

        return (selected === ALL) ? groups : groups.filter(group => group.id === selected);
    }, [ groups, query, searching, selected ]);

    const total = shown.reduce((count, group) => (count + group.rows.length), 0);
    const showHeads = (searching || (selected === ALL));
    const active = (searching ? ALL : selected);

    const pick = (id: number) =>
    {
        setPicked(id);
        setFilter('');
    };

    const railItem = (id: number, name: string, count: number) => (
        <button key={ id } type="button" className={ `rp-cmds-rail-item${ (active === id) ? ' is-active' : '' }` } aria-current={ (active === id) ? 'true' : undefined } onClick={ () => pick(id) }>
            <span className="rp-cmds-rail-name">{ name }</span>
            <span className="rp-cmds-rail-count">{ count }</span>
        </button>
    );

    return (
        <div className="rp-cmds">
            <nav className="rp-cmds-rail" aria-label="Command groups">
                <div className="rp-cmds-eyebrow"><span>Player</span><span className="rp-cmds-eyebrow-line" /></div>
                { railItem(ALL, 'All', groups.reduce((count, group) => (count + group.rows.length), 0)) }
                { playerGroups.map(group => railItem(group.id, group.name, group.rows.length)) }
                { isStaff &&
                    <>
                        <div className="rp-cmds-eyebrow is-later"><span>Staff</span><span className="rp-cmds-eyebrow-line" /></div>
                        { staffGroups.map(group => railItem(group.id, group.name, group.rows.length)) }
                    </> }
            </nav>
            <div className="rp-cmds-page">
                <div className="rp-cmds-search-row">
                    <label className="rp-cmds-search">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" /></svg>
                        <input type="text" aria-label="Search commands" placeholder="Search commands" value={ filter } onChange={ event => setFilter(event.target.value) } />
                    </label>
                    <span className="rp-cmds-count">{ countLabel(total) }</span>
                </div>
                <div className="rp-cmds-list">
                    { (total === 0) &&
                        <div className="rp-cmds-empty">{ searching ? `No commands match “${ filter.trim() }”.` : 'No commands here.' }</div> }
                    { shown.map(group => (
                        <div key={ group.id } className="rp-cmds-group">
                            { showHeads &&
                                <div className="rp-cmds-head">
                                    <span>{ group.name }</span>
                                    <span className="rp-cmds-head-count">{ group.rows.length }</span>
                                </div> }
                            <div className="rp-cmds-rows">
                                { group.rows.map(row => (
                                    <div key={ row.command } className="rp-cmds-row">
                                        <div className="rp-cmds-key">
                                            <span className="rp-cmds-command">{ row.command }</span>
                                            { (row.params.length > 0) && <> <span className="rp-cmds-params">{ row.params }</span></> }
                                            { row.vip && <> <span className="rp-cmds-vip">VIP</span></> }
                                        </div>
                                        <div className="rp-cmds-desc">{ row.description }</div>
                                    </div>
                                )) }
                            </div>
                        </div>
                    )) }
                </div>
            </div>
        </div>
    );
}
