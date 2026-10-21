// pixelrp: HTML from outside the client, made safe to put on the page.
//
// Notifications and Nitropedia pages are shown as HTML because their text
// carries formatting - bold words, line breaks, links - but some of that text
// is someone's own words (a Pay note inside a notification) or comes from a
// configured address. Shown as-is, any markup in it ran in every client that
// displayed it. This keeps simple formatting and drops everything else: unknown
// tags are unwrapped (their text stays), script-like tags go with their
// content, every event-handler attribute goes, and links and images keep only
// http(s), event: (the client's own link events) and relative addresses.
//
// Parsed in an inert document (DOMParser), so nothing in the input loads or
// runs while it is being cleaned.

const ALLOWED_TAGS = new Set([
    'A', 'B', 'BIG', 'BR', 'CENTER', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4', 'HR', 'I', 'IMG',
    'LI', 'OL', 'P', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL'
]);

const DROPPED_WITH_CONTENT = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT',
    'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META', 'BASE', 'AUDIO', 'VIDEO'
]);

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
    A: [ 'href', 'title' ],
    IMG: [ 'src', 'alt', 'title', 'width', 'height' ],
    FONT: [ 'color', 'size' ],
    TD: [ 'colspan', 'rowspan', 'align' ],
    TH: [ 'colspan', 'rowspan', 'align' ],
    P: [ 'align' ],
    DIV: [ 'align' ]
};

const URL_ATTRIBUTES = new Set([ 'href', 'src' ]);
const ALLOWED_SCHEMES = new Set([ 'http', 'https', 'event' ]);

// Browsers ignore whitespace and control characters inside a scheme
// ("java\tscript:"), so they are removed before it is read.
const isSafeUrl = (value: string): boolean =>
{
    const compact = value.replace(/[\u0000- \u007f-\u009f]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);

    return !scheme || ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

const cleanChildren = (parent: Node, allowStyles: boolean): void =>
{
    for(const node of Array.from(parent.childNodes))
    {
        if(node.nodeType === Node.TEXT_NODE) continue;

        if(node.nodeType !== Node.ELEMENT_NODE)
        {
            parent.removeChild(node);

            continue;
        }

        const element = node as Element;
        const tag = element.tagName.toUpperCase();

        if(DROPPED_WITH_CONTENT.has(tag))
        {
            parent.removeChild(element);

            continue;
        }

        cleanChildren(element, allowStyles);

        if(!ALLOWED_TAGS.has(tag))
        {
            while(element.firstChild) parent.insertBefore(element.firstChild, element);

            parent.removeChild(element);

            continue;
        }

        const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];

        for(const attribute of Array.from(element.attributes))
        {
            const name = attribute.name.toLowerCase();
            const keep = (name === 'class') || (allowStyles && (name === 'style')) || allowed.includes(name);

            if(!keep || (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value))) element.removeAttribute(attribute.name);
        }
    }
}

// allowStyles keeps inline style attributes: for our own pages (Nitropedia),
// never for text that can carry someone's words (notifications), where a style
// could lay a fake window over the game.
export const SanitizeHtml = (html: string, allowStyles: boolean = false): string =>
{
    if(!html) return '';

    const parsed = new DOMParser().parseFromString(`<body>${ html }</body>`, 'text/html');

    cleanChildren(parsed.body, allowStyles);

    return parsed.body.innerHTML;
}

// The words an HTML fragment shows, for putting it where markup must not go -
// e.g. a chat alert's sender, which is parsed out of the formatted (encoded)
// chat line but is shown as plain text.
export const HtmlToText = (html: string): string =>
{
    if(!html) return '';

    return new DOMParser().parseFromString(`<body>${ html }</body>`, 'text/html').body.textContent ?? '';
}
