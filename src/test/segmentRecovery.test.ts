import { describe, it, expect, vi } from 'vitest';

async function generateSegments(
  numSegments: number,
  generateFn: (i: number) => Promise<string> // returns blob "content"
): Promise<{ blobs: string[]; failed: number[] }> {
  const blobs: string[] = [];
  const failed: number[] = [];

  for (let i = 0; i < numSegments; i++) {
    try {
      const blob = await generateFn(i);
      blobs.push(blob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push(i);
      // Continue — don't rethrow (matches App.tsx fix)
      void message;
    }
  }

  if (blobs.length === 0) {
    throw new Error('All segments failed to generate. Please try again.');
  }

  return { blobs, failed };
}

describe('Segment error recovery (App.tsx loop logic)', () => {
  it('completes successfully when all segments succeed', async () => {
    const gen = vi.fn().mockResolvedValue('blob-data');
    const { blobs, failed } = await generateSegments(3, gen);
    expect(blobs).toHaveLength(3);
    expect(failed).toHaveLength(0);
    expect(gen).toHaveBeenCalledTimes(3);
  });

  it('continues with remaining segments when one fails (does not abort)', async () => {
    let call = 0;
    const gen = vi.fn().mockImplementation(() => {
      call++;
      if (call === 2) return Promise.reject(new Error('Segment 2 timed out'));
      return Promise.resolve(`blob-${call}`);
    });

    const { blobs, failed } = await generateSegments(3, gen);

    expect(blobs).toHaveLength(2);   // segments 1 and 3 succeeded
    expect(failed).toEqual([1]);      // segment 2 (index 1) failed
    expect(gen).toHaveBeenCalledTimes(3); // all 3 were attempted
  });

  it('continues when first segment fails', async () => {
    let call = 0;
    const gen = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error('First failed'));
      return Promise.resolve(`blob-${call}`);
    });

    const { blobs, failed } = await generateSegments(3, gen);
    expect(blobs).toHaveLength(2);
    expect(failed).toEqual([0]);
  });

  it('continues when last segment fails', async () => {
    let call = 0;
    const gen = vi.fn().mockImplementation(() => {
      call++;
      if (call === 3) return Promise.reject(new Error('Last failed'));
      return Promise.resolve(`blob-${call}`);
    });

    const { blobs, failed } = await generateSegments(3, gen);
    expect(blobs).toHaveLength(2);
    expect(failed).toEqual([2]);
  });

  it('throws "All segments failed" when every segment fails', async () => {
    const gen = vi.fn().mockRejectedValue(new Error('API error'));

    await expect(generateSegments(3, gen)).rejects.toThrow(
      'All segments failed to generate. Please try again.'
    );
    expect(gen).toHaveBeenCalledTimes(3); // all were still attempted
  });

  it('handles 5-segment run with 2 failures', async () => {
    const failOn = new Set([1, 3]); // fail segments at index 1 and 3
    let call = 0;
    const gen = vi.fn().mockImplementation(() => {
      const idx = call++;
      if (failOn.has(idx)) return Promise.reject(new Error(`Seg ${idx} failed`));
      return Promise.resolve(`blob-${idx}`);
    });

    const { blobs, failed } = await generateSegments(5, gen);
    expect(blobs).toHaveLength(3);
    expect(failed).toHaveLength(2);
    expect(gen).toHaveBeenCalledTimes(5);
  });

  it('handles single-segment success', async () => {
    const gen = vi.fn().mockResolvedValue('single-blob');
    const { blobs, failed } = await generateSegments(1, gen);
    expect(blobs).toHaveLength(1);
    expect(failed).toHaveLength(0);
  });

  it('handles single-segment failure', async () => {
    const gen = vi.fn().mockRejectedValue(new Error('single fail'));
    await expect(generateSegments(1, gen)).rejects.toThrow(
      'All segments failed to generate. Please try again.'
    );
  });
});
