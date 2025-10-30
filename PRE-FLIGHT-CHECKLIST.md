# Pre-Flight Checklist - Run Before Local Development

## ✅ Quick Status Check

Run this verification script first:

```bash
node scripts/verify-setup.js
```

If the script doesn't exist yet, follow the manual checklist below.

---

## 📋 Manual Checklist

### 1. Google Cloud Storage Setup

#### Check if bucket exists:

```bash
# Install gcloud CLI if not already installed
# macOS: brew install google-cloud-sdk
# Or visit: https://cloud.google.com/sdk/docs/install

# Login to GCloud
gcloud auth login

# Set project
gcloud config set project luminous-style-464500-c1

# Check if bucket exists
gcloud storage buckets describe gs://sora-2-app-videos
```

#### If bucket doesn't exist, create it:

```bash
# Create bucket
gcloud storage buckets create gs://sora-2-app-videos \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --default-storage-class=STANDARD
```

#### Configure CORS (REQUIRED for local development):

Create `cors.json`:
```json
[
  {
    "origin": ["http://localhost:5173", "http://localhost:3000", "https://*.vercel.app"],
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

#### Verify service account permissions:

```bash
# Check service account has access
gcloud storage buckets get-iam-policy gs://sora-2-app-videos | grep bhume-storage-service
```

If no permissions, add them:
```bash
gcloud storage buckets add-iam-policy-binding gs://sora-2-app-videos \
  --member="serviceAccount:bhume-storage-service@luminous-style-464500-c1.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

### 2. Neon Postgres Database

#### Verify database connection:

```bash
# Test connection
node --env-file=.env.local scripts/init-neon-db.js
```

Expected output:
```
✅ Database initialized successfully!
📋 Tables found:
  - active_videos
  - scene_segments
  - video_metadata
```

#### If database initialization fails:

1. Check that `.env.local` has correct `POSTGRES_URL`
2. Verify Neon database is active at https://neon.tech
3. Check that connection string includes `?sslmode=require`

---

### 3. Environment Variables

#### Verify all required variables exist:

```bash
# Check .env.local exists
ls -la .env.local

# Verify variables (without showing sensitive values)
cat .env.local | grep -E "^[A-Z_]+" | cut -d '=' -f 1
```

Expected output:
```
POSTGRES_URL
GCS_PROJECT_ID
GCS_CLIENT_EMAIL
GCS_PRIVATE_KEY
GCS_BUCKET_NAME
```

#### If any variables are missing:

The `.env.local` file should already be created. If not, create it:

```bash
# .env.local content is already set up in your project
# If missing, refer to luminous-style-464500-c1-382597b71a58.json
```

---

### 4. Dependencies

#### Verify all npm packages are installed:

```bash
npm list @google-cloud/storage @vercel/postgres react-router-dom
```

#### If any are missing:

```bash
npm install
```

---

### 5. Build Verification

#### Run build to check for errors:

```bash
npm run build
```

Expected output:
```
✓ built in X.XXs
```

If build fails, check the error messages and fix TypeScript issues.

---

## 🚀 Start Local Development

Once all checks pass, start the development server:

```bash
npm run dev:vercel
```

**Important**: Use `npm run dev:vercel` (not `npm run dev`) so API endpoints work correctly.

Then open:
- **Homepage**: http://localhost:3000/
- **SceneBuilder**: http://localhost:3000/scene-builder

---

## 🧪 Quick Test Plan

### Test 1: API Endpoints (Optional - can test via UI)

```bash
# Test get-upload-url (local dev server must be running)
curl -X POST http://localhost:5173/api/get-upload-url \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.mp4","contentType":"video/mp4"}'
```

Expected: JSON with `uploadUrl`, `gcsPath`, `objectName`

### Test 2: SceneBuilder UI

1. Navigate to http://localhost:5173/scene-builder
2. Enter your OpenAI API key
3. Click "Create New Scene"
4. Enter a simple prompt: "A cat walking on the beach"
5. Select 4 seconds, 1280x720
6. Click "Create Scene"
7. Wait for video generation (may take 2-5 minutes)
8. Verify video appears in player
9. Check browser console for any errors

### Test 3: Database Persistence

1. Create a scene (as above)
2. Refresh the page
3. Scene should still appear (loaded from database)

---

## 🐛 Common Issues

### Issue: "Failed to generate upload URL"

**Symptoms**: Error when creating a scene, console shows GCS error

**Fix**:
1. Verify GCS bucket exists: `gcloud storage buckets describe gs://sora-2-app-videos`
2. Check service account permissions (see above)
3. Verify `GCS_PRIVATE_KEY` in `.env.local` has proper newlines (not `\n`)

### Issue: "Database connection failed"

**Symptoms**: Can't load scenes, database errors in console

**Fix**:
1. Check Neon database is active: https://neon.tech
2. Verify `POSTGRES_URL` in `.env.local`
3. Re-run database init: `node --env-file=.env.local scripts/init-neon-db.js`

### Issue: "CORS error" in browser console

**Symptoms**: Video upload fails with CORS policy error

**Fix**:
1. Apply CORS configuration (see GCS setup above)
2. Ensure `http://localhost:5173` is in allowed origins
3. Restart dev server after applying CORS

### Issue: API endpoints return 404

**Symptoms**: All API calls fail with 404

**Fix**:
1. Ensure Vercel dev server is NOT running (`vercel dev` conflicts with Vite)
2. Use Vite dev server: `npm run dev`
3. API routes in `api/` folder work with Vite during local dev via proxy

**Note**: For full API testing, you may need to use:
```bash
npm run dev:vercel
```
Instead of `npm run dev`

### Issue: TypeScript errors

**Symptoms**: Build fails with type errors

**Fix**:
1. Run `npm run build` to see specific errors
2. All errors should be fixed already, but if new ones appear:
3. Check that imports use `type` keyword where required
4. Verify all dependencies are installed

---

## 📝 Ready to Deploy?

Once local development works, follow **DEPLOYMENT.md** for production deployment steps.

---

## 🆘 Still Having Issues?

1. Check browser console for errors
2. Check terminal for server errors
3. Verify all environment variables are set correctly
4. Review PRPs/working-memory/scene-builder-v2/.plan
5. Check Neon database logs at https://neon.tech
6. Check GCS bucket settings in Google Cloud Console
