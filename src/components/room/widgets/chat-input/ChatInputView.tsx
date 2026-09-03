import { HabboClubLevelEnum, RoomControllerLevel } from '@nitrots/nitro-renderer';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessageTypeEnum, GetClubMemberLevel, GetConfiguration, GetSessionDataManager, LocalizeText, ReplaceEmojiShortcodes, RoomWidgetUpdateChatInputContentEvent } from '../../../../api';
import { Text } from '../../../../common';
import { useChatInputWidget, useRoom, useSessionInfo, useUiEvent } from '../../../../hooks';
import { IsMouseBinding, MacroState, NormalizeKeyBinding, NormalizeMouseBinding } from '../../../../components/rp-settings/MacroState';
import { TargetState } from '../../../../hooks/rooms/targetState';
import { ChatInputEmojiSelectorView } from './ChatInputEmojiSelectorView';
import { ChatInputStyleSelectorView } from './ChatInputStyleSelectorView';

export const ChatInputView: FC<{}> = props =>
{
    const [ chatValue, setChatValue ] = useState<string>('');
    const { chatStyleId = 0, updateChatStyleId = null } = useSessionInfo();
    const { selectedUsername = '', floodBlocked = false, floodBlockedSeconds = 0, setIsTyping = null, setIsIdle = null, sendChat = null } = useChatInputWidget();
    const { roomSession = null } = useRoom();
    const inputRef = useRef<HTMLInputElement>();

    const chatModeIdWhisper = useMemo(() => LocalizeText('widgets.chatinput.mode.whisper'), []);
    const chatModeIdShout = useMemo(() => LocalizeText('widgets.chatinput.mode.shout'), []);
    const chatModeIdSpeak = useMemo(() => LocalizeText('widgets.chatinput.mode.speak'), []);
    const maxChatLength = useMemo(() => GetConfiguration<number>('chat.input.maxlength', 100), []);

    const anotherInputHasFocus = useCallback(() =>
    {
        const activeElement = document.activeElement;

        if(!activeElement) return false;

        if(inputRef && (inputRef.current === activeElement)) return false;

        if(!(activeElement instanceof HTMLInputElement) && !(activeElement instanceof HTMLTextAreaElement)) return false;

        return true;
    }, [ inputRef ]);

    const setInputFocus = useCallback(() =>
    {
        inputRef.current.focus();

        inputRef.current.setSelectionRange((inputRef.current.value.length * 2), (inputRef.current.value.length * 2));
    }, [ inputRef ]);

    const checkSpecialKeywordForInput = useCallback(() =>
    {
        setChatValue(prevValue =>
        {
            if((prevValue !== chatModeIdWhisper) || !selectedUsername.length) return prevValue;

            return (`${ prevValue } ${ selectedUsername }`);
        });
    }, [ selectedUsername, chatModeIdWhisper ]);

    const sendChatValue = useCallback((value: string, shiftKey: boolean = false) =>
    {
        if(!value || (value === '')) return;

        let chatType = (shiftKey ? ChatMessageTypeEnum.CHAT_SHOUT : ChatMessageTypeEnum.CHAT_DEFAULT);
        let text = value;

        const parts = text.split(' ');

        let recipientName = '';
        let append = '';

        switch(parts[0])
        {
            case chatModeIdWhisper:
                chatType = ChatMessageTypeEnum.CHAT_WHISPER;
                recipientName = parts[1];
                append = (chatModeIdWhisper + ' ' + recipientName + ' ');

                parts.shift();
                parts.shift();
                break;
            case chatModeIdShout:
                chatType = ChatMessageTypeEnum.CHAT_SHOUT;

                parts.shift();
                break;
            case chatModeIdSpeak:
                chatType = ChatMessageTypeEnum.CHAT_DEFAULT;

                parts.shift();
                break;
        }

        text = parts.join(' ');

        // Target mention: with a HUD target selected, "@x" anywhere in the
        // message expands to "@<target>" and the message always goes out as a
        // shout — the server delivers it to the target with bubble style 25
        // (mention alert). Whispers are left untouched.
        if(TargetState.name && (chatType !== ChatMessageTypeEnum.CHAT_WHISPER) && /@x\b/i.test(text))
        {
            text = text.replace(/@x\b/gi, `@${ TargetState.name }`);
            chatType = ChatMessageTypeEnum.CHAT_SHOUT;
        }

        // Command target shorthand: in ":command" arguments a standalone
        // "x" (any case) expands to the HUD target's name, for every user
        // and every command — ":restore x", ":sethp x 50". Token-wise so
        // words merely containing an x are never touched.
        if(TargetState.name && text.startsWith(':'))
        {
            const [ commandKey, ...args ] = text.split(' ');

            if(args.some(arg => (arg.toLowerCase() === 'x')))
            {
                text = [ commandKey, ...args.map(arg => ((arg.toLowerCase() === 'x') ? TargetState.name : arg)) ].join(' ');
            }
        }

        setIsTyping(false);
        setIsIdle(false);

        if(text.length <= maxChatLength)
        {
            if(/%CC%/g.test(encodeURIComponent(text)))
            {
                setChatValue('');
            }
            else
            {
                setChatValue('');
                sendChat(text, chatType, recipientName, chatStyleId);
            }
        }

        setChatValue(append);
    }, [ chatModeIdWhisper, chatModeIdShout, chatModeIdSpeak, maxChatLength, chatStyleId, setIsTyping, setIsIdle, sendChat ]);

    // Runs a macro's command. Deliberately NOT sendChatValue: that clears the
    // chat box, and a macro must never eat a half-typed message. Everything
    // else goes through the normal sendChat, so a macro behaves exactly like
    // typing the command - the client-side commands (:t, :lt, :ping) still work
    // and flood blocking still applies.
    const fireMacro = useCallback((command: string) =>
    {
        let text = command;

        // The same "x means my HUD target" shorthand the chat box expands,
        // applied here so ":slap x" works from a key. sendChat also expands a
        // bare second-position x from the room selection, which covers the case
        // where nothing is pinned in the HUD.
        if(TargetState.name)
        {
            const [ commandKey, ...args ] = text.split(' ');

            if(args.some(arg => (arg.toLowerCase() === 'x')))
            {
                text = [ commandKey, ...args.map(arg => ((arg.toLowerCase() === 'x') ? TargetState.name : arg)) ].join(' ');
            }
        }

        sendChat(text, ChatMessageTypeEnum.CHAT_DEFAULT, '', chatStyleId);
    }, [ sendChat, chatStyleId ]);

    const updateChatInput = useCallback((value: string) =>
    {
        if(!value || !value.length)
        {
            setIsTyping(false);
        }
        else
        {
            setIsTyping(true);
            setIsIdle(true);
        }

        setChatValue(ReplaceEmojiShortcodes(value));
    }, [ setIsTyping, setIsIdle ]);

    const addEmoji = useCallback((emoji: string) =>
    {
        setChatValue(prevValue => (prevValue + emoji));

        if(inputRef.current) inputRef.current.focus();
    }, []);

    const onKeyDownEvent = useCallback((event: KeyboardEvent) =>
    {
        if(floodBlocked || !inputRef.current || anotherInputHasFocus()) return;

        // Macros are checked first, and before setInputFocus(): this handler
        // pulls focus into the chat box on ANY key, so a bound key that was not
        // consumed here would type itself into the message as well as firing.
        if(MacroState.enabled)
        {
            const command = MacroState.bindings.get(NormalizeKeyBinding(event));

            if(command)
            {
                event.preventDefault();
                fireMacro(command);

                return;
            }
        }

        if(document.activeElement !== inputRef.current) setInputFocus();

        const value = (event.target as HTMLInputElement).value;

        switch(event.key)
        {
            case ' ':
            case 'Space':
                checkSpecialKeywordForInput();
                return;
            case 'NumpadEnter':
            case 'Enter':
                sendChatValue(value, event.shiftKey);
                return;
            case 'Backspace':
                if(value)
                {
                    const parts = value.split(' ');

                    if((parts[0] === chatModeIdWhisper) && (parts.length === 3) && (parts[2] === ''))
                    {
                        setChatValue('');
                    }
                }
                return;
        }

    }, [ floodBlocked, inputRef, chatModeIdWhisper, anotherInputHasFocus, setInputFocus, checkSpecialKeywordForInput, sendChatValue, fireMacro ]);

    useUiEvent<RoomWidgetUpdateChatInputContentEvent>(RoomWidgetUpdateChatInputContentEvent.CHAT_INPUT_CONTENT, event =>
    {
        switch(event.chatMode)
        {
            case RoomWidgetUpdateChatInputContentEvent.WHISPER: {
                setChatValue(`${ chatModeIdWhisper } ${ event.userName } `);
                return;
            }
            case RoomWidgetUpdateChatInputContentEvent.SHOUT:
                return;
        }
    });

    const chatStyleIds = useMemo(() =>
    {
        let styleIds: number[] = [];

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
    }, []);

    useEffect(() =>
    {
        document.body.addEventListener('keydown', onKeyDownEvent);

        return () =>
        {
            document.body.removeEventListener('keydown', onKeyDownEvent);
        }
    }, [ onKeyDownEvent ]);

    // Mouse macros fire only over the room canvas, so a middle- or right-click
    // on a window, button or input keeps doing whatever that control does -
    // otherwise a bound button would be swallowed hotel-wide. Left click is
    // never bindable (MACRO_RESERVED_MOUSE), so walking is always safe.
    const onMouseDownEvent = useCallback((event: MouseEvent) =>
    {
        if(floodBlocked || !MacroState.enabled) return;

        if(!(event.target instanceof HTMLCanvasElement)) return;

        const binding = NormalizeMouseBinding(event.button);

        if(!binding || !IsMouseBinding(binding)) return;

        const command = MacroState.bindings.get(binding);

        if(!command) return;

        // Middle click would otherwise start an autoscroll drag, and the room
        // canvas has its own onmousedown property handler (RoomView) which
        // would still treat this as a room interaction. Because this listener
        // is registered in the CAPTURE phase it runs before that one, so
        // stopping propagation here keeps the button from doing both things.
        // Only a bound button is stopped; anything else is left untouched.
        event.preventDefault();
        event.stopPropagation();
        fireMacro(command);
    }, [ floodBlocked, fireMacro ]);

    useEffect(() =>
    {
        // A bound right click must not also raise the browser context menu,
        // which fires separately from mousedown.
        const onContextMenu = (event: MouseEvent) =>
        {
            if(!MacroState.enabled) return;
            if(!(event.target instanceof HTMLCanvasElement)) return;
            if(!MacroState.bindings.has('Mouse Right')) return;

            event.preventDefault();
        };

        document.body.addEventListener('mousedown', onMouseDownEvent, true);
        document.body.addEventListener('contextmenu', onContextMenu, true);

        return () =>
        {
            document.body.removeEventListener('mousedown', onMouseDownEvent, true);
            document.body.removeEventListener('contextmenu', onContextMenu, true);
        }
    }, [ onMouseDownEvent ]);

    useEffect(() =>
    {
        if(!inputRef.current) return;

        inputRef.current.parentElement.dataset.value = chatValue;
    }, [ chatValue ]);

    if(!roomSession || roomSession.isSpectator) return null;

    return (
        createPortal(
            <div className="nitro-chat-input-container">
                <div className="input-sizer align-items-center">
                    { !floodBlocked &&
                    <input ref={ inputRef } type="text" className="chat-input" placeholder={ LocalizeText('widgets.chatinput.default') } value={ chatValue } maxLength={ maxChatLength } onChange={ event => updateChatInput(event.target.value) } onMouseDown={ event => setInputFocus() } /> }
                    { floodBlocked &&
                    <Text variant="danger">{ LocalizeText('chat.input.alert.flood', [ 'time' ], [ floodBlockedSeconds.toString() ]) } </Text> }
                </div>
                <ChatInputStyleSelectorView chatStyleId={ chatStyleId } chatStyleIds={ chatStyleIds } selectChatStyleId={ updateChatStyleId } />
                <ChatInputEmojiSelectorView addEmoji={ addEmoji } />
            </div>, document.getElementById('toolbar-chat-input-container'))
    );
}
