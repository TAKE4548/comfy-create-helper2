import { describe, expect, it } from 'vitest';
import {
  collectDisplayedIdentities,
  mergeResidualHistory,
  type DisplayedTrialHistory,
  type ImageIdentity,
  type ResidualHistoryItem,
} from '../residualHistory';

const origin = window.location.origin;
const url = (filename: string, subfolder = '', type = 'output', query = '') => {
  const params = new URLSearchParams({ filename, subfolder, type });
  return `${origin}/view?${params}${query}`;
};
const identity = (filename: string, subfolder = '', type = 'output'): ImageIdentity => ({ filename, subfolder, type });
const item = (filename: string, session_id: string | null = 'client', subfolder = '', type = 'output'): ResidualHistoryItem => ({
  identity: identity(filename, subfolder, type),
  view_url: `/api/comfy/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}&t=be`,
  session_id,
  availability: 'present',
});
const history = (all: string[] = [], own: string[] = [], missing = new Set<string>()): DisplayedTrialHistory => ({ all, own, missing, clientId: 'client' });

describe('collectDisplayedIdentities', () => {
  it('deduplicates all/own by identity and ignores missing, invalid, and foreign URLs', () => {
    const a = url('a.png');
    const b = url('b.png');
    expect(collectDisplayedIdentities(history([a, b, 'https://elsewhere.test/view?filename=x'], [url('a.png', '', 'output', '&t=old')], new Set([b])))).toEqual([identity('a.png')]);
  });

  it('accepts both view paths, ignores host spelling and t, and applies identity defaults', () => {
    const absolute = `${origin}/api/comfy/view?filename=x.png&t=old`;
    expect(collectDisplayedIdentities(history([absolute, '/view?filename=x.png&t=new', '/view?filename=y.png&subfolder=foo&type=input']))).toEqual([
      identity('x.png'), identity('y.png', 'foo', 'input'),
    ]);
  });

  it('rejects unsupported paths and empty filenames', () => {
    expect(collectDisplayedIdentities(history(['/other?filename=x', '/view?filename=']))).toEqual([]);
  });
});

describe('mergeResidualHistory', () => {
  it('preserves existing URLs and adds new BE view URLs at the front for initial residual, own only for this session', () => {
    const old = url('old.png', '', 'output', '&t=old');
    const result = mergeResidualHistory(history([old], [old]), [item('a.png'), item('foreign.png', 'other'), item('unknown.png', null)], []);
    expect(result.all).toEqual([item('a.png').view_url, item('foreign.png').view_url, item('unknown.png').view_url, old]);
    expect(result.own).toEqual([item('a.png').view_url, old]);
    expect(result.added.map(x => x.identity.filename)).toEqual(['a.png', 'foreign.png', 'unknown.png']);
  });

  it('treats t and old host path as the same identity but keeps old URL text', () => {
    const old = url('same.png', '', 'output', '&t=old');
    const result = mergeResidualHistory(history([old]), [item('same.png')], []);
    expect(result.all).toEqual([old]);
    expect(result.added).toEqual([]);
  });

  it('keeps same filename in different subfolders or types distinct', () => {
    const result = mergeResidualHistory(history([url('same.png')]), [item('same.png', 'client', 'nested'), item('same.png', 'client', '', 'input')], []);
    expect(result.added).toHaveLength(2);
  });

  it('recompares latest history so an item that arrived during the request is not duplicated', () => {
    const live = url('live.png');
    const result = mergeResidualHistory(history([live]), [item('live.png'), item('other.png')], []);
    expect(result.all).toEqual([item('other.png').view_url, live]);
  });

  it('inserts a later page after the prior residual block without reordering intervening live rows', () => {
    const first = item('first.png');
    const live = url('live.png');
    const second = item('second.png');
    const result = mergeResidualHistory(history([first.view_url, live]), [second], [JSON.stringify(['first.png', '', 'output'])]);
    expect(result.all).toEqual([first.view_url, second.view_url, live]);
  });

  it('[REQ-370/AC-3] places initial residual batch at the front of existing history', () => {
    const newestFirst = [url('newest.png'), url('older.png')];
    expect(mergeResidualHistory(history(newestFirst), [item('residual.png')], []).all).toEqual([item('residual.png').view_url, ...newestFirst]);
  });

  it('[REQ-370/AC-2] accepts new candidates via FIFO up to 200 items even when already holding 200 items', () => {
    const existing = Array.from({ length: 200 }, (_, i) => url(`old-${i}.png`));
    const result = mergeResidualHistory(history(existing), [item('a.png'), item('b.png')], []);
    expect(result.all).toHaveLength(200);
    expect(result.added).toHaveLength(2);
    expect(result.all.slice(0, 2)).toEqual([item('a.png').view_url, item('b.png').view_url]);
    expect(result.all).not.toContain(existing[198]);
    expect(result.all).not.toContain(existing[199]);
  });

  it('does not add missing identities and returns empty arrays for empty input', () => {
    expect(mergeResidualHistory(history(), [], [])).toEqual({ all: [], own: [], added: [] });
    const missing = url('gone.png');
    const result = mergeResidualHistory(history([missing], [], new Set([missing])), [item('gone.png')], []);
    expect(result.all).toEqual([item('gone.png').view_url, missing]);
  });
});
