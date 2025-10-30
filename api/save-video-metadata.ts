// Save video metadata to database after upload
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
      extendedFromId,
      userSessionId,
      sceneId,
    } = await req.json();

    // Validate required fields
    if (!openaiVideoId || !prompt || !seconds || !size || !model || !gcsPath) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const localId = crypto.randomUUID();
    const openaiExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now

    const result = await sql`
      INSERT INTO video_metadata (
        openai_video_id,
        local_id,
        prompt,
        seconds,
        size,
        model,
        openai_expires_at,
        gcs_path,
        gcs_thumbnail_path,
        remixed_from_id,
        extended_from_id,
        user_session_id,
        is_remix,
        is_extension,
        parent_prompt
      )
      VALUES (
        ${openaiVideoId},
        ${localId},
        ${prompt},
        ${seconds},
        ${size},
        ${model},
        ${openaiExpiresAt},
        ${gcsPath},
        ${gcsThumbnailPath || null},
        ${remixedFromId || null},
        ${extendedFromId || null},
        ${userSessionId || 'anonymous'},
        ${!!remixedFromId},
        ${!!extendedFromId},
        ${remixedFromId ? prompt : null}
      )
      RETURNING *
    `;

    // If this is part of a scene, also create scene segment entry
    if (sceneId) {
      await sql`
        INSERT INTO scene_segments (
          scene_id,
          video_id,
          segment_number,
          prompt,
          duration_seconds,
          gcs_path
        )
        VALUES (
          ${sceneId},
          ${result.rows[0].id},
          0,
          ${prompt},
          ${seconds},
          ${gcsPath}
        )
      `;
    }

    return new Response(JSON.stringify(result.rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Save metadata error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to save metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
