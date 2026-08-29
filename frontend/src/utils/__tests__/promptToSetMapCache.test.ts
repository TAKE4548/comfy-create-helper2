import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promptToSetMapCache } from '../promptToSetMapCache';

describe('promptToSetMapCache in-memory cache and pruning', () => {
  beforeEach(() => {
    localStorage.clear();
    promptToSetMapCache._resetForTesting();
    vi.restoreAllMocks();
  });

  it('AC-4: getSetName returns null if promptId is empty or not in cache', () => {
    expect(promptToSetMapCache.getSetName('')).toBeNull();
    expect(promptToSetMapCache.getSetName('non-existent')).toBeNull();
  });

  it('AC-4: setMapping sets in-memory cache without immediate synchronous localStorage write, and getSetName returns value', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    promptToSetMapCache.setMapping('prompt-1', 'Set A');
    expect(promptToSetMapCache.getSetName('prompt-1')).toBe('Set A');
    // In-memory set should not synchronously call localStorage.setItem
    expect(setItemSpy).not.toHaveBeenCalled();

    // After calling saveToStorage, localStorage is updated
    promptToSetMapCache.saveToStorage();
    expect(setItemSpy).toHaveBeenCalledWith(
      'prompt-surgeon-prompt-to-set-map',
      JSON.stringify({ 'prompt-1': 'Set A' })
    );
  });

  it('AC-4: loadCache initializes from existing localStorage on first access', () => {
    localStorage.setItem(
      'prompt-surgeon-prompt-to-set-map',
      JSON.stringify({ 'prompt-init': 'Initial Set' })
    );

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    expect(promptToSetMapCache.getSetName('prompt-init')).toBe('Initial Set');
    expect(getItemSpy).toHaveBeenCalledTimes(1);

    // Subsequent access uses in-memory cache and does not call localStorage.getItem again
    expect(promptToSetMapCache.getSetName('prompt-init')).toBe('Initial Set');
    expect(getItemSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-4 & AC-8: getSetNameForUrl extracts prompt ID from query parameter t and retrieves set name', () => {
    promptToSetMapCache.setMapping('prompt-xyz', 'Fantasy Set');

    expect(promptToSetMapCache.getSetNameForUrl('')).toBeNull();
    expect(promptToSetMapCache.getSetNameForUrl('http://localhost:8188/view?filename=test.png')).toBeNull();
    expect(
      promptToSetMapCache.getSetNameForUrl('http://localhost:8188/view?filename=test.png&subfolder=&type=output&t=prompt-xyz')
    ).toBe('Fantasy Set');
    expect(
      promptToSetMapCache.getSetNameForUrl('/view?filename=test.png&t=prompt-xyz#hash')
    ).toBe('Fantasy Set');
  });

  it('AC-8: saveToStorage trims entries exceeding MAX_ENTRIES (200) keeping latest 200', () => {
    for (let i = 1; i <= 250; i++) {
      promptToSetMapCache.setMapping(`prompt-${i}`, `Set-${i}`);
    }

    promptToSetMapCache.saveToStorage();

    const stored = JSON.parse(localStorage.getItem('prompt-surgeon-prompt-to-set-map') || '{}');
    const keys = Object.keys(stored);
    expect(keys.length).toBe(200);
    expect(keys[0]).toBe('prompt-51');
    expect(keys[199]).toBe('prompt-250');
    expect(stored['prompt-1']).toBeUndefined();
    expect(stored['prompt-50']).toBeUndefined();
    expect(stored['prompt-51']).toBe('Set-51');
    expect(stored['prompt-250']).toBe('Set-250');
  });
});
