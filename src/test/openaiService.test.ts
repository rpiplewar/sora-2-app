import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock axios before importing openaiService ───────────────────────────────
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import axios from 'axios';
import { openaiService } from '../services/openaiService';

const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── createVideo ─────────────────────────────────────────────────────────────

describe('openaiService.createVideo', () => {
  it('uses JSON when no inputReference', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'job-1', status: 'queued' } });

    const result = await openaiService.createVideo({
      apiKey: 'sk-test',
      prompt: 'test',
      seconds: '8',
      size: '1280x720',
      model: 'sora-2',
    });

    expect(mockedAxios.post).toHaveBeenCalledOnce();
    expect(result.id).toBe('job-1');
  });

  it('uses FormData when inputReference is provided', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'job-2', status: 'queued' } });

    const blob = new Blob(['frame'], { type: 'image/jpeg' });
    await openaiService.createVideo({
      apiKey: 'sk-test',
      prompt: 'test',
      seconds: '8',
      size: '1280x720',
      model: 'sora-2',
      inputReference: blob,
    });

    const callArgs = mockedAxios.post.mock.calls[0];
    expect(callArgs[1]).toBeInstanceOf(FormData);
    expect(callArgs[2]?.headers?.['Content-Type']).toBe('multipart/form-data');
  });
});

// ─── pollUntilComplete: happy path ───────────────────────────────────────────

describe('openaiService.pollUntilComplete — success path', () => {
  it('returns immediately when job is already completed', async () => {
    mockedAxios.get.mockResolvedValue({ data: { id: 'job-1', status: 'completed', progress: 100 } });

    const promise = openaiService.pollUntilComplete('job-1', 'sk-test');
    await vi.runAllTimersAsync();
    const job = await promise;

    expect(job.status).toBe('completed');
    expect(mockedAxios.get).toHaveBeenCalledOnce();
  });

  it('polls multiple times before completion', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'queued', progress: 0 } })
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'in_progress', progress: 50 } })
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'completed', progress: 100 } });

    const promise = openaiService.pollUntilComplete('job-1', 'sk-test');
    // Advance timers past 2 poll intervals (10s each)
    await vi.advanceTimersByTimeAsync(25000);
    const job = await promise;

    expect(job.status).toBe('completed');
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('calls onProgress callback with progress values', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'in_progress', progress: 40 } })
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'completed', progress: 100 } });

    const onProgress = vi.fn();
    const promise = openaiService.pollUntilComplete('job-1', 'sk-test', onProgress);
    await vi.advanceTimersByTimeAsync(15000);
    await promise;

    expect(onProgress).toHaveBeenCalledWith(40);
    expect(onProgress).toHaveBeenCalledWith(100);
  });
});

// ─── pollUntilComplete: failure path ─────────────────────────────────────────

describe('openaiService.pollUntilComplete — failure path', () => {
  it('throws when job status is failed', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { id: 'job-1', status: 'failed', error: { message: 'Model error' } },
    });

    // Set up rejects BEFORE promise can reject to avoid unhandled rejection
    await expect(
      openaiService.pollUntilComplete('job-1', 'sk-test')
    ).rejects.toThrow('Model error');
  });

  it('throws generic message when failed job has no error message', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { id: 'job-1', status: 'failed' },
    });

    await expect(
      openaiService.pollUntilComplete('job-1', 'sk-test')
    ).rejects.toThrow('Video generation failed');
  });
});

// ─── pollUntilComplete: 20-minute timeout ────────────────────────────────────

describe('openaiService.pollUntilComplete — 20-minute timeout', () => {
  it('throws timeout error after 20 minutes of in_progress', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { id: 'job-stuck', status: 'in_progress', progress: 30 },
    });

    // Wire up rejection assertion FIRST, then advance timers
    const rejectAssertion = expect(
      openaiService.pollUntilComplete('job-stuck', 'sk-test')
    ).rejects.toThrow(/timed out after 20 minutes/);

    // Advance past 20-minute timeout (20 * 60 * 1000 ms)
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    await rejectAssertion;
  });

  it('does NOT time out before 20 minutes', async () => {
    // First 19 minutes: in_progress, then complete
    let callCount = 0;
    mockedAxios.get.mockImplementation(() => {
      callCount++;
      // Complete on the call that happens just before 20 min timeout
      if (callCount > 5) {
        return Promise.resolve({ data: { id: 'job-1', status: 'completed', progress: 100 } });
      }
      return Promise.resolve({ data: { id: 'job-1', status: 'in_progress', progress: 10 } });
    });

    const promise = openaiService.pollUntilComplete('job-1', 'sk-test');
    // Advance enough for a few polls but less than 20 minutes
    await vi.advanceTimersByTimeAsync(19 * 60 * 1000);
    const job = await promise;
    expect(job.status).toBe('completed');
  });

  it('uses 10-second poll interval (not 2 seconds)', async () => {
    let callCount = 0;
    mockedAxios.get.mockImplementation(() => {
      callCount++;
      if (callCount >= 3) {
        return Promise.resolve({ data: { id: 'job-1', status: 'completed', progress: 100 } });
      }
      return Promise.resolve({ data: { id: 'job-1', status: 'queued', progress: 0 } });
    });

    const promise = openaiService.pollUntilComplete('job-1', 'sk-test');

    // After 5 seconds: only 1 call (initial), not yet at 10s interval
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(1);

    // After 10 seconds: 2nd poll fires
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(2);

    // After 20 seconds: 3rd poll fires, returns completed
    await vi.advanceTimersByTimeAsync(10000);
    await promise;
    expect(callCount).toBe(3);
  });
});

// ─── downloadVideo ───────────────────────────────────────────────────────────

describe('openaiService.downloadVideo', () => {
  it('returns blob from OpenAI CDN', async () => {
    const mockBlob = new Blob(['video-data'], { type: 'video/mp4' });
    mockedAxios.get.mockResolvedValueOnce({ data: mockBlob });

    const result = await openaiService.downloadVideo('vid-123', 'sk-test');

    expect(result).toBe(mockBlob);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.openai.com/v1/videos/vid-123/content',
      expect.objectContaining({
        params: { variant: 'video' },
        headers: { Authorization: 'Bearer sk-test' },
        responseType: 'blob',
      })
    );
  });
});
