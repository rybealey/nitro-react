import { FC, useMemo, useState } from 'react';
import { Base, Column } from '../../../../common';

const MARKER = 'This is the list of commands you have available:';

interface CommandRow
{
    command: string;
    params: string;
    description: string;
}

interface TierGroup
{
    tier: string;
    rows: CommandRow[];
}

// True when a MOTD payload is the `:commands` list (server prefixes it with the
// fixed marker line). Used to gate the table rendering so no other alert is
// affected.
export const isCommandListText = (text: string): boolean => (text || '').trimStart().startsWith(MARKER);

// Parses the server text:
//   This is the list of commands you have available:
//   [Tier]
//   :key params - description
const parseCommandList = (text: string): TierGroup[] =>
{
    const groups: TierGroup[] = [];
    let current: TierGroup = null;

    for(const raw of (text || '').split(/\r\n|\r|\n/))
    {
        const line = raw.trim();

        if(!line || (line === MARKER)) continue;

        const tierMatch = line.match(/^\[(.+)\]$/);

        if(tierMatch)
        {
            current = { tier: tierMatch[1], rows: [] };
            groups.push(current);
            continue;
        }

        if(!line.startsWith(':')) continue;

        const sep = line.indexOf(' - ');
        const left = ((sep >= 0) ? line.slice(0, sep) : line).trim();          // ":key params"
        const description = ((sep >= 0) ? line.slice(sep + 3) : '').trim();
        const space = left.indexOf(' ');
        const command = ((space >= 0) ? left.slice(0, space) : left).trim();   // ":key"
        const params = ((space >= 0) ? left.slice(space + 1) : '').trim();

        if(!current)
        {
            current = { tier: 'Commands', rows: [] };
            groups.push(current);
        }

        current.rows.push({ command, params, description });
    }

    return groups;
};

interface NotificationCommandListViewProps
{
    text: string;
}

export const NotificationCommandListView: FC<NotificationCommandListViewProps> = props =>
{
    const { text = '' } = props;
    const [ filter, setFilter ] = useState<string>('');

    const groups = useMemo(() => parseCommandList(text), [ text ]);

    const filtered = useMemo(() =>
    {
        const query = filter.trim().toLowerCase();

        if(!query) return groups;

        return groups
            .map(group => ({ ...group, rows: group.rows.filter(row => `${ row.command } ${ row.params } ${ row.description }`.toLowerCase().includes(query)) }))
            .filter(group => group.rows.length > 0);
    }, [ groups, filter ]);

    return (
        <Column gap={ 1 } overflow="hidden" className="command-list w-100">
            <input
                type="text"
                className="form-control form-control-sm command-list-filter"
                placeholder="Filter commands…"
                value={ filter }
                onChange={ event => setFilter(event.target.value) } />
            <Base className="command-list-scroll overflow-auto w-100">
                { (filtered.length === 0) &&
                    <Base className="command-list-empty">No commands match your filter.</Base> }
                { (filtered.length > 0) &&
                    <table className="command-table w-100">
                        <thead>
                            <tr>
                                <th>Command</th>
                                <th>Params</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        { filtered.map(group => (
                            <tbody key={ group.tier }>
                                <tr className="tier-row">
                                    <td colSpan={ 3 }>{ group.tier }</td>
                                </tr>
                                { group.rows.map((row, index) => (
                                    <tr key={ index } className="command-row">
                                        <td className="command-cell">{ row.command }</td>
                                        <td className="params-cell">{ row.params }</td>
                                        <td className="desc-cell">{ row.description }</td>
                                    </tr>
                                )) }
                            </tbody>
                        )) }
                    </table> }
            </Base>
        </Column>
    );
}
