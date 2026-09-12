import { FurnitureListItemParser, IObjectData } from '@nitrots/nitro-renderer';
import { GetRoomEngine } from '../nitro';
import { FurniCategory } from './FurniCategory';
import { FurnitureItem } from './FurnitureItem';
import { GroupItem } from './GroupItem';

export const createGroupItem = (type: number, category: number, stuffData: IObjectData, extra: number = NaN) => new GroupItem(type, category, GetRoomEngine(), stuffData, extra);

const addSingleFurnitureItem = (set: GroupItem[], item: FurnitureItem, unseen: boolean) =>
{
    const groupItems: GroupItem[] = [];

    for(const groupItem of set)
    {
        if(groupItem.type === item.type) groupItems.push(groupItem);
    }

    for(const groupItem of groupItems)
    {
        if(groupItem.getItemById(item.id)) return groupItem;
    }

    const groupItem = createGroupItem(item.type, item.category, item.stuffData, item.extra);

    groupItem.push(item);

    if(unseen)
    {
        groupItem.hasUnseenItems = true;

        set.unshift(groupItem);
    }
    else
    {
        set.push(groupItem);
    }

    return groupItem;
}

const addGroupableFurnitureItem = (set: GroupItem[], item: FurnitureItem, unseen: boolean) =>
{
    let existingGroup: GroupItem = null;

    for(const groupItem of set)
    {
        if((groupItem.type === item.type) && (groupItem.isWallItem === item.isWallItem) && groupItem.isGroupable)
        {
            if(item.category === FurniCategory.POSTER)
            {
                if(groupItem.stuffData.getLegacyString() === item.stuffData.getLegacyString())
                {
                    existingGroup = groupItem;

                    break;
                }
            }

            else if(item.category === FurniCategory.GUILD_FURNI)
            {
                if(item.stuffData.compare(groupItem.stuffData))
                {
                    existingGroup = groupItem;

                    break;
                }
            }

            else
            {
                existingGroup = groupItem;

                break;
            }
        }
    }

    if(existingGroup)
    {
        existingGroup.push(item);

        if(unseen)
        {
            existingGroup.hasUnseenItems = true;

            const index = set.indexOf(existingGroup);

            if(index >= 0) set.splice(index, 1);
            
            set.unshift(existingGroup);
        }

        return existingGroup;
    }

    existingGroup = createGroupItem(item.type, item.category, item.stuffData, item.extra);

    existingGroup.push(item);

    if(unseen)
    {
        existingGroup.hasUnseenItems = true;

        set.unshift(existingGroup);
    }
    else
    {
        set.push(existingGroup);
    }

    return existingGroup;
}

/**
 * PixelRP: newest first.
 *
 * The inventory's order is the order things were added to it, which after a
 * few months is the order you acquired them in - so the piece you just picked
 * up lands at the bottom of a grid you have to scroll, while something from
 * last spring sits in the corner your eye goes to.
 *
 * The highest item id is the most recently created row in `items`, so this is
 * "newest thing in the group, first". It is the right answer for a login,
 * where arrival order tells us nothing: everything arrived at once. While the
 * session is running, arrival order is better and takes over - see the add
 * handler in useInventoryFurni, which moves a group to the front as its items
 * come in.
 */
export const sortGroupItemsByNewest = (set: GroupItem[]) =>
{
    const newest = (group: GroupItem) =>
    {
        let highest = 0;

        for(const item of group.items) if(item.id > highest) highest = item.id;

        return highest;
    };

    set.sort((a, b) => (newest(b) - newest(a)));

    return set;
}

// Returns the group the item landed in - both helpers already produce it, and
// a caller that wants to move that group needs to know which one it is.
export const addFurnitureItem = (set: GroupItem[], item: FurnitureItem, unseen: boolean): GroupItem =>
{
    if(!item.isGroupable) return addSingleFurnitureItem(set, item, unseen);

    return addGroupableFurnitureItem(set, item, unseen);
}

export const mergeFurniFragments = (fragment: Map<number, FurnitureListItemParser>, totalFragments: number, fragmentNumber: number, fragments: Map<number, FurnitureListItemParser>[]) =>
{
    if(totalFragments === 1) return fragment;

    fragments[fragmentNumber] = fragment;

    for(const frag of fragments)
    {
        if(!frag) return null;
    }

    const merged: Map<number, FurnitureListItemParser> = new Map();

    for(const frag of fragments)
    {
        for(const [ key, value ] of frag) merged.set(key, value);

        frag.clear();
    }

    fragments = null;

    return merged;
}

export const getAllItemIds = (groupItems: GroupItem[]) =>
{
    const itemIds: number[] = [];

    for(const groupItem of groupItems)
    {
        let totalCount = groupItem.getTotalCount();

        if(groupItem.category === FurniCategory.POST_IT) totalCount = 1;

        let i = 0;

        while(i < totalCount)
        {
            itemIds.push(groupItem.getItemByIndex(i).id);

            i++;
        }
    }

    return itemIds;
}
