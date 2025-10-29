# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sora Video Generator is a privacy-first web application for generating AI videos with OpenAI Sora 2. The app is frontend-heavy with minimal backend (Vercel Edge Functions for CORS proxy only). All video processing happens client-side using FFmpeg.wasm.

## Development Commands

### Local Development
```bash
npm run dev:vercel    # Full development with Edge Functions (REQUIRED for testing video generation)
npm run dev           # Frontend only (no API proxy - limited functionality)
```

**IMPORTANT**: Always use `npm run dev:vercel` when testing video generation features, as the app requires Vercel Edge Functions to proxy requests to OpenAI API.

### Build & Deploy
```bash
npm run build         # TypeScript compilation + Vite build
npm run lint          # ESLint check
npm run preview       # Preview production build
vercel --prod         # Deploy to production
```

## Architecture

### Data Flow
```
Browser → sessionStorage (API key) → Vercel Edge Function (CORS proxy) → OpenAI API
OpenAI API → Browser (video blobs) → Canvas API (frame extraction) → FFmpeg.wasm (concatenation) → Download
```

### Key Architectural Patterns

**State Management**: Zustand store (`src/stores/videoStore.ts`) manages:
- API key (persisted to sessionStorage via `storageService`)
- Video segments array with status tracking
- FFmpeg initialization state
- Processing state and errors

**Frame Continuity Pipeline**: The core feature that enables seamless multi-segment videos:
1. Generate first segment normally
2. Extract last frame from completed segment using Canvas API (`src/utils/videoFrameExtractor.ts`)
3. Pass extracted frame as `inputReference` (Blob) to next segment's API call
4. OpenAI's `input_reference` parameter ensures visual continuity
5. Repeat for all segments

**Video Processing**:
- FFmpeg.wasm is initialized once on app mount (takes 5-10 seconds)
- Concatenation uses `-c copy` flag (no re-encoding, 100x faster)
- All processing happens in browser memory (privacy-first)

### Directory Structure

```
src/
  components/        # React components (form, progress, player, etc.)
  services/          # Business logic layer
    openaiService.ts    # OpenAI API wrapper (supports multipart/form-data)
    videoService.ts     # FFmpeg.wasm wrapper (singleton)
    planningService.ts  # AI prompt planning
    storageService.ts   # sessionStorage wrapper for API key
  stores/            # Zustand state management
  utils/             # Frame extraction utility
  types/             # TypeScript interfaces
api/                 # Vercel Edge Functions (runtime: 'edge')
  proxy-create-video.ts   # POST /v1/videos (supports both JSON and FormData)
  proxy-get-status.ts     # GET /v1/videos/{id}
  proxy-plan-prompts.ts   # POST /v1/chat/completions (AI planning)
```

### Critical Implementation Details

**1. OpenAI Sora 2 API Integration**

The app uses these Sora 2 endpoints via Edge Function proxies:
- `POST /v1/videos` - Create video generation job
- `GET /v1/videos/{id}` - Poll job status and progress
- `GET /v1/videos/{id}/content` - Download video (direct to OpenAI, no proxy)

**API Requirements:**
- `seconds` must be a STRING: `"4"`, `"8"`, or `"12"` (NOT numbers)
- `model`: `"sora-2"` or `"sora-2-pro"`
- `size`: Landscape (`"1280x720"`, `"1792x1024"`) or Portrait (`"720x1280"`, `"1024x1792"`)
- `input_reference`: Image blob for frame continuity (requires multipart/form-data)

**2. Edge Function Dual Content-Type Support**

`api/proxy-create-video.ts` handles both JSON and multipart/form-data:
- JSON: Used for first segment (no input_reference)
- FormData: Used for subsequent segments (with input_reference image)

When adding new parameters, update BOTH code paths in the Edge Function.

**3. Frame Extraction (`src/utils/videoFrameExtractor.ts`)**

Uses HTML5 Canvas API to extract the last frame as JPEG:
- Creates off-screen `<video>` element
- Seeks to `duration - 0.1s` (avoids black frames)
- Draws frame to canvas matching video dimensions
- Converts to JPEG blob at 95% quality
- Takes ~100-500ms per video

**4. FFmpeg.wasm Initialization**

FFmpeg must be initialized BEFORE any video operations:
- Loads from CDN: `@ffmpeg/core@0.12.6`
- Requires `vercel.json` headers for SharedArrayBuffer:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`
- Initialization takes 5-10 seconds (done on app mount)
- Singleton pattern in `videoService.ts`

**5. Video Concatenation**

FFmpeg command: `ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4`
- `-c copy`: No re-encoding (critical for speed)
- Operates on virtual filesystem (no disk I/O)
- Cleanup is essential to avoid memory leaks

### Type System

All types are centralized in `src/types/index.ts`:
- `VideoSegment`: UI state for each segment
- `VideoJob`: OpenAI API job response
- `GenerationConfig`: User form data
- `CreateVideoRequest`: API request payload
- `VideoStoreState`: Zustand store interface

### Security & Privacy

- API keys stored in sessionStorage (cleared on tab close)
- Videos never uploaded to any server
- Direct download from OpenAI CDN (bypasses proxy)
- HTTPS only, COOP/COEP headers enabled

### Performance Considerations

- Desktop browsers recommended (mobile has memory limits for FFmpeg)
- Memory warning triggered at 1.5GB estimated usage
- Max 10 segments to prevent browser crashes
- Polling interval: 2 seconds (avoids rate limiting)
- FFmpeg initialization: Async, non-blocking

## Scene Builder - Video Import

### Importing from Homepage

Users can import videos generated on the homepage into Scene Builder:

1. **From Homepage**: Click "Scene Builder" button on any video card
2. **Auto-Import**: Scene Builder automatically loads the video
3. **Mode Detection**:
   - Videos <24h old: Full remix + extend capabilities
   - Videos >24h old: Extend-only mode (remix disabled)

### Import Flow

```
Homepage Video
  ↓ (Click "Scene Builder")
Navigate to /scene-builder?import=true&videoId={id}&mode={remix|extend}
  ↓
Scene Builder Mount
  ↓
Auto-download video from OpenAI
  ↓
Create initial scene from imported video
```

### Expiration Handling

- 24-hour window enforced per OpenAI Remix API
- Expired videos show warning: "Remix disabled, but you can extend it"
- Analyze Changes and Remix Scene buttons disabled for expired videos
- Approve & Continue still works (extension doesn't require remix API)

### Key Files

- `src/stores/sceneBuilderStore.ts`: `importFromHomepage()` action
- `src/components/VideoHistoryGallery.tsx`: "Scene Builder" button
- `src/pages/SceneBuilder.tsx`: Import detection on mount

## Common Development Tasks

### Adding New Video Parameters

1. Update `CreateVideoRequest` type in `src/types/index.ts`
2. Update `openaiService.ts` FormData append logic (line 20-25)
3. Update `api/proxy-create-video.ts` for both JSON and FormData paths
4. Add UI controls in `src/components/PromptForm.tsx`
5. Update store if needed in `src/stores/videoStore.ts`

### Modifying Frame Extraction

Frame extraction logic is isolated in `src/utils/videoFrameExtractor.ts`. Key parameters:
- Seek offset: `duration - 0.1` (line 25)
- JPEG quality: `0.95` (line 44)
- Image format: `'image/jpeg'` (line 43)

### Debugging Video Generation

Enable verbose logging:
- FFmpeg logs: Check console for `[FFmpeg]` prefix
- Video service: `[VideoService]` prefix
- OpenAI polling: Monitor network tab for `/api/proxy-get-status` calls

Common issues:
- "Invalid seconds value": Ensure `seconds` is a string, not number
- "FFmpeg not initialized": Check COOP/COEP headers in network tab
- Frame extraction fails: Verify video blob is valid MP4

## Testing

No automated tests currently. Manual testing checklist:
1. Enter valid API key (starts with `sk-proj-`)
2. Test single segment generation (no frame continuity)
3. Test multi-segment generation (with frame continuity)
4. Verify FFmpeg concatenation completes
5. Test both landscape and portrait orientations
6. Verify video download works
7. Test AI prompt planning feature

## Deployment

Vercel is the primary deployment platform:
- Edge Functions require Vercel runtime
- `vercel.json` configures required headers
- Deploy with: `vercel --prod`

Alternative platforms must support:
- Edge/serverless functions
- COOP/COEP headers for SharedArrayBuffer
- Large memory limits for FFmpeg.wasm
