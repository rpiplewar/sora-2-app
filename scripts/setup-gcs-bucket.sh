#!/bin/bash

# Setup GCS bucket for SceneBuilder V2
# This script creates the bucket and configures CORS for local development

set -e

echo "🪣 Setting up Google Cloud Storage bucket..."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}✗ gcloud CLI not found${NC}"
    echo ""
    echo "Install gcloud CLI:"
    echo "  macOS: brew install google-cloud-sdk"
    echo "  Or visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo -e "${GREEN}✓ gcloud CLI found${NC}"

# Login and set project
echo ""
echo "Setting up GCP project..."
gcloud config set project luminous-style-464500-c1

# Create bucket if it doesn't exist
echo ""
echo "Creating bucket gs://sora-2-app-videos..."
if gcloud storage buckets describe gs://sora-2-app-videos &> /dev/null; then
    echo -e "${YELLOW}⚠ Bucket already exists${NC}"
else
    gcloud storage buckets create gs://sora-2-app-videos \
      --location=us-central1 \
      --uniform-bucket-level-access \
      --default-storage-class=STANDARD
    echo -e "${GREEN}✓ Bucket created${NC}"
fi

# Create CORS configuration
echo ""
echo "Creating CORS configuration..."
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["http://localhost:5173", "http://localhost:3000", "https://*.vercel.app"],
    "method": ["GET", "HEAD", "PUT"],
    "responseHeader": ["Content-Type", "Content-Range", "Accept-Ranges"],
    "maxAgeSeconds": 3600
  }
]
EOF

# Apply CORS
echo "Applying CORS configuration..."
gcloud storage buckets update gs://sora-2-app-videos --cors-file=/tmp/cors.json
echo -e "${GREEN}✓ CORS configured${NC}"

# Verify service account permissions
echo ""
echo "Verifying service account permissions..."
if gcloud storage buckets get-iam-policy gs://sora-2-app-videos | grep -q "bhume-storage-service"; then
    echo -e "${GREEN}✓ Service account has permissions${NC}"
else
    echo -e "${YELLOW}⚠ Adding permissions for service account...${NC}"
    gcloud storage buckets add-iam-policy-binding gs://sora-2-app-videos \
      --member="serviceAccount:bhume-storage-service@luminous-style-464500-c1.iam.gserviceaccount.com" \
      --role="roles/storage.objectAdmin"
    echo -e "${GREEN}✓ Permissions added${NC}"
fi

# Cleanup
rm /tmp/cors.json

echo ""
echo -e "${GREEN}✓ GCS bucket setup complete!${NC}"
echo ""
echo "You can now run local development:"
echo "  npm run dev:vercel"
echo ""
echo "Then navigate to:"
echo "  http://localhost:3000/scene-builder"
