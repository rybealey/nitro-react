import { HabboClubLevelEnum, RoomControllerLevel } from '@nitrots/nitro-renderer';
import { GetClubMemberLevel, GetConfiguration, GetSessionDataManager } from '../../api';

// The chat bubble styles this player may pick, in ui-config's order. Shared by
// the bubble picker beside the chat box and Settings > Personalization > Chat
// Bubble, so the two can never offer different lists.
export const GetSelectableChatStyleIds = (): number[] =>
{
    const styleIds: number[] = [];

    const styles = GetConfiguration<{ styleId: number, minRank: number, isSystemStyle: boolean, isHcOnly: boolean, isAmbassadorOnly: boolean }[]>('chat.styles');

    for(const style of styles)
    {
        if(!style) continue;

        if(style.minRank > 0)
        {
            if(GetSessionDataManager().hasSecurity(style.minRank)) styleIds.push(style.styleId);

            continue;
        }

        if(style.isSystemStyle)
        {
            if(GetSessionDataManager().hasSecurity(RoomControllerLevel.MODERATOR))
            {
                styleIds.push(style.styleId);

                continue;
            }
        }

        if(GetConfiguration<number[]>('chat.styles.disabled').indexOf(style.styleId) >= 0) continue;

        if(style.isHcOnly && (GetClubMemberLevel() >= HabboClubLevelEnum.CLUB))
        {
            styleIds.push(style.styleId);

            continue;
        }

        if(style.isAmbassadorOnly && GetSessionDataManager().isAmbassador)
        {
            styleIds.push(style.styleId);

            continue;
        }

        if(!style.isHcOnly && !style.isAmbassadorOnly) styleIds.push(style.styleId);
    }

    return styleIds;
}
