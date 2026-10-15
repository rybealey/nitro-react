export class WorkerBuilder extends Worker
{
    private _url: string;

    constructor(worker)
    {
        const code = worker.toString();
        const blob = new Blob([ `(${ code })()` ]);
        const url = URL.createObjectURL(blob);

        super(url);

        this._url = url;
    }

    // pixelrp: a worker lives until it is terminated - stopping its timer
    // leaves the thread and its blob behind - so terminate frees both.
    public terminate(): void
    {
        super.terminate();

        if(this._url)
        {
            URL.revokeObjectURL(this._url);

            this._url = null;
        }
    }
}
