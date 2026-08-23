// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('probe window.parent', () => {
  it('can redefine window.parent', () => {
    const fake = { postMessage: () => {} } as any;
    const desc = Object.getOwnPropertyDescriptor(window, 'parent');
    console.log('descriptor', desc);
    Object.defineProperty(window, 'parent', { value: fake, configurable: true });
    expect(window.parent).toBe(fake);
  });
});
