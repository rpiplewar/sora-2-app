export interface VideoUploadResult {
  localId: string;
  databaseId: string; // Database UUID for foreign key references
  gcsPath: string;
  thumbnailUrl?: string;
}

export interface Scene {
  id: string;
  databaseId: string; // Database UUID for foreign key references
  openaiVideoId: string;
  prompt: string;
  parameters: {
    seconds: string;
    size: string;
    model: string;
  };
  createdAt: number;
  expiresAt: number | null;
  thumbnailUrl: string | null;
  remixedFrom: string | null;
  extendedFrom: string | null;
  remixCount: number;
  isRemix: boolean;
  isExtension: boolean;
  parentPrompt: string | null;
}

export class CloudStorageService {
  /**
   * Upload video to GCS after generation
   */
  async uploadVideo(
    videoBlob: Blob,
    metadata: {
      openaiVideoId: string;
      prompt: string;
      seconds: number;
      size: string;
      model: string;
      remixedFrom?: string;
      extendedFrom?: string;
      sceneId?: string;
    },
    onProgress?: (percent: number) => void
  ): Promise<VideoUploadResult> {
    // Step 1: Get presigned upload URL
    const uploadResponse = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `${metadata.openaiVideoId}.mp4`,
        contentType: 'video/mp4',
      }),
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to get upload URL');
    }

    const { uploadUrl, gcsPath, objectName } = await uploadResponse.json();

    // Step 2: Upload to GCS with progress tracking
    await this.uploadWithProgress(uploadUrl, videoBlob, onProgress);

    // Step 3: Generate thumbnail and upload
    const thumbnail = await this.generateThumbnail(videoBlob);
    const thumbnailPath = await this.uploadThumbnail(thumbnail, objectName);

    // Step 4: Save metadata to database
    const userSessionId = this.getUserSessionId();
    const metadataResponse = await fetch('/api/save-video-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openaiVideoId: metadata.openaiVideoId,
        prompt: metadata.prompt,
        seconds: metadata.seconds,
        size: metadata.size,
        model: metadata.model,
        gcsPath,
        gcsThumbnailPath: thumbnailPath,
        remixedFromId: metadata.remixedFrom,
        extendedFromId: metadata.extendedFrom,
        userSessionId,
        sceneId: metadata.sceneId,
      }),
    });

    if (!metadataResponse.ok) {
      throw new Error('Failed to save video metadata');
    }

    const result = await metadataResponse.json();

    return {
      localId: result.local_id,
      databaseId: result.id, // Database UUID for foreign key references
      gcsPath: result.gcs_path,
      thumbnailUrl: thumbnailPath,
    };
  }

  /**
   * Load video from cloud storage
   */
  async loadVideo(videoId: string): Promise<Blob> {
    const response = await fetch(`/api/get-video-url?videoId=${videoId}`);

    if (!response.ok) {
      throw new Error('Failed to get video URL');
    }

    const { downloadUrl } = await response.json();

    const videoResponse = await fetch(downloadUrl);

    if (!videoResponse.ok) {
      throw new Error('Failed to download video');
    }

    return videoResponse.blob();
  }

  /**
   * Get list of user's scenes
   */
  async listScenes(): Promise<Scene[]> {
    const userSessionId = this.getUserSessionId();
    const response = await fetch(`/api/list-scenes?sessionId=${userSessionId}`);

    if (!response.ok) {
      throw new Error('Failed to list scenes');
    }

    const { scenes } = await response.json();
    return scenes;
  }

  /**
   * Upload with progress tracking
   */
  private uploadWithProgress(
    url: string,
    blob: Blob,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'video/mp4');
      xhr.send(blob);
    });
  }

  /**
   * Generate thumbnail from video (first frame)
   */
  private async generateThumbnail(videoBlob: Blob): Promise<Blob> {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    // Wait for video metadata to load
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', reject, { once: true });
    });

    // Seek to 0.1 seconds (first frame)
    video.currentTime = 0.1;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', reject, { once: true });
    });

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = Math.floor(240 / (video.videoWidth / video.videoHeight));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    URL.revokeObjectURL(video.src);

    // Convert to blob
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        },
        'image/jpeg',
        0.85
      );
    });
  }

  /**
   * Upload thumbnail to GCS
   */
  private async uploadThumbnail(thumbnail: Blob, videoObjectName: string): Promise<string> {
    const thumbnailName = videoObjectName.replace('.mp4', '-thumb.jpg').replace('videos/', 'thumbnails/');

    const uploadResponse = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: thumbnailName,
        contentType: 'image/jpeg',
      }),
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to get thumbnail upload URL');
    }

    const { uploadUrl, gcsPath } = await uploadResponse.json();

    const thumbnailUploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: thumbnail,
    });

    if (!thumbnailUploadResponse.ok) {
      throw new Error('Failed to upload thumbnail');
    }

    return gcsPath;
  }

  /**
   * Get or create user session ID
   */
  private getUserSessionId(): string {
    let sessionId = sessionStorage.getItem('user_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('user_session_id', sessionId);
    }
    return sessionId;
  }
}

export const cloudStorageService = new CloudStorageService();
