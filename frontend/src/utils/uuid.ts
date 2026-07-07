export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    if (window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    if (window.crypto.getRandomValues) {
      return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
        (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      );
    }
  }
  // 完全なフォールバック (Math.random)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
