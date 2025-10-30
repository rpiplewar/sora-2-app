# Database Migration: Add Scene Extension Tracking

## What This Migration Does

Adds `extended_from_id` and `is_extension` fields to the `video_metadata` table to properly track scene extensions and display them sequentially in the timeline.

## Run the Migration

### Option 1: Using Neon Console (Recommended)

1. Go to https://console.neon.tech
2. Select your project
3. Go to "SQL Editor"
4. Copy and paste the contents of `scripts/add-extend-field.sql`
5. Click "Run" to execute

### Option 2: Using the Node.js Script

```bash
# Make sure your .env or .env.local has POSTGRES_URL set
node --env-file=.env.local scripts/run-migration.js
```

### Option 3: Manual SQL Execution

Connect to your database and run:

```sql
-- Add extended_from_id field to track scene extensions
ALTER TABLE video_metadata
ADD COLUMN IF NOT EXISTS extended_from_id UUID REFERENCES video_metadata(id);

ALTER TABLE video_metadata
ADD COLUMN IF NOT EXISTS is_extension BOOLEAN DEFAULT FALSE;

-- Create index for extension queries
CREATE INDEX IF NOT EXISTS idx_extended_from ON video_metadata(extended_from_id);
```

## Verify Migration

After running, verify the fields were added:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'video_metadata'
  AND column_name IN ('extended_from_id', 'is_extension');
```

You should see both columns listed.

## What Changes After Migration

### Before
- Extended scenes appeared as separate, independent scenes
- No visual connection between original and extended scenes

### After
- Extended scenes are grouped with their parent scene
- Timeline shows "+ N extended scenes" indicator
- Extension chain is preserved: Original → Extension 1 → Extension 2, etc.
- Each extension can also have its own remix versions

## Testing

1. Run the migration
2. Restart your dev server: `npm run dev:vercel`
3. Create a new scene
4. Extend that scene
5. Refresh the page
6. You should see:
   - ONE scene (not two)
   - Timeline indicator showing the extension
   - Both videos linked together

## Rollback (if needed)

If you need to undo this migration:

```sql
ALTER TABLE video_metadata DROP COLUMN IF EXISTS extended_from_id;
ALTER TABLE video_metadata DROP COLUMN IF EXISTS is_extension;
DROP INDEX IF EXISTS idx_extended_from ON video_metadata;
```

Note: This will not delete any video data, but extension relationships will be lost.
