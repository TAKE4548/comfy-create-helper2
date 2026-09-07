import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { logClientError, logClientEvent, addBreadcrumb, getBreadcrumbs, clearBreadcrumbs, MAX_BREADCRUMBS } from '../utils/logger';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

describe('Frontend Logger & ErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearBreadcrumbs();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('manages breadcrumbs ring buffer up to MAX_BREADCRUMBS (100) using FIFO', () => {
    for (let i = 0; i < 105; i++) {
      addBreadcrumb({ category: 'ui', message: `Action ${i}` });
    }
    const crumbs = getBreadcrumbs();
    expect(crumbs.length).toBe(MAX_BREADCRUMBS);
    expect(crumbs[0].message).toBe('Action 5'); // Actions 0-4 evicted
    expect(crumbs[99].message).toBe('Action 104');
  });

  it('attaches breadcrumbs to error payload on logClientError', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    addBreadcrumb({ category: 'navigation', message: 'Navigated to /' });
    addBreadcrumb({ category: 'preset', message: 'Loaded preset A' });

    await logClientError(new Error('Test UI Error'), {
      component: 'TestComponent',
      context: { foo: 'bar' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/system/client-logs');
    const body = JSON.parse(options?.body as string);
    expect(body.level).toBe('error');
    expect(body.message).toBe('Test UI Error');
    expect(body.context.foo).toBe('bar');
    expect(Array.isArray(body.context.breadcrumbs)).toBe(true);
    expect(body.context.breadcrumbs.length).toBeGreaterThanOrEqual(2);
    expect(body.context.breadcrumbs[0].message).toBe('Navigated to /');
  });

  it('dispatches client event via logClientEvent', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await logClientEvent('info', 'Generation started', { prompt_id: 'p-123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/system/client-logs');
    const body = JSON.parse(options?.body as string);
    expect(body.level).toBe('info');
    expect(body.message).toBe('Generation started');
    expect(body.context).toEqual({ prompt_id: 'p-123' });
  });

  it('renders fallback UI and dispatches log when child component throws in GlobalErrorBoundary', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});

    const CrashingChild = () => {
      throw new Error('Component crashed during render');
    };

    render(
      <GlobalErrorBoundary>
        <CrashingChild />
      </GlobalErrorBoundary>
    );

    expect(screen.getByText('システムエラーが発生しました')).toBeInTheDocument();
    expect(screen.getByText('Component crashed during render')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    consoleErrorMock.mockRestore();
  });

  it('does not throw when /api/system/client-logs fails (Fail-Safe)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(logClientError(new Error('Silent failure test'))).resolves.not.toThrow();
    warnMock.mockRestore();
  });
});
