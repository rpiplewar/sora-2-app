// Generate signed download URL for video stored in GCS
// Note: Using Node.js runtime as @google-cloud/storage requires Node.js APIs
export const config = { runtime: 'nodejs' };

import { Storage } from '@google-cloud/storage';
import { sql } from '@vercel/postgres';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = req.query.videoId as string;

  if (!videoId) {
    return res.status(400).json({ error: 'videoId query parameter required' });
  }

  try {
    // Get video metadata from database
    const result = await sql`
      SELECT gcs_path, gcs_thumbnail_path FROM video_metadata
      WHERE local_id = ${videoId} OR openai_video_id = ${videoId}
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const gcsPath = result.rows[0].gcs_path;
    const thumbnailPath = result.rows[0].gcs_thumbnail_path;
    const objectName = gcsPath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');

    // Generate signed download URL (valid 1 hour)
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(objectName);

    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    // Generate thumbnail URL if exists
    let thumbnailUrl = null;
    if (thumbnailPath) {
      const thumbnailObjectName = thumbnailPath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');
      const thumbnailFile = bucket.file(thumbnailObjectName);
      const [url] = await thumbnailFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      thumbnailUrl = url;
    }

    return res.status(200).json({
      downloadUrl,
      thumbnailUrl,
    });
  } catch (error) {
    console.error('Get video URL error:', error);
    return res.status(500).json({
      error: 'Failed to generate download URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
