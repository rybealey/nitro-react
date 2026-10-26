import { Component, ErrorInfo, ReactNode } from 'react';

// pixelrp: holds a crash inside the part of a window it wraps. Without one,
// an error thrown while React draws unmounts the whole client and the game
// goes black until a reload; with one, only what is wrapped is swapped for
// `fallback`. A new `resetKey` (the tab or view now showing) clears it.

interface ErrorBoundaryProps
{
    resetKey?: string | number;
    fallback: (error: Error, reset: () => void) => ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
    children?: ReactNode;
}

interface ErrorBoundaryState
{
    error: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState>
{
    public state: ErrorBoundaryState = { error: null };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState
    {
        return { error: ((error instanceof Error) ? error : new Error(String(error))) };
    }

    public componentDidCatch(error: Error, info: ErrorInfo): void
    {
        try
        {
            this.props.onError?.(error, info);
        }
        catch(e)
        {}
    }

    public componentDidUpdate(previous: ErrorBoundaryProps): void
    {
        if(this.state.error && (previous.resetKey !== this.props.resetKey)) this.setState({ error: null });
    }

    private reset = (): void => this.setState({ error: null });

    public render(): ReactNode
    {
        if(this.state.error) return this.props.fallback(this.state.error, this.reset);

        return this.props.children;
    }
}
