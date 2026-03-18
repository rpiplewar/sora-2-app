// Proxy GCS video through Vercel to satisfy COEP require-corp.
// GCS signed URLs lack Cross-Origin-Resource-Policy headers, so <video src> is
// blocked in COEP environments. This endpoint fetches the video server-side and
// re-serves it with the required header.
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
    const result = await sql`
      SELECT gcs_path FROM video_metadata
      WHERE local_id = ${videoId} OR openai_video_id = ${videoId}
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const gcsPath = result.rows[0].gcs_path as string;
    const objectName = gcsPath.replace(`gs://${process.env.GCS_BUCKET_NAME}/`, '');

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const file = bucket.file(objectName);

    const [metadata] = await file.getMetadata();
    const contentLength = metadata.size;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (contentLength) {
      res.setHeader('Content-Length', String(contentLength));
    }

    // Support range requests for video seeking
    const range = req.headers.range;
    if (range && contentLength) {
      const totalBytes = Number(contentLength);
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : totalBytes - 1;
      const chunkSize = end - start + 1;

      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalBytes}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(chunkSize));
      res.status(206);

      file.createReadStream({ start, end }).pipe(res);
    } else {
      res.setHeader('Accept-Ranges', 'bytes');
      res.status(200);
      file.createReadStream().pipe(res);
    }
  } catch (error) {
    console.error('[proxy-video] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream video',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
