import { FC, useEffect, useState } from 'react';
import { NotificationBubbleItem, NotificationBubbleType } from '../../../../api';
import { Base, Flex, LayoutNotificationBubbleView, LayoutNotificationBubbleViewProps, Text } from '../../../../common';

// Server-sent countdown token, e.g. "restarting in… %countdown:15% seconds."
// — the number ticks down locally once per second.
const COUNTDOWN_TOKEN = /%countdown:(\d+)%/;

// Links in an alert (:ha) can be clicked: http(s):// or www. up to the next
// space. Full stops, commas and closing brackets at the very end stay text, so
// "see https://pixelrp.co." links the address and not the full stop.
const LINK = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const LINK_TAIL = /[.,!?;:)\]]+$/;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The message is drawn as HTML (for the line breaks), so every piece of it is
// escaped first - the only real tags are the <a> and <br /> made here.
const toHtml = (text: string) =>
{
    let html = '';
    let last = 0;

    for(const match of text.matchAll(LINK))
    {
        const tail = (match[0].match(LINK_TAIL)?.[0] ?? '');
        const link = match[0].slice(0, (match[0].length - tail.length));

        if(link.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').length === 0) continue;

        const href = (/^https?:\/\//i.test(link) ? link : `https://${ link }`);

        html += escapeHtml(text.slice(last, match.index));
        html += `<a href="${ escapeHtml(href) }" target="_blank" rel="noopener noreferrer">${ escapeHtml(link) }</a>`;
        last = (match.index + link.length);
    }

    html += escapeHtml(text.slice(last));

    return html.replace(/\r\n|\r|\n/g, '<br />');
};

interface ToastVariant
{
    badge: string;
    classNames: string[];
    persistent: boolean;
}

const TOAST_VARIANTS: { [key: string]: ToastVariant } = {
    [NotificationBubbleType.PLATFORM]: { badge: 'City Hall', classNames: [ 'platform' ], persistent: false },
    [NotificationBubbleType.MODERATION]: { badge: 'Moderation', classNames: [ 'platform', 'moderation' ], persistent: true },
    [NotificationBubbleType.INFORMATION]: { badge: 'Information', classNames: [ 'platform', 'information' ], persistent: false }
};

export interface NotificationPlatformBubbleViewProps extends LayoutNotificationBubbleViewProps
{
    item: NotificationBubbleItem;
}

export const NotificationPlatformBubbleView: FC<NotificationPlatformBubbleViewProps> = props =>
{
    const { item = null, onClose = null, ...rest } = props;
    const countdownMatch = item.message.match(COUNTDOWN_TOKEN);
    const [ countdown, setCountdown ] = useState<number>(countdownMatch ? parseInt(countdownMatch[1]) : null);

    useEffect(() =>
    {
        if(countdown === null) return;

        const interval = setInterval(() => setCountdown(prev => ((prev > 0) ? (prev - 1) : 0)), 1000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const variant = (TOAST_VARIANTS[item.notificationType] || TOAST_VARIANTS[NotificationBubbleType.PLATFORM]);

    let messageText = item.message;

    if(countdownMatch)
    {
        if(countdown === 0)
        {
            // done counting: drop the whole "in… 0 seconds" phrase so the
            // sentence just ends at "restarting."
            messageText = messageText.replace(/\s*\bin\b\s*(…|\.\.\.)?\s*%countdown:\d+%\s*seconds?/, '');
        }
        else
        {
            messageText = messageText.replace(COUNTDOWN_TOKEN, String(countdown));

            if(countdown === 1) messageText = messageText.replace(/\bseconds\b/, 'second');
        }
    }

    const htmlText = toHtml(messageText);

    return (
        <LayoutNotificationBubbleView onClose={ onClose } fadesOut={ !variant.persistent } timeoutMs={ 45000 } column gap={ 1 } classNames={ variant.classNames } onClick={ null } { ...rest }>
            <Flex justifyContent="between" alignItems="center" fullWidth>
                <Base className="platform-badge no-select">{ variant.badge }</Base>
                <Base pointer className="platform-close no-select" onClick={ event => onClose() }>×</Base>
            </Flex>
            <Text wrap fullWidth variant="white" dangerouslySetInnerHTML={ { __html: htmlText } } />
        </LayoutNotificationBubbleView>
    );
}
