-- Add extended_from_id field to track scene extensions
-- This allows us to build sequential timelines of extended scenes

ALTER TABLE video_metadata
ADD COLUMN IF NOT EXISTS extended_from_id UUID REFERENCES video_metadata(id);

ALTER TABLE video_metadata
ADD COLUMN IF NOT EXISTS is_extension BOOLEAN DEFAULT FALSE;

-- Create index for extension queries
CREATE INDEX IF NOT EXISTS idx_extended_from ON video_metadata(extended_from_id);

-- Update existing data: videos without remixed_from_id and with parent videos are likely extensions
-- (This is a best-effort migration - new extends will be properly marked)
