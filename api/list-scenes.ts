// List all scenes for a user session
// Note: Using Node.js runtime to generate signed URLs for thumbnails
export const config = { runtime: 'nodejs' };

import { sql } from '@vercel/postgres';
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
  const userSessionId = (req.query.sessionId as string) || 'anonymous';

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
        openai_expires_at,
        gcs_thumbnail_path,
        remixed_from_id,
        extended_from_id,
        remix_count,
        is_remix,
        is_extension,
        parent_prompt
      FROM video_metadata
      WHERE user_session_id = ${userSessionId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    // Generate signed URLs for thumbnails
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

    const scenesWithSignedUrls = await Promise.all(
      result.rows.map(async (row) => {
        let thumbnailUrl = null;

        // Generate signed URL for thumbnail if it exists
        if (row.gcs_thumbnail_path) {
          try {
            const thumbnailObjectName = row.gcs_thumbnail_path.replace(
              `gs://${process.env.GCS_BUCKET_NAME}/`,
              ''
            );
            const thumbnailFile = bucket.file(thumbnailObjectName);
            const [url] = await thumbnailFile.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 60 * 60 * 1000, // 1 hour
            });
            thumbnailUrl = url;
          } catch (error) {
            console.error('Failed to generate thumbnail URL for', row.local_id, error);
          }
        }

        return {
          id: row.local_id,
          databaseId: row.id, // Database UUID for foreign key references
          openaiVideoId: row.openai_video_id,
          prompt: row.prompt,
          parameters: {
            seconds: String(row.seconds),
            size: row.size,
            model: row.model,
          },
          createdAt: new Date(row.created_at).getTime(),
          expiresAt: row.openai_expires_at ? new Date(row.openai_expires_at).getTime() : null,
          thumbnailUrl,
          remixedFrom: row.remixed_from_id,
          extendedFrom: row.extended_from_id,
          remixCount: row.remix_count,
          isRemix: row.is_remix,
          isExtension: row.is_extension,
          parentPrompt: row.parent_prompt,
        };
      })
    );

    return res.status(200).json({ scenes: scenesWithSignedUrls });
  } catch (error) {
    console.error('List scenes error:', error);
    return res.status(500).json({
      error: 'Failed to list scenes',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
