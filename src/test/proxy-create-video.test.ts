import { describe, it, expect } from 'vitest';

// ─── Inline the proxy validation logic ──────────────────────────────────────
// We test the exact same logic used in api/proxy-create-video.ts
// without importing it (Edge Function import is incompatible with Vitest node env).

function validateProxyRequest(params: {
  apiKey: string;
  prompt: string;
  seconds: string;
  size: string;
  model: string;
}): { ok: true } | { ok: false; status: number; error: string } {
  const { apiKey, prompt, seconds: secondsStr, size, model } = params;

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return { ok: false, status: 400, error: 'Invalid API key format' };
  }

  if (!prompt || !secondsStr || !model) {
    return { ok: false, status: 400, error: 'Missing required fields' };
  }

  const validSeconds = ['4', '8', '12', '16', '20'];
  if (!validSeconds.includes(secondsStr)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid seconds value: must be one of ${validSeconds.join(', ')}, got '${secondsStr}'`,
    };
  }

  const proSizes = ['1792x1024', '1024x1792', '1920x1080', '1080x1920'];
  if (proSizes.includes(String(size)) && model !== 'sora-2-pro') {
    return {
      ok: false,
      status: 400,
      error: `Pro resolution (${size}) requires model 'sora-2-pro', got '${model}'`,
    };
  }

  return { ok: true };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

const validBase = {
  apiKey: 'sk-testkey',
  prompt: 'a cinematic scene',
  seconds: '8',
  size: '1280x720',
  model: 'sora-2',
};

describe('proxy-create-video: seconds validation', () => {
  it('accepts 4 seconds', () => {
    expect(validateProxyRequest({ ...validBase, seconds: '4' })).toEqual({ ok: true });
  });

  it('accepts 8 seconds', () => {
    expect(validateProxyRequest({ ...validBase, seconds: '8' })).toEqual({ ok: true });
  });

  it('accepts 12 seconds', () => {
    expect(validateProxyRequest({ ...validBase, seconds: '12' })).toEqual({ ok: true });
  });

  it('accepts 16 seconds (new)', () => {
    expect(validateProxyRequest({ ...validBase, seconds: '16' })).toEqual({ ok: true });
  });

  it('accepts 20 seconds (new)', () => {
    expect(validateProxyRequest({ ...validBase, seconds: '20' })).toEqual({ ok: true });
  });

  it('rejects 15 seconds with 400', () => {
    const result = validateProxyRequest({ ...validBase, seconds: '15' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Invalid seconds value/);
      expect(result.error).toMatch(/4, 8, 12, 16, 20/);
    }
  });

  it('rejects 6 seconds with 400', () => {
    const result = validateProxyRequest({ ...validBase, seconds: '6' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects empty string seconds', () => {
    const result = validateProxyRequest({ ...validBase, seconds: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects string "twenty" as seconds', () => {
    const result = validateProxyRequest({ ...validBase, seconds: 'twenty' });
    expect(result.ok).toBe(false);
  });
});

describe('proxy-create-video: HD size + model validation', () => {
  it('accepts 1920x1080 with sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, size: '1920x1080', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });

  it('accepts 1080x1920 with sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, size: '1080x1920', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });

  it('accepts 1792x1024 with sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, size: '1792x1024', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });

  it('accepts 1024x1792 with sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, size: '1024x1792', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });

  it('rejects 1920x1080 with sora-2 (wrong model)', () => {
    const result = validateProxyRequest({ ...validBase, size: '1920x1080', model: 'sora-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/sora-2-pro/);
      expect(result.error).toMatch(/1920x1080/);
    }
  });

  it('rejects 1080x1920 with sora-2 (wrong model)', () => {
    const result = validateProxyRequest({ ...validBase, size: '1080x1920', model: 'sora-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/sora-2-pro/);
    }
  });

  it('rejects 1792x1024 with sora-2 (wrong model)', () => {
    const result = validateProxyRequest({ ...validBase, size: '1792x1024', model: 'sora-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects 1024x1792 with sora-2 (wrong model)', () => {
    const result = validateProxyRequest({ ...validBase, size: '1024x1792', model: 'sora-2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('accepts standard sizes with sora-2', () => {
    for (const size of ['1280x720', '720x1280', '1080x1080', '480x480']) {
      expect(validateProxyRequest({ ...validBase, size, model: 'sora-2' })).toEqual({ ok: true });
    }
  });
});

describe('proxy-create-video: API key validation', () => {
  it('rejects missing API key', () => {
    const result = validateProxyRequest({ ...validBase, apiKey: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects API key without sk- prefix', () => {
    const result = validateProxyRequest({ ...validBase, apiKey: 'invalid-key' });
    expect(result.ok).toBe(false);
  });

  it('accepts valid sk- prefixed key', () => {
    expect(validateProxyRequest({ ...validBase, apiKey: 'sk-abc123' })).toEqual({ ok: true });
  });
});

describe('proxy-create-video: combined valid requests', () => {
  it('accepts 20s + 1280x720 + sora-2', () => {
    expect(
      validateProxyRequest({ ...validBase, seconds: '20', size: '1280x720', model: 'sora-2' })
    ).toEqual({ ok: true });
  });

  it('accepts 16s + 1920x1080 + sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, seconds: '16', size: '1920x1080', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });

  it('accepts 20s + 1080x1920 + sora-2-pro', () => {
    expect(
      validateProxyRequest({ ...validBase, seconds: '20', size: '1080x1920', model: 'sora-2-pro' })
    ).toEqual({ ok: true });
  });
});
