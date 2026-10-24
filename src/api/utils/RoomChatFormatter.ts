const allowedColours: Map<string, string> = new Map();

allowedColours.set('r', 'red');
allowedColours.set('b', 'blue');
allowedColours.set('g', 'green');
allowedColours.set('y', 'yellow');
allowedColours.set('w', 'white');
allowedColours.set('o', 'orange');
allowedColours.set('c', 'cyan');
allowedColours.set('br', 'brown');
allowedColours.set('pr', 'purple');
allowedColours.set('pk', 'pink');

allowedColours.set('red', 'red');
allowedColours.set('blue', 'blue');
allowedColours.set('green', 'green');
allowedColours.set('yellow', 'yellow');
allowedColours.set('white', 'white');
allowedColours.set('orange', 'orange');
allowedColours.set('cyan', 'cyan');
allowedColours.set('brown', 'brown');
allowedColours.set('purple', 'purple');
allowedColours.set('pink', 'pink');

const encodeHTML = (str: string) =>
{
    return str.replace(/([\u00A0-\u9999<>&])(.|$)/g, (full, char, next) =>
    {
        if(char !== '&' || next !== '#')
        {
            if(/[\u00A0-\u9999<>&]/.test(next)) next = '&#' + next.charCodeAt(0) + ';';

            return '&#' + char.charCodeAt(0) + ';' + next;
        }

        return full;
    });
}

export const RoomChatFormatter = (content: string) =>
{
    content = encodeHTML(content);
    //content = (joypixels.shortnameToUnicode(content) as string)

    // pixelrp: a colour tag only at the very start ("@red@hello"). Any line
    // that began with "@" and had another "@" in it was read as a tag, and
    // when there was none - "@twist @jeen" - the line came out blank, ping
    // and all. A line without a colour tag now shows exactly as typed.
    const match = /^@([a-zA-Z]+)@/.exec(content);

    if(!match || !allowedColours.has(match[1])) return content;

    return '<span style="color: ' + allowedColours.get(match[1]) + '">' + content.substring(match[0].length) + '</span>';
}
