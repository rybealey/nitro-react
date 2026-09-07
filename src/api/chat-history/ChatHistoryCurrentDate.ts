import { HotelDate } from '../prefs/HotelTime';

export const ChatHistoryCurrentDate = () =>
{
    const currentTime = HotelDate();

    return `${ currentTime.getHours().toString().padStart(2, '0') }:${ currentTime.getMinutes().toString().padStart(2, '0') }:${ currentTime.getSeconds().toString().padStart(2, '0') }`;
}
