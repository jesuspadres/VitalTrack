import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f0f9ff] flex items-center justify-center px-4 relative">
          {/* Background mesh */}
          <div className="bg-mesh" aria-hidden="true">
            <div className="bg-orb-center" />
          </div>

          <div className="relative z-10 w-full max-w-md text-center animate-fade-in">
            {/* Error icon */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl glass">
              <svg
                className="h-10 w-10 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              An unexpected error occurred. This has been logged and we&apos;ll
              look into it.
            </p>

            {/* Error detail — only shown in development */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 card p-3 text-left">
                <p className="text-xs font-mono text-red-500/80 break-all line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={this.handleReload}
              >
                Reload Page
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={this.handleGoHome}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
