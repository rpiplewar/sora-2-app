-- SceneBuilder V2 Database Schema
-- This creates tables for video metadata and scene segments

-- Video metadata table
CREATE TABLE IF NOT EXISTS video_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openai_video_id VARCHAR(255) UNIQUE NOT NULL,
  local_id VARCHAR(255) UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  size VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  openai_expires_at TIMESTAMP WITH TIME ZONE,  -- From OpenAI API (1-24 hours)
  gcs_path TEXT NOT NULL,
  gcs_thumbnail_path TEXT,
  remixed_from_id UUID REFERENCES video_metadata(id),
  remix_count INTEGER DEFAULT 0,
  user_session_id VARCHAR(255),
  is_remix BOOLEAN DEFAULT FALSE,
  parent_prompt TEXT  -- Original prompt before remix
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_openai_video_id ON video_metadata(openai_video_id);
CREATE INDEX IF NOT EXISTS idx_local_id ON video_metadata(local_id);
CREATE INDEX IF NOT EXISTS idx_expires_at ON video_metadata(openai_expires_at);
CREATE INDEX IF NOT EXISTS idx_user_session ON video_metadata(user_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_created_at ON video_metadata(created_at DESC);

-- Scene segments table (for multi-scene timelines)
CREATE TABLE IF NOT EXISTS scene_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id VARCHAR(255) NOT NULL,  -- SceneBuilder scene ID
  video_id UUID REFERENCES video_metadata(id) ON DELETE CASCADE,
  segment_number INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  gcs_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_segments ON scene_segments(scene_id, segment_number);
CREATE INDEX IF NOT EXISTS idx_video_segments ON scene_segments(video_id);

-- Create view for easy querying of active videos
CREATE OR REPLACE VIEW active_videos AS
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
  gcs_path,
  gcs_thumbnail_path,
  remixed_from_id,
  remix_count,
  user_session_id,
  is_remix
FROM video_metadata
WHERE openai_expires_at > NOW() OR openai_expires_at IS NULL
ORDER BY created_at DESC;
