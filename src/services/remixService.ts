import axios from 'axios';
import type { VideoJob, PromptDelta } from '../types';

const API_BASE = '/api'; // Vercel Edge Functions

/**
 * Analyze delta between original and new prompt
 * Uses GPT-4o-mini for cost-effective analysis (~$0.0003 per call)
 */
export async function analyzePromptDelta(
  originalPrompt: string,
  newPrompt: string,
  apiKey: string
): Promise<PromptDelta> {
  const response = await axios.post(`${API_BASE}/proxy-prompt-delta`, {
    apiKey,
    originalPrompt,
    newPrompt
  });
  return response.data;
}

/**
 * Create remix of existing video using delta prompt
 * Reuses polling pattern from openaiService
 */
export async function createRemix(
  videoId: string,
  deltaPrompt: string,
  apiKey: string,
  inputReference?: Blob,
  onProgress?: (progress: number) => void
): Promise<VideoJob> {
  // Start remix job
  const response = await axios.post(`${API_BASE}/proxy-remix-video`, {
    apiKey,
    videoId,
    prompt: deltaPrompt,
    inputReference
  });

  const job: VideoJob = response.data;

  // Poll for completion using existing pattern
  return pollVideoStatus(job.id, apiKey, onProgress);
}

/**
 * Poll video status (reuse from openaiService pattern)
 */
async function pollVideoStatus(
  videoId: string,
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<VideoJob> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await axios.get(`${API_BASE}/proxy-get-status`, {
      params: { videoId },
      headers: { 'x-api-key': apiKey }
    });

    const video: VideoJob = response.data;

    if (video.progress && onProgress) {
      onProgress(video.progress);
    }

    if (video.status === 'completed' || video.status === 'failed') {
      return video;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Download completed video (reuse from openaiService)
 */
export async function downloadVideo(
  videoId: string,
  apiKey: string
): Promise<Blob> {
  const response = await axios.get(
    `https://api.openai.com/v1/videos/${videoId}/content`,
    {
      params: { variant: 'video' },
      headers: { 'Authorization': `Bearer ${apiKey}` },
      responseType: 'blob',
    }
  );
  return response.data;
}

/**
 * Check if video is still available for remix (24-hour window)
 */
export function isVideoExpiredForRemix(createdAt: number): boolean {
  const expiresAt = createdAt + (24 * 60 * 60 * 1000);
  return Date.now() > expiresAt;
}

/**
 * Get time remaining before video expires
 */
export function getTimeRemaining(createdAt: number): string {
  const expiresAt = createdAt + (24 * 60 * 60 * 1000);
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) return 'Expired';

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
