// A room's headquarters setup as the Room tool's Roleplay tab shows it: the
// corporation using the room, which of its ranks may work here, and which
// outside services may keep working here (RpRoomCorpEvent).
export interface RoomCorpState
{
    corpId: number;
    ranks: { rankId: number; rankOrder: number; rankName: string; authorized: boolean }[];
    allowMedical: boolean;
    allowPolice: boolean;
    allowStaff: boolean;
}
