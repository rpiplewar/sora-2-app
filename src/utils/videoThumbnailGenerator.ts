export interface ThumbnailData {
  timestamp: number;
  blob: Blob;
  url: string;
}

export class SegmentThumbnailGenerator {
  /**
   * Generate thumbnails from video at regular intervals
   * Uses requestVideoFrameCallback for frame-accurate capture
   */
  async generateThumbnails(
    videoBlob: Blob,
    segmentDuration: number,
    interval: number = 1 // Generate every 1 second
  ): Promise<ThumbnailData[]> {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    // Wait for video metadata to load
    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });

    const thumbnails: ThumbnailData[] = [];
    const count = Math.floor(segmentDuration / interval);

    for (let i = 0; i < count; i++) {
      const timestamp = i * interval;
      video.currentTime = timestamp;

      // Wait for seek to complete
      await new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
      });

      // Use requestVideoFrameCallback for frame-accurate capture
      const blob = await this.captureFrame(video);

      thumbnails.push({
        timestamp,
        blob,
        url: URL.createObjectURL(blob),
      });
    }

    // Cleanup
    URL.revokeObjectURL(video.src);
    return thumbnails;
  }

  /**
   * Capture a single frame from video at current time
   */
  private async captureFrame(video: HTMLVideoElement): Promise<Blob> {
    return new Promise<Blob>((resolve) => {
      // Check if requestVideoFrameCallback is available
      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(() => {
          const blob = this.drawVideoFrame(video);
          resolve(blob);
        });
      } else {
        // Fallback for browsers without requestVideoFrameCallback
        const blob = this.drawVideoFrame(video);
        resolve(blob);
      }
    });
  }

  /**
   * Draw video frame to canvas and convert to blob
   */
  private drawVideoFrame(video: HTMLVideoElement): Blob {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = Math.floor(120 / (video.videoWidth / video.videoHeight));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert synchronously using canvas.toDataURL for simplicity
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const blob = this.dataURLToBlob(dataUrl);

    return blob;
  }

  /**
   * Convert data URL to blob
   */
  private dataURLToBlob(dataURL: string): Blob {
    const parts = dataURL.split(',');
    const contentType = parts[0].split(':')[1].split(';')[0];
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    return new Blob([arrayBuffer], { type: contentType });
  }

  /**
   * Calculate optimal thumbnail interval based on duration
   */
  static calculateThumbnailInterval(duration: number): number {
    if (duration <= 30) return 1; // 1 second for short videos
    if (duration <= 120) return 2; // 2 seconds for medium videos
    return 5; // 5 seconds for long videos
  }

  /**
   * Cleanup thumbnail URLs to prevent memory leaks
   */
  static cleanupThumbnails(thumbnails: ThumbnailData[]): void {
    thumbnails.forEach((thumb) => {
      URL.revokeObjectURL(thumb.url);
    });
  }
}

export const segmentThumbnailGenerator = new SegmentThumbnailGenerator();
