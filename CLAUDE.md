# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (must use vercel dev, not vite alone — Edge Functions required)
npm run dev:vercel       # Start dev server with Vercel Edge Functions (port 3000)
npm run dev              # Vite only (no API functions — limited use)

# Build & lint
npm run build            # TypeScript check + Vite build
npm run lint             # ESLint

# Preview production build
npm run preview
```

> **Important:** Use `npm run dev:vercel` for local development. Running plain `npm run dev` skips the Vercel Edge Functions in `/api/`, so video generation, GCS uploads, and database calls won't work.

## Architecture

### Tech Stack
- **Frontend:** React 19 + TypeScript, Vite, TailwindCSS 4, Zustand, React Router 7
- **Backend:** Vercel Edge Functions (`/api/`) — CORS proxies to OpenAI + GCS auth
- **Storage:** Google Cloud Storage (videos), Neon PostgreSQL (metadata)
- **Video processing:** FFmpeg.wasm (client-side concatenation), HTML5 Canvas (frame extraction)

### Two Main Features

**1. Home Page (`/`)** — Simple video generation
- User enters prompt → optional AI-powered segment planning → OpenAI Sora 2 API → FFmpeg concat → download

**2. Scene Builder (`/scene-builder`)** — Multi-scene management
- Create → Remix → Extend workflow with full version history
- Scenes persist to GCS + PostgreSQL; videos are lazy-loaded

### Data Flow
```
User Input
  → Edge Function (/api/proxy-create-video.ts)
  → OpenAI Sora 2 API (polling via /api/proxy-get-status.ts)
  → Video blob downloaded in browser
  → FFmpeg.wasm concatenation (client-side)
  → GCS presigned upload URL (/api/get-upload-url.ts)
  → Metadata saved to DB (/api/save-video-metadata.ts)
```

### State Management (Zustand)
- `useVideoStore` — home page state: API key, generation segments, FFmpeg readiness
- `useSceneBuilderStore` — scene hierarchy, lazy-loaded video blobs, prompt versioning, remix/extend workflows

### Key Services (`src/services/`)
| File | Purpose |
|---|---|
| `openaiService.ts` | OpenAI Sora 2 API: create jobs, poll status, download blobs |
| `videoService.ts` | FFmpeg.wasm wrapper: init, concatenate blobs with `-c copy` |
| `cloudStorageService.ts` | GCS presigned uploads, thumbnail generation, DB save |
| `planningService.ts` | AI prompt-to-segments breakdown |
| `remixService.ts` | Remix and extend operations with frame continuity |
| `storageService.ts` | SessionStorage wrapper for API key (cleared on tab close) |

### Edge Functions (`/api/`)
All are thin CORS proxies — they forward requests to OpenAI or handle GCS auth. Direct CDN downloads bypass the proxy.

### Headers
`vercel.json` sets `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers required for `SharedArrayBuffer` / FFmpeg.wasm.

## Environment Variables

Required in `.env` (copy from `.env.local`):
```bash
POSTGRES_URL=           # Neon PostgreSQL connection string
GCS_PROJECT_ID=         # Google Cloud Storage project
GCS_CLIENT_EMAIL=       # GCS service account email
GCS_PRIVATE_KEY=        # GCS service account private key
GCS_BUCKET_NAME=        # GCS bucket name
```

OpenAI API key is entered by the user at runtime and stored in `sessionStorage` (never persisted server-side).

## Scene Builder Architecture

Scenes have a hierarchy: **root scene → remixes → extensions**. Each node stores:
- `videoUrl` (GCS URL), `thumbnailUrl`, `prompt`, `parentId`
- Lazy-loaded video blobs in Zustand (not persisted)

Version history is a stack of edits per scene node. Prompt deltas are analyzed via `/api/proxy-prompt-delta.ts`.
