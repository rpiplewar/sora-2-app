# SceneBuilder V2 Deployment Guide

## Prerequisites

Before deploying, ensure you have:

1. ✅ Google Cloud Storage bucket created (`gs://sora-2-app-videos`)
2. ✅ GCS service account with credentials
3. ✅ Neon Postgres database created
4. ✅ Database schema initialized (run `node --env-file=.env.local scripts/init-neon-db.js`)

## Environment Variables Setup

### Step 1: Add Environment Variables to Vercel

You need to add the following environment variables to your Vercel project. You can do this via the Vercel Dashboard or CLI.

#### Via Vercel CLI

```bash
# Neon Postgres
vercel env add POSTGRES_URL production
# Paste: postgresql://neondb_owner:npg_7BPsYErUXm1D@ep-ancient-surf-a16uqxh3-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# GCS Project ID
vercel env add GCS_PROJECT_ID production
# Paste: luminous-style-464500-c1

# GCS Client Email
vercel env add GCS_CLIENT_EMAIL production
# Paste: bhume-storage-service@luminous-style-464500-c1.iam.gserviceaccount.com

# GCS Private Key (multi-line - copy from .env.local)
vercel env add GCS_PRIVATE_KEY production
# Paste the entire private key including -----BEGIN/END PRIVATE KEY-----

# GCS Bucket Name
vercel env add GCS_BUCKET_NAME production
# Paste: sora-2-app-videos
```

#### Via Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Navigate to Settings → Environment Variables
4. Add each variable:
   - `POSTGRES_URL`
   - `GCS_PROJECT_ID`
   - `GCS_CLIENT_EMAIL`
   - `GCS_PRIVATE_KEY`
   - `GCS_BUCKET_NAME`
5. Select environments: Production, Preview, Development

### Step 2: Verify Environment Variables

After adding variables, pull them to verify:

```bash
vercel env pull .env.production
```

Check that all variables are present in `.env.production`.

## GCS Bucket Configuration

Ensure your GCS bucket is properly configured:

### CORS Configuration

Create `cors.json`:
```json
[
  {
    "origin": ["https://your-domain.vercel.app", "http://localhost:5173"],
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

### Verify Bucket Permissions

```bash
# Check bucket exists
gcloud storage buckets describe gs://sora-2-app-videos

# Verify service account has access
gcloud storage buckets get-iam-policy gs://sora-2-app-videos
```

## Database Migration

If deploying for the first time, initialize the database:

```bash
# Use production connection string
node --env-file=.env.production scripts/init-neon-db.js
```

## Deployment Steps

### Method 1: Automatic Deployment (Recommended)

1. Push to GitHub:
```bash
git add .
git commit -m "feat: SceneBuilder V2 complete implementation"
git push origin scenebuilder-v2-rebuild
```

2. Vercel will automatically deploy when you push to your connected branch

### Method 2: Manual Deployment via CLI

```bash
# Deploy to production
vercel --prod

# Or deploy to preview
vercel
```

### Method 3: Deploy from Vercel Dashboard

1. Go to Vercel Dashboard → Your Project
2. Click "Deployments"
3. Click "Deploy" button
4. Select branch: `scenebuilder-v2-rebuild`

## Post-Deployment Verification

After deployment, verify that everything works:

### 1. Check API Endpoints

```bash
# Replace with your Vercel domain
curl -X POST https://your-domain.vercel.app/api/get-upload-url \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.mp4","contentType":"video/mp4"}'
```

Expected: Should return a JSON with `uploadUrl`, `gcsPath`, `objectName`

### 2. Check Database Connection

```bash
curl https://your-domain.vercel.app/api/list-scenes?sessionId=test
```

Expected: Should return `{"scenes": []}`

### 3. Test SceneBuilder UI

1. Navigate to `https://your-domain.vercel.app/scene-builder`
2. Enter your OpenAI API key
3. Try creating a new scene with a simple prompt
4. Verify video uploads to GCS
5. Check that video appears in database

## Troubleshooting

### Error: "Failed to generate upload URL"

**Cause**: GCS credentials not set correctly

**Solution**:
1. Verify `GCS_PRIVATE_KEY` is set correctly (including newlines)
2. Check that private key doesn't have escaped newlines (`\n` should be actual newlines)
3. Verify service account has `roles/storage.objectAdmin` permission

### Error: "Database connection timeout"

**Cause**: Neon Postgres connection string incorrect

**Solution**:
1. Verify `POSTGRES_URL` is set correctly
2. Check that connection string includes `?sslmode=require`
3. Verify Neon database is active (not suspended)

### Error: "CORS policy" when uploading videos

**Cause**: CORS not configured on GCS bucket

**Solution**:
1. Apply CORS configuration (see above)
2. Add your Vercel domain to allowed origins
3. Verify CORS: `gcloud storage buckets describe gs://sora-2-app-videos`

### Build Fails on Vercel

**Cause**: TypeScript errors or missing dependencies

**Solution**:
1. Run `npm run build` locally to check for errors
2. Ensure all dependencies are in `package.json`
3. Check Vercel build logs for specific errors

## Monitoring & Maintenance

### Check GCS Usage

```bash
# View bucket size
gcloud storage du -sh gs://sora-2-app-videos
```

### Check Neon Database Usage

1. Go to https://neon.tech
2. Navigate to your project
3. Check "Monitoring" tab for:
   - Storage used
   - Data transfer
   - Compute hours

### Check Vercel Function Logs

1. Go to Vercel Dashboard → Your Project
2. Navigate to "Logs" tab
3. Filter by function name (e.g., `api/get-upload-url`)

## Cost Management

### Current Setup Costs

Based on your current setup:
- **Neon Postgres**: FREE tier (0.5GB storage, 3GB transfer/month)
- **GCS Storage**: ~$0.02/GB/month (Standard class)
- **GCS Egress**: ~$0.12/GB (downloads)
- **Vercel**: FREE tier for hobby projects

**Estimated Monthly Cost**: $5-15 (depends on usage)

### Tips to Reduce Costs

1. **Use Lifecycle Policies**: Videos auto-move to Nearline after 30 days (50% cheaper)
2. **Set Auto-Delete**: Videos auto-delete after 365 days
3. **Optimize Thumbnails**: Use lower quality for thumbnails (current: 85% JPEG quality)
4. **Monitor Usage**: Set up billing alerts in GCP

## Rollback Plan

If deployment fails, rollback to previous version:

```bash
# Via Vercel Dashboard
1. Go to Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

# Via CLI
vercel rollback
```

## Support

For issues:
1. Check Vercel logs: `vercel logs`
2. Check GCS logs: Google Cloud Console → Storage → Logs
3. Check Neon logs: Neon Dashboard → Monitoring
4. Review PRP: `PRPs/working-memory/scene-builder-v2/.plan`

## Next Steps

After successful deployment:
1. ✅ Test all SceneBuilder features
2. ✅ Monitor error rates in first 24 hours
3. ✅ Create user documentation
4. ✅ Set up monitoring/alerts
5. ✅ Plan for scaling (if needed)
