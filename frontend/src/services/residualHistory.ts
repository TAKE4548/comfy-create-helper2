export interface ImageIdentity {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ResidualHistoryRequest {
  known: ImageIdentity[];
  examined: ImageIdentity[];
}

export interface ResidualHistoryItem {
  identity: ImageIdentity;
  view_url: string;
  session_id: string | null;
  availability: 'present';
}

export interface ResidualHistoryResponse {
  items: ResidualHistoryItem[];
  rejected: Array<{ identity: ImageIdentity; availability: 'missing' | 'unknown' }>;
  has_more: boolean;
}

export interface DisplayedTrialHistory {
  all: readonly string[];
  own: readonly string[];
  missing: ReadonlySet<string>;
  clientId: string;
}

export interface ResidualMergeResult {
  all: string[];
  own: string[];
  added: ResidualHistoryItem[];
}

const identityKey = ({ filename, subfolder, type }: ImageIdentity): string =>
  JSON.stringify([filename, subfolder || '', type || 'output']);

function identityFromUrl(raw: string, currentOrigin: string): ImageIdentity | null {
  try {
    const parsed = new URL(raw, currentOrigin);
    if (parsed.origin !== currentOrigin || !['/api/comfy/view', '/view'].includes(parsed.pathname)) return null;
    const filename = parsed.searchParams.get('filename');
    if (!filename) return null;
    return {
      filename,
      subfolder: parsed.searchParams.get('subfolder') ?? '',
      type: parsed.searchParams.get('type') ?? 'output',
    };
  } catch {
    return null;
  }
}

export function collectDisplayedIdentities(history: DisplayedTrialHistory): ImageIdentity[] {
  const currentOrigin = window.location.origin;
  const seen = new Set<string>();
  const identities: ImageIdentity[] = [];
  for (const url of [...history.all, ...history.own]) {
    if (history.missing.has(url)) continue;
    const identity = identityFromUrl(url, currentOrigin);
    if (!identity) continue;
    const key = identityKey(identity);
    if (seen.has(key)) continue;
    seen.add(key);
    identities.push(identity);
  }
  return identities;
}

function insertAfterPrior<T>(base: T[], added: T[], priorKeys: ReadonlySet<string>, keyOf: (value: T) => string): T[] {
  if (added.length === 0) return base;
  let insertAt = -1;
  let foundPrior = false;
  for (let index = 0; index < base.length; index += 1) {
    if (priorKeys.has(keyOf(base[index]))) {
      insertAt = index;
      foundPrior = true;
    }
  }
  base.splice(foundPrior ? insertAt + 1 : base.length, 0, ...added);
  return base;
}

export function mergeResidualHistory(
  history: DisplayedTrialHistory,
  items: readonly ResidualHistoryItem[],
  priorAddedIdentities: readonly string[],
): ResidualMergeResult {
  const known = new Set(collectDisplayedIdentities(history).map(identityKey));
  const candidates: ResidualHistoryItem[] = [];
  for (const item of items) {
    if (item.availability !== 'present') continue;
    const key = identityKey(item.identity);
    if (known.has(key)) continue;
    known.add(key);
    candidates.push(item);
  }

  const priorKeys = new Set(priorAddedIdentities);
  const existingAllCount = history.all.length;
  const allSlots = Math.max(0, 200 - existingAllCount);
  const allAdded = candidates.slice(0, allSlots);
  const all = insertAfterPrior([...history.all], allAdded.map(item => item.view_url), priorKeys, raw => {
    const identity = identityFromUrl(raw, window.location.origin);
    return identity ? identityKey(identity) : '';
  });

  const ownBase = [...history.own];
  const ownCandidates = allAdded.filter(item => item.session_id === history.clientId);
  const ownSlots = Math.max(0, 200 - ownBase.length);
  const ownAdded = ownCandidates.slice(0, ownSlots);
  const own = insertAfterPrior(ownBase, ownAdded.map(item => item.view_url), priorKeys, raw => {
    const identity = identityFromUrl(raw, window.location.origin);
    return identity ? identityKey(identity) : '';
  });

  return { all, own, added: allAdded };
}
