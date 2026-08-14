import { describe, expect, it } from 'vitest';
import { timeAgo } from './impact-history';

describe('timeAgo', () => {
  it('formats relative times compactly', () => {
    const now = 10_000_000_000;
    expect(timeAgo(now - 30_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2h ago');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d ago');
  });

  it('clamps to "just now" for future or equal timestamps', () => {
    expect(timeAgo(Date.now() + 1000)).toBe('just now');
  });

  it('falls back to months for old timestamps', () => {
    const now = 10_000_000_000;
    expect(timeAgo(now - 45 * 86_400_000, now)).toBe('1mo ago');
  });
});
