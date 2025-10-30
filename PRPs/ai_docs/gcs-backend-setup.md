# Google Cloud Storage + Backend Setup Guide for SceneBuilder

## Overview

Since OpenAI video download links now expire in 1 hour (down from 24 hours per user report), we MUST store videos server-side. This guide covers GCS setup, backend architecture, and database integration.

## Why We Need a Backend

**Problem**: OpenAI videos expire too quickly for SceneBuilder use cases
- Remix feature requires accessing videos later
- Users need to save work-in-progress scenes
- Cannot rely on browser storage alone

**Solution**: Store all generated videos in Google Cloud Storage with metadata in database

## Architecture Decision: Stay with Vite + Vercel Edge Functions

**RECOMMENDED**: Do NOT migrate to Next.js. Keep current architecture and add backend features incrementally.

**Rationale**:
- ✅ Zero migration risk
- ✅ Fastest implementation (1-2 weeks)
- ✅ Vercel Edge Functions work perfectly for this use case
- ✅ Can migrate later if needed

## Step-by-Step Implementation

### Phase 1: GCS Setup (2 hours)

#### 1.1 Create GCS Bucket

```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Login to GCP
gcloud auth login

# Set project
gcloud config set project YOUR-PROJECT-ID

# Create bucket for video storage
gcloud storage buckets create gs://sora-2-app-videos \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --default-storage-class=STANDARD
```

#### 1.2 Configure CORS

Create `cors.json`:
```json
[
  {
    "origin": ["https://yourdomain.com", "http://localhost:3000", "http://localhost:5173"],
    "method": ["GET", "HEAD", "PUT"],
    "responseHeader": ["Content-Type", "Content-Range", "Accept-Ranges"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS:
```bash
gcloud storage buckets update gs://sora-2-app-videos --cors-file=cors.json
```

#### 1.3 Set Lifecycle Policy (Auto-delete old videos)

Create `lifecycle.json`:
```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "NEARLINE"
        },
        "condition": {
          "age": 30
        }
      },
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 365
        }
      }
    ]
  }
}
```

Apply lifecycle:
```bash
gcloud storage buckets update gs://sora-2-app-videos --lifecycle-file=lifecycle.json
```

**Explanation**:
- Videos older than 30 days → Move to Nearline storage (50% cheaper)
- Videos older than 365 days → Auto-delete

#### 1.4 Create Service Account

```bash
# Create service account
gcloud iam service-accounts create sora-video-storage \
  --display-name="Sora Video Storage Service Account"

# Grant permissions (object admin for the specific bucket)
gcloud storage buckets add-iam-policy-binding gs://sora-2-app-videos \
  --member="serviceAccount:sora-video-storage@YOUR-PROJECT-ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create ./gcs-service-account.json \
  --iam-account=sora-video-storage@YOUR-PROJECT-ID.iam.gserviceaccount.com
```

#### 1.5 Add Credentials to Vercel

```bash
# Install Vercel CLI if not already
npm i -g vercel

# Extract values from JSON
cat gcs-service-account.json

# Add to Vercel (in project directory)
vercel env add GCS_PROJECT_ID
# Paste: your-project-id

vercel env add GCS_CLIENT_EMAIL
# Paste: sora-video-storage@your-project-id.iam.gserviceaccount.com

vercel env add GCS_PRIVATE_KEY
# Paste the private_key value (including -----BEGIN/END PRIVATE KEY-----)

vercel env add GCS_BUCKET_NAME
# Paste: sora-2-app-videos
```

**Security Note**: Never commit `gcs-service-account.json` to Git. Add to `.gitignore`.

### Phase 2: Database Setup (1 hour)

#### 2.1 Create Vercel Postgres Database

1. Go to Vercel Dashboard → Your Project → Storage
2. Click "Create Database" → Select "Postgres"
3. Choose region (same as GCS for lower latency)
4. Vercel automatically adds env vars: `POSTGRES_URL`, etc.

#### 2.2 Create Database Schema

Create `scripts/init-db.sql`:
```sql
-- Video metadata table
CREATE TABLE video_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openai_video_id VARCHAR(255) UNIQUE NOT NULL,
  local_id VARCHAR(255) UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  size VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  gcs_path TEXT NOT NULL,
  gcs_thumbnail_path TEXT,
  remixed_from_id UUID REFERENCES video_metadata(id),
  remix_count INTEGER DEFAULT 0,
  user_session_id VARCHAR(255)
);

-- Indexes for common queries
CREATE INDEX idx_openai_video_id ON video_metadata(openai_video_id);
CREATE INDEX idx_local_id ON video_metadata(local_id);
CREATE INDEX idx_expires_at ON video_metadata(expires_at);
CREATE INDEX idx_user_session ON video_metadata(user_session_id, created_at DESC);

-- Scene segments table
CREATE TABLE scene_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES video_metadata(id) ON DELETE CASCADE,
  segment_number INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  gcs_path TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_video_segments ON scene_segments(video_id, segment_number);
```

Run migration:
```bash
# Connect to database using Vercel CLI
vercel env pull .env.local
psql $POSTGRES_URL < scripts/init-db.sql
```

### Phase 3: Backend API Implementation (6 hours)

#### 3.1 Install Dependencies

```bash
npm install @google-cloud/storage @vercel/postgres
```

#### 3.2 Create API Endpoints

**File**: `api/get-upload-url.ts` (Presigned URL Generator)

```typescript
export const config = { runtime: 'edge' };

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { fileName, contentType } = await req.json();

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const objectName = `videos/${Date.now()}-${fileName}`;
    const file = bucket.file(objectName);

    // Generate signed URL (valid for 15 minutes)
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    const publicPath = `gs://${process.env.GCS_BUCKET_NAME}/${objectName}`;

    return Response.json({
      uploadUrl,
      gcsPath: publicPath,
      objectName,
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    return Response.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
```

**File**: `api/save-video-metadata.ts` (Store Metadata)

```typescript
export const config = { runtime: 'edge' };

import { sql } from '@vercel/postgres';

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const {
      openaiVideoId,
      prompt,
      seconds,
      size,
      model,
      gcsPath,
      gcsThumbnailPath,
      remixedFromId,
      userSessionId,
    } = await req.json();

    const localId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await sql`
      INSERT INTO video_metadata (
        openai_video_id,
        local_id,
        prompt,
        seconds,
        size,
        model,
        expires_at,
        gcs_path,
        gcs_thumbnail_path,
        remixed_from_id,
        user_session_id
      )
      VALUES (
        ${openaiVideoId},
        ${localId},
        ${prompt},
        ${seconds},
        ${size},
        ${model},
        ${expiresAt},
        ${gcsPath},
        ${gcsThumbnailPath || null},
        ${remixedFromId || null},
        ${userSessionId || null}
      )
      RETURNING *
    `;

    return Response.json(result.rows[0]);
  } catch (error) {
    console.error('Save metadata error:', error);
    return Response.json(
      { error: 'Failed to save metadata' },
      { status: 500 }
    );
  }
}
```

**File**: `api/get-video-url.ts` (Generate Download URL)

```typescript
export const config = { runtime: 'edge' };

import { Storage } from '@google-cloud/storage';
import { sql } from '@vercel/postgres';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return Response.json({ error: 'videoId required' }, { status: 400 });
  }

  try {
    // Get video metadata from database
    const result = await sql`
      SELECT gcs_path FROM video_metadata
      WHERE local_id = ${videoId} OR openai_video_id = ${videoId}
    `;

    if (result.rows.length === 0) {
      return Response.json({ error: 'Video not found' }, { status: 404 });
    }

    const gcsPath = result.rows[0].gcs_path;
    const objectName = gcsPath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');

    // Generate signed download URL (valid 1 hour)
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(objectName);

    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return Response.json({ downloadUrl });
  } catch (error) {
    console.error('Get video URL error:', error);
    return Response.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
```

**File**: `api/list-scenes.ts` (Get Scene History)

```typescript
export const config = { runtime: 'edge' };

import { sql } from '@vercel/postgres';

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const userSessionId = searchParams.get('sessionId');

  try {
    const result = await sql`
      SELECT
        id,
        openai_video_id,
        local_id,
        prompt,
        seconds,
        size,
        model,
        created_at,
        expires_at,
        gcs_thumbnail_path,
        remixed_from_id,
        remix_count
      FROM video_metadata
      WHERE
        user_session_id = ${userSessionId || 'anonymous'}
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const scenes = result.rows.map(row => ({
      id: row.local_id,
      openaiVideoId: row.openai_video_id,
      prompt: row.prompt,
      parameters: {
        seconds: row.seconds,
        size: row.size,
        model: row.model,
      },
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
      thumbnailUrl: row.gcs_thumbnail_path,
      remixedFrom: row.remixed_from_id,
      remixCount: row.remix_count,
    }));

    return Response.json({ scenes });
  } catch (error) {
    console.error('List scenes error:', error);
    return Response.json(
      { error: 'Failed to list scenes' },
      { status: 500 }
    );
  }
}
```

### Phase 4: Frontend Integration (4 hours)

#### 4.1 Create Cloud Storage Service

**File**: `src/services/cloudStorageService.ts`

```typescript
export interface VideoUploadResult {
  localId: string;
  gcsPath: string;
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
    },
    onProgress?: (percent: number) => void
  ): Promise<VideoUploadResult> {
    // Step 1: Get presigned upload URL
    const { uploadUrl, gcsPath, objectName } = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `${metadata.openaiVideoId}.mp4`,
        contentType: 'video/mp4',
      }),
    }).then(r => r.json());

    // Step 2: Upload to GCS with progress tracking
    await this.uploadWithProgress(uploadUrl, videoBlob, onProgress);

    // Step 3: Generate thumbnail and upload
    const thumbnail = await this.generateThumbnail(videoBlob);
    const thumbnailPath = await this.uploadThumbnail(thumbnail, objectName);

    // Step 4: Save metadata to database
    const userSessionId = this.getUserSessionId();
    const result = await fetch('/api/save-video-metadata', {
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
        userSessionId,
      }),
    }).then(r => r.json());

    return {
      localId: result.local_id,
      gcsPath: result.gcs_path,
    };
  }

  /**
   * Load video from cloud storage
   */
  async loadVideo(videoId: string): Promise<Blob> {
    const { downloadUrl } = await fetch(`/api/get-video-url?videoId=${videoId}`)
      .then(r => r.json());

    const response = await fetch(downloadUrl);
    return response.blob();
  }

  /**
   * Get list of user's scenes
   */
  async listScenes(): Promise<Scene[]> {
    const userSessionId = this.getUserSessionId();
    const { scenes } = await fetch(`/api/list-scenes?sessionId=${userSessionId}`)
      .then(r => r.json());
    return scenes;
  }

  private uploadWithProgress(
    url: string,
    blob: Blob,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress?.((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', reject);
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', 'video/mp4');
      xhr.send(blob);
    });
  }

  private async generateThumbnail(videoBlob: Blob): Promise<Blob> {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    await new Promise(resolve => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });

    video.currentTime = 0.1; // First frame

    await new Promise(resolve => {
      video.addEventListener('seeked', resolve, { once: true });
    });

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = Math.floor(240 / (video.videoWidth / video.videoHeight));

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    URL.revokeObjectURL(video.src);

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    });
  }

  private async uploadThumbnail(thumbnail: Blob, videoObjectName: string): Promise<string> {
    const thumbnailName = videoObjectName.replace('.mp4', '-thumb.jpg');

    const { uploadUrl, gcsPath } = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: thumbnailName,
        contentType: 'image/jpeg',
      }),
    }).then(r => r.json());

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: thumbnail,
    });

    return gcsPath;
  }

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
```

#### 4.2 Update Store to Use Cloud Storage

Modify `src/stores/sceneBuilderStore.ts` to call `cloudStorageService.uploadVideo()` after video generation.

## Cost Estimation

**Assumptions**:
- 100 users
- 10 videos per user
- Average video size: 50 MB
- Total: 50 GB storage

**Monthly Costs**:
- GCS Storage (Standard): 50 GB × $0.020/GB = $1.00/month
- Lifecycle transition to Nearline (after 30 days): 50% cost savings
- Vercel Postgres: $20/month (Starter plan)
- Egress (downloads): ~$5-10/month (depends on usage)
- **Total**: ~$26-31/month

## Resources

- GCS Signed URLs: https://cloud.google.com/storage/docs/access-control/signed-urls
- Vercel Postgres: https://vercel.com/docs/storage/vercel-postgres
- @google-cloud/storage SDK: https://googleapis.dev/nodejs/storage/latest/
- GCS Best Practices: https://cloud.google.com/storage/docs/best-practices-media-workload
