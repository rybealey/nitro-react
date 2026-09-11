export interface IChatEntry
{
    id: number;
    webId: number;
    entityId: number;
    name: string;
    look?: string;
    message?: string;
    // the RAW message, before the chat formatter - what decides whether this
    // is a narrated bubble (IsNarratedBubble), so the Chat History window
    // renders it exactly as the in-room bubble did
    text?: string;
    entityType?: number;
    style?: number;
    chatType?: number;
    imageUrl?: string;
    color?: string;
    usernameColor?: string;
    usernameIcon?: string;
    usernameIconColor?: string;
    roomId: number;
    timestamp: string;
    type: number;
}
