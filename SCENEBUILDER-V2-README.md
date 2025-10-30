# SceneBuilder V2 - Feature Documentation

## Overview

SceneBuilder V2 is a complete rebuild of the SceneBuilder feature with cloud storage backend, proper video persistence, and an improved UI/UX for video remix and extend workflows.

## Key Features

### 1. Cloud Storage Backend
- **Google Cloud Storage**: All generated videos are automatically uploaded to GCS
- **Neon Postgres**: Video metadata stored in database for persistence
- **Signed URLs**: Secure video access with time-limited download URLs
- **Automatic Thumbnails**: First-frame thumbnails generated and uploaded

### 2. Video Persistence
- Videos stored permanently (not just in browser)
- Access previously created scenes across sessions
- Videos expire from OpenAI API (1-24 hours) but remain in GCS
- No reliance on temporary OpenAI download links

### 3. Remix Workflow
- **Text-based Editing**: Edit prompt directly, system automatically remixes
- **Version History Stack**: Vertical stack showing Original → Remix v1 → Remix v2 → Current
- **Click to Preview**: Click any version to view it in the video player
- **No Manual Delta Analysis**: Just edit the prompt and click "Remix"

### 4. Extend Capability
- **Frame Continuity**: Extracts last frame from current video
- **Seamless Extension**: New scene continues from previous scene
- **Creates New Scene**: Extended video becomes a new scene (not a version)

### 5. Timeline UI
- **Thumbnail Filmstrip**: Horizontal timeline showing video frames
- **Click to Seek**: Click any thumbnail to jump to that timestamp
- **Playhead Indicator**: Red line shows current playback position
- **Adaptive Density**: Thumbnail interval adjusts based on video duration

### 6. Planner Mode Toggle
- **Optional AI Planning**: Enable/disable planner mode with toggle
- **Existing Functionality**: Preserves existing planner from Home page
- **Scene-Specific**: Can be enabled per scene

## User Guide

### Getting Started

1. **Navigate to SceneBuilder**
   - From homepage, click "Open Scene Builder"
   - Or navigate to `/scene-builder`

2. **Enter API Key**
   - SceneBuilder uses the same API key storage as homepage
   - Key is stored in sessionStorage (cleared on tab close)

3. **Create First Scene**
   - Enter a video prompt in the text area
   - Select duration (4s, 8s, or 12s)
   - Select size (1280x720 or 1920x1080)
   - Click "Create Scene"

4. **Wait for Generation**
   - Video generates via OpenAI Sora 2 API
   - Progress shown in UI
   - Video automatically uploads to cloud storage
   - Scene appears in video player when complete

### Remixing a Scene

1. **Edit Prompt**
   - Modify the prompt text in the editor
   - Changes are detected automatically

2. **Click "Remix with New Prompt"**
   - System sends remix request to OpenAI API
   - New version generated with edited prompt
   - New version added to remix history stack

3. **View Remix History**
   - Vertical stack shows all versions
   - Click any version to switch to it
   - Currently active version highlighted in blue

### Extending a Scene

1. **Enter Extend Prompt**
   - In "Extend Scene" section, enter what happens next
   - This creates a NEW scene (not a remix version)

2. **Click "Extend Scene"**
   - System extracts last frame from current video
   - Generates new video with frame continuity
   - New scene appears in scenes list

### Using the Timeline

1. **Thumbnail Filmstrip**
   - Appears at bottom of screen when video is loaded
   - Shows thumbnails at 1-5 second intervals

2. **Click to Seek**
   - Click any thumbnail to jump to that point
   - Video player seeks to selected timestamp

3. **Playhead**
   - Red vertical line tracks current playback position
   - Moves as video plays

### Accessing Previous Scenes

- **Automatic Loading**: All your previous scenes load on page load
- **Session-Based**: Scenes tied to your browser session ID
- **Cross-Session**: Scenes persist across browser sessions
- **Click to View**: Click any scene to view it

## Architecture

### Frontend Components

```
src/pages/SceneBuilder.tsx          - Main container page
src/components/scene-builder/
  ├── VideoCanvas.tsx                - Video player with lazy-loading
  ├── RemixHistoryStack.tsx          - Vertical version history
  ├── PromptEditor.tsx               - Text editing + remix/extend buttons
  ├── TimelineView.tsx               - Thumbnail filmstrip container
  ├── TimelineThumbnail.tsx          - Individual thumbnail component
  └── PlannerToggle.tsx              - Enable/disable planner mode
```

### State Management

```
src/stores/sceneBuilderStore.ts     - Zustand store
  - scenes[]                         - All user scenes
  - currentSceneId                   - Active scene
  - isGenerating/isRemixing          - Loading states
  - Actions: create, remix, extend, loadScenes
```

### Services

```
src/services/
  ├── cloudStorageService.ts        - GCS upload/download
  ├── remixService.ts                - Remix API wrapper
  └── videoThumbnailGenerator.ts    - Canvas-based thumbnail extraction
```

### API Endpoints

```
api/
  ├── get-upload-url.ts              - Generate GCS signed URL for upload
  ├── save-video-metadata.ts         - Save metadata to Postgres
  ├── get-video-url.ts               - Generate GCS signed URL for download
  ├── list-scenes.ts                 - List user's scenes from database
  └── proxy-remix-video.ts           - Proxy for OpenAI remix API
```

### Database Schema

```sql
video_metadata
  - id (UUID, primary key)
  - openai_video_id (string, unique)
  - local_id (string, unique)
  - prompt (text)
  - seconds, size, model
  - created_at, openai_expires_at
  - gcs_path, gcs_thumbnail_path
  - remixed_from_id (FK to video_metadata)
  - user_session_id
  - is_remix, parent_prompt

scene_segments (for future multi-scene timelines)
  - id (UUID, primary key)
  - scene_id (string)
  - video_id (FK to video_metadata)
  - segment_number, prompt, duration_seconds
  - gcs_path
```

## Technical Details

### Video Storage Flow

1. **Generate**: Video generated via OpenAI API
2. **Download**: Download from OpenAI (before expiration)
3. **Upload**: Upload to GCS using signed URL
4. **Thumbnail**: Extract first frame, upload to GCS
5. **Metadata**: Save all metadata to Postgres
6. **Display**: Load video from GCS using signed URL

### Thumbnail Generation

- **Method**: Canvas API + requestVideoFrameCallback
- **Interval**: Adaptive (1s, 2s, or 5s based on duration)
- **Size**: 120px width (maintains aspect ratio)
- **Format**: JPEG, 85% quality
- **Cleanup**: URLs revoked to prevent memory leaks

### Lazy Loading

- **Video Blobs**: Only loaded when viewing a scene
- **Progressive Loading**: Thumbnails → Metadata → Video
- **State Tracking**: `isLoading` flag per version
- **Memory Management**: Old video blobs released when switching

## Limitations & Known Issues

### Current Limitations

1. **No Video Concatenation**: Timeline shows individual scenes, not merged video
2. **No Scene Deletion**: Can't delete scenes (only create new ones)
3. **No Scene Reordering**: Scenes appear in chronological order only
4. **Session-Bound**: Scenes tied to browser session (no user accounts)

### Known Issues

1. **OpenAI Video Expiration**: Remix only works on unexpired videos (1-24 hours)
   - **Workaround**: Use Extend instead (works with expired videos)
2. **Large File Uploads**: Videos >50MB may timeout on slow connections
   - **Mitigation**: Progress indicator shown during upload
3. **Mobile Performance**: Thumbnail generation may be slow on mobile
   - **Recommendation**: Use desktop browsers

## Future Enhancements

### Planned Features

1. **Scene Management**
   - Delete scenes
   - Rename scenes
   - Organize into projects

2. **Multi-Scene Composition**
   - Concatenate multiple scenes into single video
   - Timeline spanning multiple scenes
   - Drag-and-drop scene reordering

3. **User Accounts**
   - Sign in with Google/GitHub
   - Share scenes with others
   - Public/private scenes

4. **Advanced Editing**
   - Trim scenes
   - Add transitions
   - Audio overlay

5. **Batch Operations**
   - Generate multiple variations
   - Bulk remix with different prompts
   - Export to various formats

## Troubleshooting

### "Failed to load scenes"

**Cause**: Database connection issue

**Solution**:
1. Check that `POSTGRES_URL` is set correctly
2. Verify database schema is initialized
3. Check Vercel logs for errors

### "Failed to upload video"

**Cause**: GCS upload error

**Solution**:
1. Check that `GCS_*` environment variables are set
2. Verify GCS bucket exists and is accessible
3. Check CORS configuration on bucket

### "Remix failed"

**Cause**: OpenAI API error or video expired

**Solution**:
1. Verify API key is valid
2. Check that original video is not expired (< 24 hours old)
3. Try using "Extend" instead of "Remix"

### "Thumbnail generation failed"

**Cause**: Video format not supported or memory issue

**Solution**:
1. Try refreshing the page
2. Check browser console for errors
3. Use smaller video durations (4s or 8s)

## Performance Tips

### For Best Performance

1. **Use Shorter Videos**: 4s or 8s videos load faster than 12s
2. **Close Old Tabs**: Prevents memory leaks from old video blobs
3. **Clear Browser Cache**: If experiencing slowness
4. **Use Desktop**: Mobile browsers have memory limitations

### Memory Management

- Video blobs automatically released when switching scenes
- Thumbnail URLs revoked after use
- Only one video loaded in memory at a time
- Browser may cache videos (helps with re-viewing)

## Development

### Local Development Setup

1. Install dependencies: `npm install`
2. Create `.env.local` with all environment variables
3. Initialize database: `node --env-file=.env.local scripts/init-neon-db.js`
4. Start dev server: `npm run dev`
5. Navigate to `http://localhost:5173/scene-builder`

### Testing

```bash
# Build
npm run build

# Type check
npm run build  # TypeScript errors will fail the build

# Lint
npm run lint
```

### Project Structure

```
sora-2-app/
├── api/                           # Vercel Edge Functions
├── src/
│   ├── pages/                     # Route pages
│   ├── components/scene-builder/ # SceneBuilder components
│   ├── stores/                    # Zustand stores
│   ├── services/                  # Business logic
│   ├── utils/                     # Utilities
│   └── styles/                    # CSS files
├── scripts/                       # Database migration scripts
├── PRPs/                          # Pragmatic Reference Plans
│   ├── ai_docs/                   # AI-generated documentation
│   └── working-memory/            # Active PRPs
└── DEPLOYMENT.md                  # Deployment guide
```

## Credits

- **OpenAI Sora 2**: Video generation API
- **Google Cloud Storage**: Video storage
- **Neon Postgres**: Database (FREE tier)
- **Vercel**: Hosting and Edge Functions
- **React + TypeScript**: Frontend framework
- **Zustand**: State management
- **Canvas API**: Thumbnail generation

## License

[Your License Here]

## Support

For issues or questions:
1. Check this documentation
2. Review DEPLOYMENT.md
3. Check PRPs/working-memory/scene-builder-v2/.plan
4. Open GitHub issue
