// Generate presigned URL for direct video upload to GCS
// Note: Using Node.js runtime as @google-cloud/storage requires Node.js APIs
export const config = { runtime: 'nodejs' };

import { Storage } from '@google-cloud/storage';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'fileName and contentType required' });
    }

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

    return res.status(200).json({
      uploadUrl,
      gcsPath: publicPath,
      objectName,
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    return res.status(500).json({
      error: 'Failed to generate upload URL',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
