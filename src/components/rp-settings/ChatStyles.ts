import { HabboClubLevelEnum, RoomControllerLevel } from '@nitrots/nitro-renderer';
import { GetClubMemberLevel, GetConfiguration, GetSessionDataManager } from '../../api';

// The chat bubble styles this player may pick, in ui-config's order. Shared by
// the bubble picker beside the chat box and Settings > Personalization > Chat
// Bubble, so the two can never offer different lists.
const ALL_STYLES_OPEN = true;

export const GetSelectableChatStyleIds = (): number[] =>
{
    const styleIds: number[] = [];

    const styles = GetConfiguration<{ styleId: number, minRank: number, isSystemStyle: boolean, isHcOnly: boolean, isAmbassadorOnly: boolean }[]>('chat.styles');

    // FOR NOW every style is open to every player (Twist, 2026-09-26): the
    // staff (minRank) and HC gates below are skipped. The gate cannot be
    // lifted in ui-config instead - beta's and prod's ui-config.json live only
    // on the VPS and no deploy touches them. The server side is emulator
    // migration 167, which clears every room_chat_styles required_right.
    // Set this false to bring the gates back.
    if(ALL_STYLES_OPEN) return styles.filter(style => !!style).map(style => style.styleId);

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
