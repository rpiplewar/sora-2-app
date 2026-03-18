import { describe, it, expect } from 'vitest';
import { VALID_SECONDS, PRO_SIZES, getModelForSize } from '../types';

describe('VALID_SECONDS', () => {
  it('includes 4, 8, 12, 16, 20', () => {
    expect(VALID_SECONDS).toContain('4');
    expect(VALID_SECONDS).toContain('8');
    expect(VALID_SECONDS).toContain('12');
    expect(VALID_SECONDS).toContain('16');
    expect(VALID_SECONDS).toContain('20');
  });

  it('has exactly 5 values', () => {
    expect(VALID_SECONDS).toHaveLength(5);
  });

  it('does not include legacy-only values like 15 or 24', () => {
    expect(VALID_SECONDS).not.toContain('15');
    expect(VALID_SECONDS).not.toContain('24');
    expect(VALID_SECONDS).not.toContain('6');
  });
});

describe('PRO_SIZES', () => {
  it('includes all four Pro size values', () => {
    expect(PRO_SIZES).toContain('1792x1024');
    expect(PRO_SIZES).toContain('1024x1792');
    expect(PRO_SIZES).toContain('1920x1080');
    expect(PRO_SIZES).toContain('1080x1920');
  });

  it('has exactly 4 values', () => {
    expect(PRO_SIZES).toHaveLength(4);
  });

  it('does not include standard SD/HD sizes', () => {
    expect(PRO_SIZES).not.toContain('1280x720');
    expect(PRO_SIZES).not.toContain('720x1280');
    expect(PRO_SIZES).not.toContain('480x480');
  });
});

describe('getModelForSize', () => {
  it('returns sora-2 for standard HD landscape 1280x720', () => {
    expect(getModelForSize('1280x720')).toBe('sora-2');
  });

  it('returns sora-2 for standard HD portrait 720x1280', () => {
    expect(getModelForSize('720x1280')).toBe('sora-2');
  });

  it('returns sora-2 for 1080x1080 square', () => {
    expect(getModelForSize('1080x1080')).toBe('sora-2');
  });

  it('returns sora-2 for 480x480 SD', () => {
    expect(getModelForSize('480x480')).toBe('sora-2');
  });

  it('returns sora-2-pro for 1792x1024 (PromptForm Pro landscape)', () => {
    expect(getModelForSize('1792x1024')).toBe('sora-2-pro');
  });

  it('returns sora-2-pro for 1024x1792 (PromptForm Pro portrait)', () => {
    expect(getModelForSize('1024x1792')).toBe('sora-2-pro');
  });

  it('returns sora-2-pro for 1920x1080 (Full HD landscape)', () => {
    expect(getModelForSize('1920x1080')).toBe('sora-2-pro');
  });

  it('returns sora-2-pro for 1080x1920 (Full HD portrait)', () => {
    expect(getModelForSize('1080x1920')).toBe('sora-2-pro');
  });

  it('returns sora-2 for unknown/empty size', () => {
    expect(getModelForSize('')).toBe('sora-2');
    expect(getModelForSize('unknown')).toBe('sora-2');
  });
});
