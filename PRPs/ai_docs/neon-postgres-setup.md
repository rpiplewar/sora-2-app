# Neon Postgres Setup Guide for SceneBuilder

## Why Neon?

- ✅ **FREE tier**: 0.5GB storage, 3GB data transfer (enough for thousands of videos)
- ✅ **Edge-compatible**: Works with Vercel Edge Functions (no runtime change needed)
- ✅ **Serverless**: No connection limits, autoscaling
- ✅ **Fast cold starts**: <1 second
- ✅ **Git-like branching**: Separate databases for dev/staging/production
- ✅ **Use same SDK**: `@vercel/postgres` works with Neon

---

## Setup Steps (15 minutes)

### Step 1: Create Neon Account & Project

1. Go to https://neon.tech
2. Sign up with GitHub (easiest)
3. Click "Create a project"
4. Configure:
   - **Project name**: `sora-2-app` (or your choice)
   - **Postgres version**: 16 (latest)
   - **Region**: Choose closest to your Vercel region
     - If Vercel is in `us-east-1` → Choose Neon `US East (Ohio)`
     - If Vercel is in `us-west-1` → Choose Neon `US West (Oregon)`
5. Click "Create Project"

### Step 2: Get Connection String

After project creation, you'll see:

```
Connection String:
postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Important**: Copy this connection string. You'll need it in Step 4.

**Connection string format**:
- **Username**: Auto-generated (e.g., `neondb_owner`)
- **Password**: Auto-generated (displayed once)
- **Host**: `ep-xxx-xxx.us-east-2.aws.neon.tech`
- **Database**: `neondb` (default)
- **SSL**: Required (`sslmode=require`)

### Step 3: Install Dependencies

```bash
npm install @vercel/postgres
```

**Why `@vercel/postgres`?** Even though it's called "Vercel Postgres", this SDK works with ANY Postgres database (including Neon). It's just a wrapper around the standard `pg` library optimized for serverless.

### Step 4: Add Connection String to Vercel

**Option A: Via Vercel Dashboard**

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add new variable:
   - **Name**: `POSTGRES_URL`
   - **Value**: `postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
   - **Environment**: Production, Preview, Development (select all)
3. Click "Save"

**Option B: Via Vercel CLI**

```bash
vercel env add POSTGRES_URL
# Paste the connection string when prompted
# Select all environments (Production, Preview, Development)
```

**For local development**, pull environment variables:

```bash
vercel env pull .env.local
```

This creates `.env.local` file with `POSTGRES_URL` for local testing.

### Step 5: Create Database Schema

Create `scripts/init-neon-db.sql`:

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
  openai_expires_at TIMESTAMP WITH TIME ZONE,
  gcs_path TEXT NOT NULL,
  gcs_thumbnail_path TEXT,
  remixed_from_id UUID REFERENCES video_metadata(id),
  remix_count INTEGER DEFAULT 0,
  user_session_id VARCHAR(255),
  is_remix BOOLEAN DEFAULT FALSE,
  parent_prompt TEXT
);

-- Indexes for performance
CREATE INDEX idx_openai_video_id ON video_metadata(openai_video_id);
CREATE INDEX idx_local_id ON video_metadata(local_id);
CREATE INDEX idx_expires_at ON video_metadata(openai_expires_at);
CREATE INDEX idx_user_session ON video_metadata(user_session_id, created_at DESC);
CREATE INDEX idx_created_at ON video_metadata(created_at DESC);

-- Scene segments table (for multi-scene timelines)
CREATE TABLE scene_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id VARCHAR(255) NOT NULL,
  video_id UUID REFERENCES video_metadata(id) ON DELETE CASCADE,
  segment_number INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  gcs_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scene_segments ON scene_segments(scene_id, segment_number);
CREATE INDEX idx_video_segments ON scene_segments(video_id);

-- Create view for easy querying
CREATE VIEW active_videos AS
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
```

**Run migration using Neon SQL Editor**:

1. Go to Neon Dashboard → Your Project → SQL Editor
2. Copy/paste the SQL schema above
3. Click "Run" (or Cmd+Enter)
4. Verify tables created: Run `\dt` in SQL Editor

**Or run via command line**:

```bash
# Pull connection string
vercel env pull .env.local

# Run migration (requires psql installed)
psql $(grep POSTGRES_URL .env.local | cut -d '=' -f2-) < scripts/init-neon-db.sql
```

### Step 6: Test Connection

Create `scripts/test-neon-connection.js`:

```javascript
import { sql } from '@vercel/postgres';

async function testConnection() {
  try {
    // Test query
    const result = await sql`SELECT NOW() as current_time, version() as postgres_version`;
    console.log('✅ Connected to Neon Postgres!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('Postgres version:', result.rows[0].postgres_version);

    // Test table exists
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    console.log('✅ Tables found:', tables.rows.map(r => r.table_name));

  } catch (error) {
    console.error('❌ Connection failed:', error);
    process.exit(1);
  }
}

testConnection();
```

Run test:

```bash
node --env-file=.env.local scripts/test-neon-connection.js
```

Expected output:
```
✅ Connected to Neon Postgres!
Current time: 2025-10-31T...
Postgres version: PostgreSQL 16.0 on x86_64-pc-linux-gnu...
✅ Tables found: [ 'video_metadata', 'scene_segments' ]
```

---

## Usage in API Endpoints (NO CODE CHANGES!)

The exact same code from the PRP works with Neon:

```typescript
// api/save-video-metadata.ts
import { sql } from '@vercel/postgres';

export const config = { runtime: 'edge' }; // ✅ Still works with Neon!

export default async function handler(req: Request) {
  const { openaiVideoId, prompt, seconds, size, model, gcsPath } = await req.json();

  const result = await sql`
    INSERT INTO video_metadata (
      openai_video_id, local_id, prompt, seconds, size, model, gcs_path
    )
    VALUES (
      ${openaiVideoId},
      ${crypto.randomUUID()},
      ${prompt},
      ${seconds},
      ${size},
      ${model},
      ${gcsPath}
    )
    RETURNING *
  `;

  return Response.json(result.rows[0]);
}
```

**Key Point**: `@vercel/postgres` automatically uses the `POSTGRES_URL` environment variable, so no configuration needed in code!

---

## Neon-Specific Features You Can Use

### 1. Branch Databases (Git-Like)

Create separate databases for development/staging:

```bash
# In Neon Dashboard → Your Project → Branches
# Click "Create Branch"
# Name: "development"
# This creates a copy of your production schema

# Get branch connection string
# Add to Vercel as POSTGRES_URL_DEV
```

### 2. Connection Pooling (Built-In)

Neon automatically handles connection pooling, so you don't need PgBouncer for serverless.

### 3. Autoscaling

Neon automatically scales compute up/down based on load. On FREE tier:
- **Compute**: 1 vCPU, 256 MB RAM (enough for thousands of queries/sec)
- **Storage**: 0.5 GB (upgradable to 10GB on paid plan)

### 4. Monitor Usage

View usage in Neon Dashboard → Your Project → Monitoring:
- Storage used
- Compute hours used
- Data transfer
- Query performance

**FREE tier limits**:
- 0.5 GB storage
- 3 GB data transfer/month
- Unlimited compute hours (with auto-suspend after 5 min inactivity)

---

## Estimated Costs

### FREE Tier (Your Current Scale)

Assuming:
- 100 videos stored
- Average metadata: 1 KB per video
- 10 queries per minute

**Storage**: 100 KB (video metadata) + 1 MB (indexes) = ~1.1 MB
**Data transfer**: ~100 MB/month (well under 3 GB limit)
**Cost**: **$0/month** ✅

### When You Outgrow FREE Tier

Neon Pro Plan: **$19/month** includes:
- 10 GB storage
- 100 GB data transfer
- Priority support
- Branching

**Cost per GB over limit**: $0.16/GB storage, $0.09/GB data transfer

---

## Troubleshooting

### Issue: "Connection timeout" in Edge Functions

**Solution**: Neon connections are optimized for serverless, but if you see timeouts:

```typescript
// Add connection timeout to query
const result = await sql.query('SELECT * FROM video_metadata LIMIT 10', [], {
  statementTimeout: 5000 // 5 seconds
});
```

### Issue: "Too many connections"

**Solution**: Neon has built-in connection pooling, but if you hit limits:

1. Use connection pooling string (add `?pooled=true`):
   ```
   POSTGRES_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require&pooled=true
   ```

2. Or use Neon's pooler endpoint (different host):
   ```
   POSTGRES_URL=postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb
   ```

### Issue: "SSL required" error

**Solution**: Neon requires SSL. Ensure connection string has `?sslmode=require` at the end.

---

## Migration Path (If You Need to Scale)

### When to Upgrade

Upgrade to Neon Pro ($19/month) when:
- Storage > 0.5 GB (~500,000 video metadata records)
- Data transfer > 3 GB/month (~30,000 video loads)
- Need branching for staging environments

### Alternative: Switch to Supabase or Self-Hosted

If Neon gets expensive, you can:
1. Export data: `pg_dump $POSTGRES_URL > backup.sql`
2. Import to new database: `psql $NEW_URL < backup.sql`
3. Update `POSTGRES_URL` in Vercel

No code changes needed! Postgres is Postgres.

---

## Comparison: Neon vs Vercel Postgres

| Feature | Neon | Vercel Postgres |
|---------|------|-----------------|
| **FREE tier** | ✅ 0.5GB storage | ❌ No free tier |
| **Minimum cost** | $0/month | $20/month |
| **Edge compatible** | ✅ Yes | ✅ Yes |
| **Connection pooling** | ✅ Built-in | ✅ Built-in |
| **Branch databases** | ✅ Yes | ❌ No |
| **Autoscaling** | ✅ Yes | ⚠️ Manual |
| **Cold start** | <1 second | <1 second |
| **Max storage (paid)** | Unlimited | 512 GB |
| **Setup complexity** | Medium | Easy |

**Recommendation**: Start with Neon FREE tier. If you need simpler setup and have budget, switch to Vercel Postgres later (takes 10 minutes to migrate).

---

## Resources

- **Neon Documentation**: https://neon.tech/docs/introduction
- **Neon + Vercel Guide**: https://neon.tech/docs/guides/vercel
- **@vercel/postgres SDK**: https://vercel.com/docs/storage/vercel-postgres/sdk
- **Postgres SQL Reference**: https://www.postgresql.org/docs/current/

---

## Summary: What Changes in Your PRP

**What Stays the Same**:
- ✅ All API endpoint code (uses `@vercel/postgres` SDK)
- ✅ All TypeScript types
- ✅ All queries (standard SQL)
- ✅ Edge Functions runtime (still works)

**What Changes**:
- 🔄 Setup: Create Neon account instead of Vercel Postgres
- 🔄 Connection string: Use Neon URL instead of Vercel URL
- 🔄 Cost: $0/month instead of $20/month

**That's it!** Everything else in the PRP remains unchanged.
