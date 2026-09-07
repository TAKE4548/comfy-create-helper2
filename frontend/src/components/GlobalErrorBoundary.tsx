import React from 'react';
import { logClientError } from '../utils/logger';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[GlobalErrorBoundary] Caught render crash:', error, errorInfo);
    logClientError(error, {
      component: 'GlobalErrorBoundary',
      context: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 bg-[#131316] text-zinc-300">
          <div className="bg-[#1F1F25] border border-red-500/40 rounded-xl p-8 max-w-lg w-full space-y-4 shadow-xl">
            <h2 className="text-xl font-semibold text-red-400">システムエラーが発生しました</h2>
            <p className="text-sm text-zinc-400">
              画面の描画中に予期せぬエラーが発生しました。エラーログは自動的にシステムへ記録されました。
            </p>
            <div className="bg-black/50 border border-zinc-800 p-4 rounded-lg overflow-auto max-h-48 text-xs font-mono text-zinc-400">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-[#7C6FDD] text-white font-medium rounded-lg text-sm hover:brightness-110 transition-all"
              >
                ページを再読み込み
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
