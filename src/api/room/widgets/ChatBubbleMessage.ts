import { INitroPoint } from '@nitrots/nitro-renderer';

export class ChatBubbleMessage
{
    public static BUBBLE_COUNTER: number = 0;

    public id: number = -1;
    public width: number = 0;
    public height: number = 0;
    public elementRef: HTMLDivElement = null;
    public skipMovement: boolean = false;

    private _top: number = 0;
    private _left: number = 0;
    
    constructor(
        public senderId: number = -1,
        public senderCategory: number = -1,
        public roomId: number = -1,
        public text: string = '',
        public formattedText: string = '',
        public username: string = '',
        public location: INitroPoint = null,
        public type: number = 0,
        public styleId: number = 0,
        public imageUrl: string = null,
        public color: string = null,
        public usernameColor: string = null,
        public usernameIcon: string = null,
        public usernameIconColor: string = null
    )
    {
        this.id = ++ChatBubbleMessage.BUBBLE_COUNTER;
    }

    public get top(): number
    {
        return this._top;
    }

    // pixelrp: placed on WHOLE pixels. A bubble is centred on its avatar's
    // screen x, which is fractional, less half its own width, which is often
    // a half - so it almost never landed on a pixel, and its text was drawn
    // smeared across two: soft names and messages on Windows at 100%, where a
    // Retina Mac hides it. The exact value is kept, so the stacking and the
    // room's panning still do their sums on it; only what is drawn is rounded.
    public set top(value: number)
    {
        this._top = value;

        if(this.elementRef) this.elementRef.style.top = (Math.round(this._top) + 'px');
    }

    public get left(): number
    {
        return this._left;
    }

    public set left(value: number)
    {
        this._left = value;

        if(this.elementRef) this.elementRef.style.left = (Math.round(this._left) + 'px');
    }
}
