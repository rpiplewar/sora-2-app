# 🚀 START HERE - Run SceneBuilder V2 Locally

## ✅ Current Status

Your verification shows:
- ✅ Environment variables configured
- ✅ Database connected and initialized
- ✅ Dependencies installed
- ✅ All components created
- ✅ Build passing

## 🔥 ONE STEP REMAINING

You need to set up the Google Cloud Storage bucket before running locally.

### Option 1: Automated Setup (Recommended)

```bash
# Make script executable
chmod +x scripts/setup-gcs-bucket.sh

# Run setup
./scripts/setup-gcs-bucket.sh
```

This will:
1. Check if gcloud CLI is installed
2. Create the GCS bucket (if not exists)
3. Configure CORS for localhost
4. Set up service account permissions

### Option 2: Manual Setup

If you don't have gcloud CLI or prefer manual setup:

#### Step 1: Install gcloud CLI

**macOS**:
```bash
brew install google-cloud-sdk
```

**Other platforms**: https://cloud.google.com/sdk/docs/install

#### Step 2: Authenticate and set project

```bash
gcloud auth login
gcloud config set project luminous-style-464500-c1
```

#### Step 3: Create bucket

```bash
gcloud storage buckets create gs://sora-2-app-videos \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --default-storage-class=STANDARD
```

#### Step 4: Configure CORS

Create `cors.json`:
```json
[
  {
    "origin": ["http://localhost:5173", "http://localhost:3000"],
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

#### Step 5: Set permissions

```bash
gcloud storage buckets add-iam-policy-binding gs://sora-2-app-videos \
  --member="serviceAccount:bhume-storage-service@luminous-style-464500-c1.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

## 🎬 Start Local Development

Once GCS setup is complete:

```bash
# Copy environment variables for Vercel dev
cp .env.local .env

# Start Vercel dev server
npm run dev:vercel
```

**Important**:
- Use `npm run dev:vercel` (not `npm run dev`) to ensure API endpoints work correctly
- Vercel dev reads from `.env` (not `.env.local`), so we copy it first

Open your browser:
- **Homepage**: http://localhost:3000/
- **SceneBuilder**: http://localhost:3000/scene-builder

---

## 🧪 Quick Test

1. Navigate to http://localhost:5173/scene-builder
2. Enter your OpenAI API key (starts with `sk-`)
3. Click "Create New Scene"
4. Enter a simple prompt: "A red apple rotating on a table"
5. Select: 4 seconds, 1280x720
6. Click "Create Scene"
7. Wait 2-5 minutes for video generation
8. Video should appear in the player

---

## 🐛 Troubleshooting

### If you see "Failed to generate upload URL"

**Cause**: GCS bucket not set up or CORS not configured

**Fix**: Run the setup script above

### If you see CORS errors in browser console

**Cause**: CORS not configured or localhost not in allowed origins

**Fix**:
```bash
gcloud storage buckets describe gs://sora-2-app-videos
# Check that CORS includes "http://localhost:5173"
```

### If database connection fails

**Cause**: Neon database might be suspended (FREE tier auto-suspends)

**Fix**: Just wait 5-10 seconds, Neon will auto-wake up

### If API endpoints return 500 errors

**Cause**: Environment variables might not be loaded

**Fix**: Restart dev server with env file:
```bash
npm run dev
```

---

## 📝 Next Steps

After local testing works:

1. **Deploy to Vercel**: Follow `DEPLOYMENT.md`
2. **Read feature docs**: See `SCENEBUILDER-V2-README.md`
3. **Set up monitoring**: Add error tracking (optional)

---

## 📚 Documentation Index

- **START-HERE.md** (this file) - Quick start guide
- **PRE-FLIGHT-CHECKLIST.md** - Detailed setup checklist
- **SCENEBUILDER-V2-README.md** - Feature documentation
- **DEPLOYMENT.md** - Production deployment guide
- **PRPs/working-memory/scene-builder-v2/.plan** - Complete PRP

---

## 🆘 Need Help?

1. Check browser console for errors
2. Check terminal for server errors
3. Review PRE-FLIGHT-CHECKLIST.md
4. Verify environment variables in .env.local
5. Check Neon database status at https://neon.tech

---

## ✨ You're Almost There!

Just run the GCS setup script and you'll be ready to go! 🚀
