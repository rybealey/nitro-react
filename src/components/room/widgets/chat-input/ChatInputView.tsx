import { RpRetainChatPrefixEvent } from '../../../../api/rp-chat/RpChatMessages';
import { SendRpFireMacro } from '../../../../api/rp-macros/RpMacroMessages';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessageTypeEnum, GetConfiguration, LocalizeText, ReplaceEmojiShortcodes, RoomWidgetUpdateChatInputContentEvent } from '../../../../api';
import { Text } from '../../../../common';
import { useChatInputWidget, useRoom, useSessionInfo, useUiEvent, useMessageEvent } from '../../../../hooks';
import { IsModifierOnlyBinding, IsMouseBinding, MacroState, NormalizeKeyBinding, NormalizeMouseBinding } from '../../../../components/rp-settings/MacroState';
import { TargetState } from '../../../../hooks/rooms/targetState';
import { ROOM_DRAG_STILL_PX, RoomDragUsesRight } from '../../../../api/prefs/RoomDragStore';
import { ChatInputEmojiSelectorView } from './ChatInputEmojiSelectorView';
import { ChatInputStyleSelectorView } from './ChatInputStyleSelectorView';
import { GetSelectableChatStyleIds } from '../../../rp-settings/ChatStyles';

export const ChatInputView: FC<{}> = props =>
{
    const [ chatValue, setChatValue ] = useState<string>('');
    const { chatStyleId = 0, updateChatStyleId = null } = useSessionInfo();
    const { selectedUsername = '', floodBlocked = false, floodBlockedSeconds = 0, setIsTyping = null, setIsIdle = null, sendChat = null, prepareChatText = null } = useChatInputWidget();
    const { roomSession = null } = useRoom();
    const inputRef = useRef<HTMLInputElement>();
    // A modifier can be a binding on its own OR the prefix of a combo, and
    // which one it is is only known once it is released. These track the
    // modifier currently held and whether anything else was pressed while it
    // was down; see onKeyDownEvent / onKeyUpEvent.
    const heldModifier = useRef<string>(null);
    const modifierUsedAsPrefix = useRef<boolean>(false);

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

    // Gang / corporation alerts (:ga, :ca) keep their prefix in the box for
    // the next message, like a whisper keeps its recipient - but only when
    // the server says the alert went out (an off-duty :ca is refused and
    // leaves the box clear). Never overwrites something already being typed.
    useMessageEvent<RpRetainChatPrefixEvent>(RpRetainChatPrefixEvent, event =>
    {
        const prefix = event.getParser().prefix;

        if(!prefix) return;

        setChatValue(prevValue => (prevValue.trim().length ? prevValue : `${ prefix } `));
    });

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
    const fireMacro = useCallback((commands: string[]) =>
    {
        // The same "x means my HUD target" shorthand the chat box expands,
        // applied here so ":slap x" works from a key. sendChat also expands a
        // bare second-position x from the room selection, which covers the case
        // where nothing is pinned in the HUD.
        const lines = commands.map(command =>
        {
            if(!TargetState.name) return command;

            const [ commandKey, ...args ] = command.split(' ');

            if(!args.some(arg => (arg.toLowerCase() === 'x'))) return command;

            return [ commandKey, ...args.map(arg => ((arg.toLowerCase() === 'x') ? TargetState.name : arg)) ].join(' ');
        });

        // One command: ordinary chat, exactly as before.
        if(lines.length === 1)
        {
            sendChat(lines[0], ChatMessageTypeEnum.CHAT_DEFAULT, '', chatStyleId);

            return;
        }

        // Several: each is prepared exactly as typed chat is (client-side
        // commands run here), and whatever is left goes to the server as ONE
        // press, which it counts against flood control once rather than once a
        // line - so a key with three commands cannot mute its owner.
        const outgoing: string[] = [];

        for(const line of lines)
        {
            const prepared = prepareChatText(line);

            if(prepared !== null) outgoing.push(prepared);
        }

        SendRpFireMacro(chatStyleId, outgoing);
    }, [ sendChat, prepareChatText, chatStyleId ]);

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
        // While Siri replaces the bar (body.siri-active), don't capture keys
        // into the invisible input - typing would send unseen chat.
        if(floodBlocked || !inputRef.current || anotherInputHasFocus() || document.body.classList.contains('siri-active')) return;

        // Macros are checked first, and before setInputFocus(): this handler
        // pulls focus into the chat box on ANY key, so a bound key that was not
        // consumed here would type itself into the message as well as firing.
        if(MacroState.enabled)
        {
            const binding = NormalizeKeyBinding(event);

            if(IsModifierOnlyBinding(binding))
            {
                // Cannot fire yet: this might be the start of CTRL+K. It fires
                // on release instead, and only if nothing else was pressed
                // meanwhile. Guarded against key-repeat re-arming the flag.
                if(heldModifier.current !== binding)
                {
                    heldModifier.current = binding;
                    modifierUsedAsPrefix.current = false;
                }
            }
            else
            {
                // Something other than the modifier was pressed, so any held
                // modifier was a prefix rather than a binding of its own.
                modifierUsedAsPrefix.current = true;

                const commands = MacroState.bindings.get(binding);

                if(commands)
                {
                    event.preventDefault();
                    fireMacro(commands);

                    return;
                }
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

    // Releasing a modifier that was held on its own - nothing else pressed
    // while it was down - is what fires a modifier-only binding.
    const onKeyUpEvent = useCallback((event: KeyboardEvent) =>
    {
        const held = heldModifier.current;

        if(!held) return;
        // Some other key coming up does not end the modifier's hold.
        if(NormalizeKeyBinding(event) !== held) return;

        heldModifier.current = null;

        if(modifierUsedAsPrefix.current) return;
        if(floodBlocked || !MacroState.enabled) return;
        if(anotherInputHasFocus()) return;

        const commands = MacroState.bindings.get(held);

        if(!commands) return;

        event.preventDefault();
        fireMacro(commands);
    }, [ floodBlocked, anotherInputHasFocus, fireMacro ]);

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

    const chatStyleIds = useMemo(() => GetSelectableChatStyleIds(), []);

    useEffect(() =>
    {
        document.body.addEventListener('keydown', onKeyDownEvent);
        document.body.addEventListener('keyup', onKeyUpEvent);

        return () =>
        {
            document.body.removeEventListener('keydown', onKeyDownEvent);
            document.body.removeEventListener('keyup', onKeyUpEvent);
        }
    }, [ onKeyDownEvent, onKeyUpEvent ]);

    // A modifier held when the client loses focus never gets its keyup, which
    // would leave it armed and fire on the next unrelated release.
    useEffect(() =>
    {
        const forget = () =>
        {
            heldModifier.current = null;
            modifierUsedAsPrefix.current = false;
        };

        window.addEventListener('blur', forget);

        return () => window.removeEventListener('blur', forget);
    }, []);

    // Mouse macros fire only over the room canvas, so a middle- or right-click
    // on a window, button or input keeps doing whatever that control does -
    // otherwise a bound button would be swallowed hotel-wide. Left click is
    // never bindable (MACRO_RESERVED_MOUSE), so walking is always safe.
    const onMouseDownEvent = useCallback((event: MouseEvent) =>
    {
        if(floodBlocked || !MacroState.enabled) return;

        // Clicking anything while a modifier is held means the modifier was
        // being used, not tapped, so it must not also fire on release.
        if(heldModifier.current) modifierUsedAsPrefix.current = true;

        if(!(event.target instanceof HTMLCanvasElement)) return;

        const binding = NormalizeMouseBinding(event.button, event);

        if(!binding || !IsMouseBinding(binding)) return;

        const commands = MacroState.bindings.get(binding);

        if(!commands) return;

        // With the right button panning the room (Settings > General), a right
        // press is also how a pan starts, so it is left to reach the room and
        // the macro waits for the release: it fires only if the press stayed
        // put. A press that moved was a pan, and panning must not fire it.
        if((event.button === 2) && RoomDragUsesRight())
        {
            const startX = event.clientX;
            const startY = event.clientY;
            let dragged = false;

            const onMove = (move: MouseEvent) =>
            {
                if((Math.abs(move.clientX - startX) > ROOM_DRAG_STILL_PX) || (Math.abs(move.clientY - startY) > ROOM_DRAG_STILL_PX)) dragged = true;
            };

            const stop = () =>
            {
                window.removeEventListener('mousemove', onMove, true);
                window.removeEventListener('mouseup', onUp, true);
                window.removeEventListener('blur', stop);
            };

            const onUp = (up: MouseEvent) =>
            {
                if(up.button !== 2) return;

                stop();

                if(!dragged) fireMacro(commands);
            };

            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', onUp, true);
            // A release outside the window never arrives, so a lost focus ends
            // the press rather than leaving it armed for an unrelated release.
            window.addEventListener('blur', stop);

            return;
        }

        // Middle click would otherwise start an autoscroll drag, and the room
        // canvas has its own onmousedown property handler (RoomView) which
        // would still treat this as a room interaction. Because this listener
        // is registered in the CAPTURE phase it runs before that one, so
        // stopping propagation here keeps the button from doing both things.
        // Only a bound button is stopped; anything else is left untouched.
        event.preventDefault();
        event.stopPropagation();
        fireMacro(commands);
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
