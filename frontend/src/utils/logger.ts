export interface Breadcrumb {
  timestamp: string;
  category: 'navigation' | 'ui' | 'preset' | 'ws' | 'api' | 'system';
  message: string;
  data?: Record<string, unknown> | unknown;
}

interface ClientLogPayload {
  level: 'info' | 'warn' | 'error';
  message: string;
  stack?: string;
  url?: string;
  component?: string;
  context?: Record<string, unknown>;
}

export const MAX_BREADCRUMBS = 100;
const breadcrumbsBuffer: Breadcrumb[] = [];
const recentErrors = new Set<string>();

/**
 * Records a breadcrumb event in the in-memory ring buffer (up to 100 entries).
 */
export function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
  const item: Breadcrumb = {
    ...crumb,
    timestamp: new Date().toISOString(),
  };
  if (breadcrumbsBuffer.length >= MAX_BREADCRUMBS) {
    breadcrumbsBuffer.shift(); // FIFO eviction
  }
  breadcrumbsBuffer.push(item);
}

export function getBreadcrumbs(): readonly Breadcrumb[] {
  return [...breadcrumbsBuffer];
}

export function clearBreadcrumbs(): void {
  breadcrumbsBuffer.length = 0;
}

/**
 * Dispatches an explicit client event log (e.g. generation started, preset saved) to backend.
 */
export async function logClientEvent(
  level: 'info' | 'warn',
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    addBreadcrumb({ category: 'system', message: `[${level.toUpperCase()}] ${message}`, data: context });

    const payload: ClientLogPayload = {
      level,
      message,
      url: window.location.href,
      context,
    };

    await fetch('/api/system/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('[Logger] Failed to dispatch client event log:', err);
    });
  } catch (err) {
    console.warn('[Logger] Unexpected error in logClientEvent:', err);
  }
}

/**
 * Dispatches a client error with attached breadcrumbs trail to backend.
 */
export async function logClientError(
  error: unknown,
  meta?: { component?: string; context?: Record<string, unknown>; level?: 'info' | 'warn' | 'error' }
): Promise<void> {
  try {
    let message = 'Unknown client error';
    let stack: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = JSON.stringify(error);
    }

    const dedupeKey = `${meta?.component || 'global'}:${message}:${stack?.slice(0, 100) || ''}`;
    if (recentErrors.has(dedupeKey)) {
      return;
    }
    recentErrors.add(dedupeKey);
    setTimeout(() => {
      recentErrors.delete(dedupeKey);
    }, 5000); // 5-second dedupe window

    // Record this error as a final breadcrumb
    addBreadcrumb({
      category: 'system',
      message: `Error caught in ${meta?.component || 'global'}: ${message}`,
      data: { stack: stack?.slice(0, 200) },
    });

    const payload: ClientLogPayload = {
      level: meta?.level || 'error',
      message,
      stack,
      url: window.location.href,
      component: meta?.component,
      context: {
        ...meta?.context,
        breadcrumbs: getBreadcrumbs(),
      },
    };

    // Fail-safe dispatch: NEVER throw or cause unhandled rejections if this fails
    await fetch('/api/system/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('[Logger] Failed to dispatch client error log to backend:', err);
    });
  } catch (err) {
    console.warn('[Logger] Unexpected error in logClientError:', err);
  }
}

export function setupGlobalErrorListeners(): void {
  window.addEventListener('error', (event) => {
    logClientError(event.error || event.message, {
      component: 'window.onerror',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logClientError(event.reason || 'Unhandled Promise Rejection', {
      component: 'window.onunhandledrejection',
    });
  });
}
