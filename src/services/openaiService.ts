import axios from 'axios';
import type { CreateVideoRequest, VideoJob } from '../types';

const API_BASE = '/api'; // Vercel Edge Functions

export const openaiService = {
  /**
   * Create a video generation job via Vercel Edge Function proxy
   * @param request - Video creation request parameters
   * @returns Video job with id and status
   */
  async createVideo(request: CreateVideoRequest): Promise<VideoJob> {
    console.log('[OpenAI] Creating video:', { model: request.model, seconds: request.seconds, size: request.size, hasInputRef: !!request.inputReference });
    // If inputReference is provided, use FormData for multipart/form-data
    if (request.inputReference) {
      const formData = new FormData();
      formData.append('apiKey', request.apiKey);
      formData.append('prompt', request.prompt);
      formData.append('seconds', request.seconds);
      formData.append('size', request.size);
      formData.append('model', request.model);
      formData.append('inputReference', request.inputReference, 'frame.jpg');

      if (request.remixedFromVideoId) {
        formData.append('remixedFromVideoId', request.remixedFromVideoId);
      }

      const response = await axios.post(`${API_BASE}/proxy-create-video`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }

    // Otherwise use JSON
    const response = await axios.post(`${API_BASE}/proxy-create-video`, request);
    console.log('[OpenAI] Video job created:', { id: response.data.id, status: response.data.status });
    return response.data;
  },

  /**
   * Get the status of a video generation job
   * @param videoId - The video job ID
   * @param apiKey - OpenAI API key
   * @returns Current job status and progress
   */
  async getVideoStatus(videoId: string, apiKey: string): Promise<VideoJob> {
    const response = await axios.get(`${API_BASE}/proxy-get-status`, {
      params: { videoId },
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  },

  /**
   * Poll a video job until it completes or fails
   * @param videoId - The video job ID
   * @param apiKey - OpenAI API key
   * @param onProgress - Callback for progress updates (0-100)
   * @returns Completed job data
   */
  async pollUntilComplete(
    videoId: string,
    apiKey: string,
    onProgress?: (progress: number) => void
  ): Promise<VideoJob> {
    const POLL_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
    const POLL_INTERVAL_MS = 10 * 1000; // 10 seconds
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed > POLL_TIMEOUT_MS) {
        throw new Error(`Video generation timed out after 20 minutes. Job ID: ${videoId}. Please try again.`);
      }

      const job = await this.getVideoStatus(videoId, apiKey);
      console.log(`[Poll] ${videoId}: status=${job.status}, progress=${job.progress ?? '?'}%, elapsed=${Math.round(elapsed / 1000)}s`);

      // Update progress if callback provided
      if (onProgress && job.progress !== undefined) {
        onProgress(job.progress);
      }

      // Check if completed
      if (job.status === 'completed') {
        return job;
      }

      // Check if failed
      if (job.status === 'failed') {
        throw new Error(job.error?.message || 'Video generation failed');
      }

      // Wait 10 seconds before next poll (API recommends 10-20 seconds)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  },

  /**
   * Download video content directly from OpenAI CDN
   * IMPORTANT: This bypasses the proxy and downloads directly from OpenAI
   * @param videoId - The video job ID
   * @param apiKey - OpenAI API key
   * @returns Video blob
   */
  async downloadVideo(videoId: string, apiKey: string): Promise<Blob> {
    console.log('[OpenAI] Downloading video:', videoId);
    const response = await axios.get(
      `https://api.openai.com/v1/videos/${videoId}/content`,
      {
        params: { variant: 'video' },
        headers: { 'Authorization': `Bearer ${apiKey}` },
        responseType: 'blob',
      }
    );
    console.log('[OpenAI] Video downloaded, size:', response.data.size, 'bytes');
    return response.data;
  },
};
