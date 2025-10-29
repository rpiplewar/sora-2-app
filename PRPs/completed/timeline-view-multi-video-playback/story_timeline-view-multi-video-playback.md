# Timeline View & Multi-Video Playback PRP

**Story**: Implement horizontal timeline view with continuous multi-scene playback and vertical version history stacks

**Type**: Feature Enhancement
**Complexity**: High
**Created**: 2025-10-30
**Confidence Score**: 7/10 for one-pass implementation

---

## 1. STORY GOAL

### User Requirements

1. **Horizontal Timeline**: All approved scenes displayed horizontally in sequence (left-to-right)
2. **Continuous Playback**: Videos play smoothly across scenes without interruption (Scene 1 → Scene 2 → Scene 3)
3. **Timeline Scrubbing**: User can click anywhere on timeline to jump to that point
4. **Vertical Version History**: Each scene card shows all remix versions stacked vertically
5. **Version Hover/Selection**: Older versions appear faded, brighten on hover, show thumbnail + prompt
6. **Active Version Indicator**: Currently playing/selected version highlighted
7. **Remix Workflow Integration**: Timeline persists when user remixes a scene in the middle

### Success Criteria

- ✅ All approved scenes visible in horizontal timeline
- ✅ Videos play continuously across scene boundaries
- ✅ Timeline scrubber shows total duration and current playhead position
- ✅ User can click scene card to jump to that scene
- ✅ Each scene card displays all versions vertically (oldest at top, newest at bottom)
- ✅ Hovering version shows thumbnail + prompt tooltip
- ✅ Remixing a scene updates that scene's version stack without losing timeline state
- ✅ Timeline player handles scene transitions smoothly
- ✅ Current playback position updates in real-time

---

## 2. CONTEXT

### Current Architecture

**Scene Builder Data Structure** (`src/stores/sceneBuilderStore.ts`):
```typescript
interface Scene {
  id: string;
  versions: SceneVersion[];      // All remix iterations
  currentVersionId: string;      // Active version
  isLocked: boolean;             // Approved = locked
  initialConfig: GenerationConfig;
}

interface SceneVersion {
  id: string;
  openaiVideoId: string;
  prompt: string;
  videoBlobId: string;           // Reference to blob store
  delta?: PromptDelta;
  createdAt: number;
  parentVersionId?: string;
  isApproved: boolean;
}

scenes: Scene[];                 // Array provides implicit ordering
currentSceneId: string | null;
```

**Video Storage** (`src/stores/blobStore.ts`):
- Separate blob storage for memory efficiency
- Videos stored as `Map<string, Blob>`
- Blobs NOT tracked in undo/redo history

**FFmpeg Integration** (`src/services/videoService.ts`):
- `concatenateVideos(blobs[])` - Stitches multiple videos
- Uses `-c copy` flag (no re-encoding, 100x faster)
- Already proven working for multi-segment generation on homepage

**Current Video Player** (`src/components/scene-builder/SceneCanvas.tsx`):
- Shows single scene's current version
- Basic HTML5 `<video>` element with controls
- No cross-scene playback capability

**Plyr Player** (`src/components/VideoPlayer.tsx`):
- Used on homepage for final video
- Enhanced controls (progress bar, volume, fullscreen)
- NOT used in Scene Builder yet

### Critical Insights

1. **Scene Order**: Scenes array provides implicit ordering (scenes[0] → scenes[1] → scenes[2])
2. **Approved Scenes**: Only `isLocked: true` scenes should appear in timeline
3. **Duration Tracking**: Need to track duration per scene to calculate total timeline length
4. **Frame Continuity**: Already implemented via `extractLastFrame()` between scenes
5. **Version Visualization**: Need to render `scene.versions[]` vertically with `currentVersionId` highlighted

### UI Layout Design

**Inspired by video editing interfaces (e.g., meeting recording editors)**

```
┌──────────────────────────────────────────────────────────────┐
│ Scene Builder Header                                         │
├────────────────────────────────┬─────────────────────────────┤
│                                │                             │
│  OLD VERSIONS (Stacked Above)  │                             │
│  ┌──────────────────────────┐  │                             │
│  │ v2 (faded, hover visible)│  │                             │
│  └──────────────────────────┘  │                             │
│  ┌──────────────────────────┐  │                             │
│  │ v1 (faded, hover visible)│  │    Prompt Editor            │
│  └──────────────────────────┘  │    (Right Half)             │
│  ─────────────────────────────  │                             │
│  CURRENT VIDEO (Bottom/Main)   │    - Edit prompt            │
│  ┌──────────────────────────┐  │    - Analyze changes        │
│  │                          │  │    - Remix scene            │
│  │   [Playing Scene 2 v3]   │  │    - Approve & Continue     │
│  │                          │  │                             │
│  │   [Video Controls]       │  │                             │
│  └──────────────────────────┘  │                             │
│  (Left Half)                   │                             │
│                                │                             │
├────────────────────────────────┴─────────────────────────────┤
│                                                              │
│  Timeline (Horizontal Scrollable - Like Video Editor)        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [Scene 1] [Scene 2*] [Scene 3] [+ New]              │   │
│  │     4s        8s        4s                           │   │
│  │ ────────|───────────────────────────────             │   │
│  │         ^ playhead (12s)                             │   │
│  │                                                      │   │
│  │ * = currently selected scene                         │   │
│  └──────────────────────────────────────────────────────┘   │
│  0:12 / 0:16 total                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Layout Principles**:
1. **Left Panel (Video Section)**:
   - Old versions stacked ABOVE current video
   - Newest version at BOTTOM (main/prominent)
   - Older versions faded, brighten on hover
   - Shows versions for selected timeline scene

2. **Right Panel (Prompt Editor)**:
   - Full height prompt editor
   - Action buttons (Analyze, Remix, Approve)
   - Shows prompt for selected scene's current version

3. **Bottom Panel (Timeline)**:
   - Horizontal scrollable timeline (like video editor)
   - Scene cards with duration labels
   - Playhead indicator synced with video playback
   - Click scene card to select/load it in left panel

### New Architecture Components

**Video Panel (Left)** (`src/components/scene-builder/VideoPanel.tsx`):
- Container for version history + current video player
- Top section: Old versions stacked (v1, v2 above)
- Bottom section: Current/main video player
- Shows versions for currently selected scene from timeline

**Version History Stack** (`src/components/scene-builder/VersionHistoryStack.tsx`):
- Renders old versions of selected scene ABOVE main video
- Versions stacked vertically: oldest at top, newer below
- Faded by default (opacity ~0.4), brighten on hover (opacity 1.0)
- Click version → load that version in main player
- Shows thumbnail + prompt on hover

**Video Player** (`src/components/scene-builder/VideoPlayer.tsx`):
- Main video player for selected scene's current version
- HTML5 video with controls (play, pause, seek, volume)
- Syncs with timeline playhead when playing concatenated timeline
- Can also play individual scene versions

**Timeline Track (Bottom)** (`src/components/scene-builder/TimelineTrack.tsx`):
- Horizontal scrollable timeline (like video editor scrubber)
- Simple scene cards: [Scene 1] [Scene 2] [Scene 3]
- Each card shows: scene number, duration (4s, 8s, etc.)
- Playhead indicator shows current playback position
- Click scene card → load that scene in left video panel

**Scene Timeline Card** (`src/components/scene-builder/SceneTimelineCard.tsx`):
- Simplified card for timeline (not a video player)
- Shows: scene number, duration label, active indicator
- Click → select scene and load versions in left panel
- Active state: highlighted border when selected

### Technical Challenges & Solutions

**Challenge 1: Continuous Playback Across Scenes**
- **Problem**: HTML5 `<video>` can only play single src at a time
- **Solution**: Use FFmpeg to concatenate approved scene videos into single blob
- **Trigger**: Regenerate concatenated video when any scene is approved or remixed

**Challenge 2: Timeline Scrubbing to Specific Scene**
- **Problem**: Need to map timestamp → scene index
- **Solution**: Build cumulative duration array: `[0, 4s, 12s, 24s]`
- **Implementation**: Binary search to find scene at timestamp

**Challenge 3: Real-time Playhead Position**
- **Problem**: Video `ontimeupdate` fires irregularly (every ~250ms)
- **Solution**: Use `requestAnimationFrame` for smooth 60fps updates
- **Fallback**: `ontimeupdate` event as backup

**Challenge 4: Version Thumbnail Generation**
- **Problem**: Need thumbnail for each version without loading full video
- **Solution**: Extract first frame using Canvas API (same pattern as `extractLastFrame`)
- **Optimization**: Generate thumbnails lazily on hover (avoid upfront cost)

**Challenge 5: Memory Management**
- **Problem**: Concatenated blob duplicates video data in memory
- **Solution**: Generate concatenated blob on-demand, cache, invalidate on change
- **Cleanup**: Revoke old blob URLs when regenerating

**Challenge 6: Scene Card Layout**
- **Problem**: Variable number of versions per scene (1-10+)
- **Solution**: Fixed card height, vertical scroll for overflow
- **Styling**: CSS `overflow-y: auto`, `max-height: 300px`

---

## 3. IMPLEMENTATION TASKS

### Phase 1: Data Model & State Enhancement (2-3 hours)

#### Task 1.1: Add Timeline State to Scene Builder Store
**File**: `src/stores/sceneBuilderStore.ts`

**Action**: ADD new state fields after line 26

```typescript
// Timeline state
timelineVideoBlob: Blob | null;        // Concatenated video of all approved scenes
timelineVideoBlobId: string | null;    // Reference to blob store
timelineDuration: number;              // Total duration in seconds
sceneDurations: number[];              // Duration per scene [4, 8, 4, 12]
cumulativeDurations: number[];         // Cumulative [0, 4, 12, 16, 28]
currentPlaybackTime: number;           // Current video position (0-28s)
isTimelineMode: boolean;               // True when timeline view active
isRegeneratingTimeline: boolean;       // True when concatenating videos
```

**Action**: ADD new actions after `extendToNextScene`

```typescript
// Timeline actions
generateTimeline: () => Promise<void>;
updatePlaybackTime: (time: number) => void;
seekToScene: (sceneId: string) => void;
toggleTimelineMode: () => void;
invalidateTimeline: () => void;  // Called after remix/approve
```

**Validation**:
```bash
npm run build
# Should compile without errors
```

---

#### Task 1.2: Implement Timeline Generation Logic
**File**: `src/stores/sceneBuilderStore.ts`

**Action**: IMPLEMENT `generateTimeline` action (add after line 405)

```typescript
generateTimeline: async () => {
  const { scenes } = get();
  const apiKey = storageService.getApiKey();

  if (!apiKey) {
    set({ error: 'API key not found' });
    return;
  }

  // Get all approved (locked) scenes
  const approvedScenes = scenes.filter(s => s.isLocked);

  if (approvedScenes.length === 0) {
    set({ error: 'No approved scenes to generate timeline' });
    return;
  }

  try {
    set({ isRegeneratingTimeline: true, error: null });

    // Collect video blobs for approved scenes (use current version)
    const videoBlobs: Blob[] = [];
    const durations: number[] = [];

    for (const scene of approvedScenes) {
      const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
      if (!currentVersion?.videoBlobId) {
        throw new Error(`Scene ${scene.id} missing video blob`);
      }

      const blob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
      if (!blob) {
        throw new Error(`Video blob not found: ${currentVersion.videoBlobId}`);
      }

      videoBlobs.push(blob);

      // Get video duration using temporary video element
      const duration = await getVideoDuration(blob);
      durations.push(duration);
    }

    // Calculate cumulative durations for scrubbing
    const cumulative = durations.reduce<number[]>((acc, dur, idx) => {
      const prev = idx === 0 ? 0 : acc[idx - 1];
      acc.push(prev + dur);
      return acc;
    }, []);
    cumulative.unshift(0); // Add 0 at start: [0, 4, 12, 16, 28]

    const totalDuration = cumulative[cumulative.length - 1];

    // Concatenate videos using FFmpeg
    const concatenatedBlob = await videoService.concatenateVideos(videoBlobs);
    const blobId = `timeline-${Date.now()}`;
    useBlobStore.getState().addBlob(blobId, concatenatedBlob);

    // Cleanup old timeline blob
    const oldBlobId = get().timelineVideoBlobId;
    if (oldBlobId) {
      useBlobStore.getState().removeBlob(oldBlobId);
    }

    set({
      timelineVideoBlobId: blobId,
      sceneDurations: durations,
      cumulativeDurations: cumulative,
      timelineDuration: totalDuration,
      isRegeneratingTimeline: false,
      isTimelineMode: true,
    });

  } catch (error: any) {
    set({
      error: `Timeline generation failed: ${error.message}`,
      isRegeneratingTimeline: false,
    });
  }
},
```

**Action**: ADD helper function before store definition (line ~12)

```typescript
// Helper: Get video duration from blob
async function getVideoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(blob);
  });
}
```

**Action**: UPDATE `approveVersion` to invalidate timeline (around line 242-293)

```typescript
approveVersion: async () => {
  // ... existing code ...

  // Invalidate timeline (needs regeneration)
  set((state) => ({
    scenes: /* existing scenes update */,
    editedPrompt: '',
    deltaAnalysis: null,
    timelineVideoBlobId: null,  // ADD THIS
    isTimelineMode: false,      // ADD THIS
  }));

  // ... rest of existing code ...
}
```

**Action**: UPDATE `remixScene` to invalidate timeline (around line 152-239)

```typescript
remixScene: async () => {
  // ... existing code ...

  // Update scene
  set((state) => ({
    scenes: /* existing scenes update */,
    deltaAnalysis: null,
    isRemixing: false,
    remixProgress: 0,
    timelineVideoBlobId: null,  // ADD THIS
    isTimelineMode: false,      // ADD THIS
  }));

  // ... rest of existing code ...
}
```

**Validation**:
```bash
npm run build
# Should compile without errors
grep -n "generateTimeline" src/stores/sceneBuilderStore.ts
# Should show function definition
```

---

#### Task 1.3: Implement Playback Sync Actions
**File**: `src/stores/sceneBuilderStore.ts`

**Action**: IMPLEMENT remaining timeline actions (add after `generateTimeline`)

```typescript
// Update current playback time (called from video player)
updatePlaybackTime: (time: number) => {
  set({ currentPlaybackTime: time });
},

// Seek to specific scene (jump to scene start)
seekToScene: (sceneId: string) => {
  const { scenes, cumulativeDurations } = get();
  const sceneIndex = scenes.findIndex(s => s.id === sceneId && s.isLocked);

  if (sceneIndex === -1) {
    console.warn(`Scene ${sceneId} not found or not approved`);
    return;
  }

  const startTime = cumulativeDurations[sceneIndex];
  set({ currentPlaybackTime: startTime, currentSceneId: sceneId });
},

// Toggle between timeline and single-scene mode
toggleTimelineMode: () => {
  set((state) => ({ isTimelineMode: !state.isTimelineMode }));
},

// Force timeline regeneration
invalidateTimeline: () => {
  const oldBlobId = get().timelineVideoBlobId;
  if (oldBlobId) {
    useBlobStore.getState().removeBlob(oldBlobId);
  }
  set({
    timelineVideoBlobId: null,
    isTimelineMode: false,
    currentPlaybackTime: 0,
  });
},
```

**Validation**:
```bash
npm run build
grep "seekToScene\|updatePlaybackTime\|toggleTimelineMode" src/stores/sceneBuilderStore.ts
# Should show 3 function definitions
```

---

### Phase 2: Timeline Player Component (3-4 hours)

#### Task 2.1: Create Timeline Player Component
**File**: `src/components/scene-builder/TimelinePlayer.tsx`

**Action**: CREATE new file with full implementation

```typescript
import { useEffect, useRef, useState } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { useBlobStore } from '../../stores/blobStore';

export function TimelinePlayer() {
  const {
    timelineVideoBlobId,
    cumulativeDurations,
    scenes,
    currentPlaybackTime,
    updatePlaybackTime,
    seekToScene,
    isRegeneratingTimeline,
  } = useSceneBuilderStore();

  const getBlob = useBlobStore(state => state.getBlob);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>();
  const [isPlaying, setIsPlaying] = useState(false);

  // Load timeline video blob
  useEffect(() => {
    if (timelineVideoBlobId) {
      const blob = getBlob(timelineVideoBlobId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
    setVideoUrl(undefined);
  }, [timelineVideoBlobId, getBlob]);

  // Sync playback time with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      updatePlaybackTime(video.currentTime);
      detectSceneChange(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [updatePlaybackTime, cumulativeDurations, scenes]);

  // Detect scene changes during playback
  const detectSceneChange = (currentTime: number) => {
    if (cumulativeDurations.length === 0) return;

    const approvedScenes = scenes.filter(s => s.isLocked);

    // Binary search for current scene
    let sceneIndex = 0;
    for (let i = 0; i < cumulativeDurations.length - 1; i++) {
      if (currentTime >= cumulativeDurations[i] && currentTime < cumulativeDurations[i + 1]) {
        sceneIndex = i;
        break;
      }
    }

    const currentScene = approvedScenes[sceneIndex];
    if (currentScene) {
      // Update current scene without seeking (avoid loop)
      useSceneBuilderStore.setState({ currentSceneId: currentScene.id });
    }
  };

  // Handle external seek requests
  useEffect(() => {
    const video = videoRef.current;
    if (video && Math.abs(video.currentTime - currentPlaybackTime) > 0.5) {
      video.currentTime = currentPlaybackTime;
    }
  }, [currentPlaybackTime]);

  if (isRegeneratingTimeline) {
    return (
      <div className="timeline-player loading">
        <div className="loading-spinner">
          <p>Generating timeline...</p>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="timeline-player empty">
        <p>No timeline generated. Approve scenes to create timeline.</p>
      </div>
    );
  }

  return (
    <div className="timeline-player">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="timeline-video"
        onError={(e) => {
          console.error('Timeline video playback error:', e);
        }}
      />
    </div>
  );
}
```

**Validation**:
```bash
npm run build
# Should compile without errors
```

---

#### Task 2.2: Create Timeline Track Component
**File**: `src/components/scene-builder/TimelineTrack.tsx`

**Action**: CREATE new file with horizontal scrollable track

```typescript
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { SceneCard } from './SceneCard';

export function TimelineTrack() {
  const {
    scenes,
    cumulativeDurations,
    sceneDurations,
    currentPlaybackTime,
    timelineDuration,
    currentSceneId,
    seekToScene,
  } = useSceneBuilderStore();

  const approvedScenes = scenes.filter(s => s.isLocked);

  if (approvedScenes.length === 0) {
    return (
      <div className="timeline-track empty">
        <p>No approved scenes yet. Approve a scene to start building your timeline.</p>
      </div>
    );
  }

  // Calculate playhead position (0-100%)
  const playheadPercent = timelineDuration > 0
    ? (currentPlaybackTime / timelineDuration) * 100
    : 0;

  return (
    <div className="timeline-track">
      <div className="timeline-header">
        <h3>Timeline</h3>
        <span className="timeline-duration">
          {formatTime(currentPlaybackTime)} / {formatTime(timelineDuration)}
        </span>
      </div>

      <div className="timeline-scenes-container">
        <div className="playhead" style={{ left: `${playheadPercent}%` }} />

        <div className="timeline-scenes">
          {approvedScenes.map((scene, index) => {
            const duration = sceneDurations[index] || 0;
            const startTime = cumulativeDurations[index] || 0;
            const isActive = scene.id === currentSceneId;

            return (
              <SceneCard
                key={scene.id}
                scene={scene}
                duration={duration}
                startTime={startTime}
                isActive={isActive}
                onSelect={() => seekToScene(scene.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper: Format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

**Validation**:
```bash
npm run build
# Should compile without errors
```

---

#### Task 2.3: Create Scene Card Component with Version Stack
**File**: `src/components/scene-builder/SceneCard.tsx`

**Action**: CREATE new file with vertical version visualization

```typescript
import { useState } from 'react';
import type { Scene } from '../../types';
import { VersionStack } from './VersionStack';

interface SceneCardProps {
  scene: Scene;
  duration: number;
  startTime: number;
  isActive: boolean;
  onSelect: () => void;
}

export function SceneCard({ scene, duration, startTime, isActive, onSelect }: SceneCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate width based on duration (min 120px, max 300px)
  const widthPx = Math.max(120, Math.min(300, duration * 30));

  return (
    <div
      className={`scene-card ${isActive ? 'active' : ''}`}
      style={{ width: `${widthPx}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <div className="scene-card-header">
        <span className="scene-number">Scene {scene.id.split('-')[1]}</span>
        <span className="scene-duration">{duration}s</span>
      </div>

      <VersionStack
        scene={scene}
        isHovered={isHovered}
        isActive={isActive}
      />

      <div className="scene-card-footer">
        <span className="scene-start-time">{formatTime(startTime)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

**Validation**:
```bash
npm run build
# Should compile without errors
```

---

#### Task 2.4: Create Version Stack Component
**File**: `src/components/scene-builder/VersionStack.tsx`

**Action**: CREATE new file with vertical version rendering

```typescript
import { useState, useEffect } from 'react';
import type { Scene, SceneVersion } from '../../types';
import { useBlobStore } from '../../stores/blobStore';
import { extractFirstFrame } from '../../utils/videoFrameExtractor';

interface VersionStackProps {
  scene: Scene;
  isHovered: boolean;
  isActive: boolean;
}

export function VersionStack({ scene, isHovered, isActive }: VersionStackProps) {
  const getBlob = useBlobStore(state => state.getBlob);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());

  // Reverse versions: oldest at top, newest at bottom
  const reversedVersions = [...scene.versions].reverse();

  // Generate thumbnails for current version (lazy load others on hover)
  useEffect(() => {
    const loadThumbnails = async () => {
      const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
      if (!currentVersion) return;

      const blob = getBlob(currentVersion.videoBlobId!);
      if (!blob) return;

      try {
        const frameBlob = await extractFirstFrame(blob);
        const url = URL.createObjectURL(frameBlob);

        setThumbnails(prev => {
          const next = new Map(prev);
          next.set(currentVersion.id, url);
          return next;
        });
      } catch (error) {
        console.error('Failed to extract thumbnail:', error);
      }
    };

    loadThumbnails();
  }, [scene.currentVersionId, getBlob, scene.versions]);

  // Load all thumbnails on hover
  useEffect(() => {
    if (!isHovered) return;

    const loadAllThumbnails = async () => {
      for (const version of scene.versions) {
        if (thumbnails.has(version.id)) continue;

        const blob = getBlob(version.videoBlobId!);
        if (!blob) continue;

        try {
          const frameBlob = await extractFirstFrame(blob);
          const url = URL.createObjectURL(frameBlob);

          setThumbnails(prev => {
            const next = new Map(prev);
            next.set(version.id, url);
            return next;
          });
        } catch (error) {
          console.error(`Failed to load thumbnail for ${version.id}:`, error);
        }
      }
    };

    loadAllThumbnails();
  }, [isHovered, scene.versions, getBlob, thumbnails]);

  return (
    <div className="version-stack">
      {reversedVersions.map((version, index) => {
        const isCurrent = version.id === scene.currentVersionId;
        const thumbnailUrl = thumbnails.get(version.id);

        // Opacity: current = 1.0, others fade based on age
        const opacity = isCurrent ? 1.0 : isHovered ? 0.6 : 0.3;

        return (
          <div
            key={version.id}
            className={`version-item ${isCurrent ? 'current' : ''}`}
            style={{ opacity }}
            title={version.prompt}
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={`Version ${version.id}`} />
            ) : (
              <div className="version-placeholder">{version.id}</div>
            )}

            {isCurrent && <div className="current-badge">Current</div>}
          </div>
        );
      })}
    </div>
  );
}
```

**Action**: CREATE helper function for first frame extraction
**File**: `src/utils/videoFrameExtractor.ts`

**Action**: ADD function after `extractLastFrame`

```typescript
/**
 * Extract first frame from video as JPEG blob (for thumbnails)
 * Similar to extractLastFrame but seeks to 0.1s
 */
export async function extractFirstFrame(videoBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';

    video.onloadedmetadata = async () => {
      // Seek to 0.1s (avoid black frames at t=0)
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        // Create canvas matching video dimensions
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(video.src);
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to JPEG blob
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          },
          'image/jpeg',
          0.95
        );
      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    video.src = URL.createObjectURL(videoBlob);
  });
}
```

**Validation**:
```bash
npm run build
grep -n "extractFirstFrame" src/utils/videoFrameExtractor.ts
# Should show function definition
```

---

### Phase 3: Timeline View Layout & Integration (2-3 hours)

#### Task 3.1: Update Scene Builder Page Layout
**File**: `src/pages/SceneBuilder.tsx`

**Action**: UPDATE render to include timeline view (replace lines 47-72)

```typescript
return (
  <div className="scene-builder">
    <header>
      <h1>Scene Builder</h1>
      <ApiKeyInput />
      <VersionControls />

      {/* ADD: Timeline toggle */}
      {currentSceneId && (
        <button
          onClick={() => useSceneBuilderStore.getState().toggleTimelineMode()}
          className="timeline-toggle-button"
        >
          {useSceneBuilderStore.getState().isTimelineMode ? 'Edit Mode' : 'Timeline View'}
        </button>
      )}
    </header>

    {error && <ErrorDisplay error={error} />}

    {!currentSceneId ? (
      <InitialSceneForm />
    ) : useSceneBuilderStore.getState().isTimelineMode ? (
      /* NEW: Timeline View - Video editor layout */
      <div className="timeline-view">
        {/* Top section: Video (left) + Prompt (right) */}
        <div className="timeline-content-section">
          <div className="video-panel-container">
            <VideoPanel />
          </div>
          <div className="prompt-panel-container">
            <PromptEditor />
          </div>
        </div>

        {/* Bottom section: Timeline track */}
        <div className="timeline-track-section">
          <TimelineTrack />
        </div>
      </div>
    ) : (
      /* EXISTING: Split View for Editing */
      <div className="split-view">
        <div className="left-panel">
          <SceneCanvas />
        </div>
        <div className="right-panel">
          <PromptEditor />
          <DeltaDisplay />
        </div>
      </div>
    )}
  </div>
);
```

**Action**: ADD imports at top of file

```typescript
import { VideoPanel } from '../components/scene-builder/VideoPanel';
import { TimelineTrack } from '../components/scene-builder/TimelineTrack';
```

**Validation**:
```bash
npm run build
grep "TimelinePlayer\|TimelineTrack" src/pages/SceneBuilder.tsx
# Should show imports and JSX usage
```

---

#### Task 3.2: Add Timeline Generation Button
**File**: `src/components/scene-builder/PromptEditor.tsx`

**Action**: ADD "Generate Timeline" button after approve button (around line 106-113)

```typescript
<button
  onClick={handleApprove}
  disabled={isRemixing}
  className="approve-button success"
>
  {isRemixing ? 'Approving...' : 'Approve & Continue →'}
</button>

{/* ADD THIS */}
<button
  onClick={async () => {
    await handleApprove();
    // Generate timeline after approval
    setTimeout(async () => {
      await useSceneBuilderStore.getState().generateTimeline();
    }, 100);
  }}
  disabled={isRemixing}
  className="approve-timeline-button success"
  title="Approve scene and generate timeline view"
>
  {isRemixing ? 'Approving...' : 'Approve & View Timeline'}
</button>
```

**Validation**:
```bash
npm run build
grep "Approve & View Timeline" src/components/scene-builder/PromptEditor.tsx
# Should show button text
```

---

### Phase 4: Timeline Styles & Polish (1-2 hours)

#### Task 4.1: Add Timeline Styles
**File**: `src/styles/scene-builder.css`

**Action**: ADD new styles at end of file (after line 407)

```css
/* ============================================================================
   Timeline View Styles - Video Editor Layout
   ============================================================================ */

/* Timeline View Container */
.timeline-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  overflow: hidden;
}

/* Top Section: Video (left) + Prompt (right) */
.timeline-content-section {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  overflow: hidden;
  border-bottom: 2px solid #333;
}

.video-panel-container {
  display: flex;
  flex-direction: column;
  background: #000;
  overflow-y: auto;
  border-right: 1px solid #333;
}

.prompt-panel-container {
  background: #fff;
  overflow-y: auto;
  padding: 2rem;
}

/* Bottom Section: Timeline Track */
.timeline-track-section {
  flex: 0 0 180px;
  overflow-x: auto;
  overflow-y: hidden;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
  padding: 1rem;
}

/* Video Panel (Left) */
.video-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

/* Version History Stack (Above main video) */
.version-history-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 35vh;
  overflow-y: auto;
  padding: 0.5rem;
}

.version-history-item {
  position: relative;
  width: 100%;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0.4;
  transition: all 0.3s ease;
  cursor: pointer;
  border: 2px solid transparent;
}

.version-history-item:hover {
  opacity: 1;
  border-color: #4CAF50;
  transform: scale(1.02);
}

.version-history-item.selected {
  opacity: 1;
  border-color: #FF5722;
}

.version-history-item video {
  width: 100%;
  display: block;
  pointer-events: none;
}

.version-history-item img {
  width: 100%;
  display: block;
}

.version-info-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.9));
  padding: 0.75rem;
  color: white;
  font-size: 0.85rem;
  opacity: 0;
  transition: opacity 0.3s;
}

.version-history-item:hover .version-info-overlay {
  opacity: 1;
}

.version-label {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.version-prompt {
  font-size: 0.75rem;
  color: #ccc;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Main Video Player (Bottom of left panel) */
.main-video-player {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  min-height: 300px;
}

.main-video-player video {
  width: 100%;
  height: auto;
  max-height: 100%;
}

.main-video-player.loading {
  color: #999;
  font-size: 1.1rem;
}

.main-video-player.empty {
  color: #666;
  font-size: 1rem;
}

/* Timeline Track */
.timeline-track {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.timeline-track.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #999;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
}

.timeline-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.timeline-duration {
  font-family: 'Courier New', monospace;
  font-size: 1rem;
  color: #666;
  font-weight: 600;
}

/* Timeline Scenes Container */
.timeline-scenes-container {
  position: relative;
  height: 100px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ddd;
  overflow-x: auto;
  overflow-y: hidden;
}

.timeline-scenes {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  height: 100%;
  min-width: min-content;
  align-items: center;
}

/* Playhead Indicator */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #FF5722;
  box-shadow: 0 0 8px rgba(255, 87, 34, 0.6);
  z-index: 10;
  pointer-events: none;
  transition: left 0.1s linear;
}

.playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: -4px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 8px solid #FF5722;
}

/* Scene Timeline Card (Simplified - no embedded versions) */
.scene-timeline-card {
  flex-shrink: 0;
  min-width: 120px;
  height: 70px;
  background: #f5f5f5;
  border: 2px solid #ddd;
  border-radius: 6px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.scene-timeline-card:hover {
  border-color: #4CAF50;
  background: #fff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
}

.scene-timeline-card.active {
  border-color: #FF5722;
  background: #FFF3E0;
  box-shadow: 0 2px 8px rgba(255, 87, 34, 0.3);
}

.scene-timeline-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
}

.scene-timeline-number {
  color: #4CAF50;
}

.scene-timeline-duration {
  color: #666;
  font-family: 'Courier New', monospace;
  font-size: 0.7rem;
}

.scene-timeline-card-footer {
  text-align: left;
  font-size: 0.65rem;
  color: #999;
  font-family: 'Courier New', monospace;
}

.scene-timeline-versions-count {
  color: #999;
  font-size: 0.65rem;
  font-style: italic;
}

/* Timeline Toggle Button */
.timeline-toggle-button {
  padding: 0.5rem 1rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.timeline-toggle-button:hover {
  background: #45a049;
}

/* Approve & View Timeline Button */
.approve-timeline-button.success {
  background: #FF9800;
  color: white;
}

.approve-timeline-button.success:hover:not(:disabled) {
  background: #FB8C00;
}

/* Loading Spinner */
.loading-spinner {
  text-align: center;
  color: #999;
}

.loading-spinner p {
  margin-top: 1rem;
  font-size: 1.1rem;
}

/* Responsive Timeline */
@media (max-width: 968px) {
  .timeline-player-section {
    min-height: 300px;
  }

  .timeline-track-section {
    flex: 0 0 280px;
  }

  .scene-card {
    min-width: 100px !important;
  }

  .timeline-scenes-container {
    height: 220px;
  }
}
```

**Validation**:
```bash
npm run build
grep -n "timeline-view" src/styles/scene-builder.css
# Should show CSS class definition
```

---

### Phase 5: Testing & Edge Cases (1-2 hours)

#### Task 5.1: Add Error Handling for Timeline Generation
**File**: `src/stores/sceneBuilderStore.ts`

**Action**: UPDATE `generateTimeline` to handle edge cases (around existing implementation)

```typescript
generateTimeline: async () => {
  const { scenes } = get();

  // Edge case: No scenes
  if (scenes.length === 0) {
    set({ error: 'No scenes to generate timeline' });
    return;
  }

  // Edge case: No approved scenes
  const approvedScenes = scenes.filter(s => s.isLocked);
  if (approvedScenes.length === 0) {
    set({ error: 'Please approve at least one scene before generating timeline' });
    return;
  }

  // Edge case: Only one scene
  if (approvedScenes.length === 1) {
    // Single scene timeline - no concatenation needed
    const scene = approvedScenes[0];
    const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);

    if (!currentVersion?.videoBlobId) {
      set({ error: 'Scene missing video data' });
      return;
    }

    const blob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
    if (!blob) {
      set({ error: 'Video blob not found' });
      return;
    }

    const duration = await getVideoDuration(blob);

    set({
      timelineVideoBlobId: currentVersion.videoBlobId,
      sceneDurations: [duration],
      cumulativeDurations: [0, duration],
      timelineDuration: duration,
      isRegeneratingTimeline: false,
      isTimelineMode: true,
    });

    return;
  }

  // ... rest of existing multi-scene logic ...
},
```

**Validation**:
```bash
npm run build
# Should compile without errors
```

---

#### Task 5.2: Add Memory Cleanup on Unmount
**File**: `src/components/scene-builder/TimelinePlayer.tsx`

**Action**: ADD cleanup effect at end of component

```typescript
// Cleanup on unmount
useEffect(() => {
  return () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
  };
}, []);
```

**Action**: ADD cleanup to VersionStack
**File**: `src/components/scene-builder/VersionStack.tsx`

```typescript
// Cleanup thumbnails on unmount
useEffect(() => {
  return () => {
    thumbnails.forEach(url => URL.revokeObjectURL(url));
  };
}, []);
```

**Validation**:
```bash
npm run build
grep "revokeObjectURL" src/components/scene-builder/TimelinePlayer.tsx src/components/scene-builder/VersionStack.tsx
# Should show cleanup code
```

---

#### Task 5.3: Manual Testing Checklist
**Action**: TEST timeline functionality

**Test Cases**:
1. ✅ Generate first scene → approve → verify no timeline yet (need 1+ approved)
2. ✅ Generate second scene → approve → click "Approve & View Timeline"
3. ✅ Verify timeline shows 2 scene cards side-by-side
4. ✅ Click play → verify video plays continuously across scenes
5. ✅ Verify playhead moves smoothly along timeline
6. ✅ Click middle of scene card → verify video seeks to that scene
7. ✅ Hover over scene card → verify versions become visible
8. ✅ Generate 3rd scene → approve → verify timeline updates
9. ✅ Remix scene 2 → verify scene 2 card shows new version at bottom
10. ✅ Verify old versions of scene 2 visible on hover (faded above)
11. ✅ Toggle "Edit Mode" → verify returns to split-view editing
12. ✅ Toggle "Timeline View" → verify returns to timeline playback

**Validation**:
```bash
npm run dev:vercel
# Open http://localhost:3000/scene-builder
# Follow test cases above
```

---

## 4. EXTERNAL CONTEXT

### FFmpeg.wasm Documentation
- **Concatenation**: `ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4`
- **No Re-encoding**: `-c copy` flag copies streams (100x faster than re-encoding)
- **Virtual FS**: All files written to in-memory filesystem

### Canvas API Frame Extraction
- **Seek Time**: Use `video.currentTime = 0.1` (avoid black frames at t=0)
- **Quality**: `canvas.toBlob(blob, 'image/jpeg', 0.95)` for thumbnails
- **Dimensions**: Match video dimensions: `canvas.width = video.videoWidth`

### Video Element Time Sync
- **Events**: `timeupdate` fires every ~250ms (not frame-accurate)
- **Seeking**: Set `video.currentTime` to jump to timestamp
- **Precision**: Check `Math.abs(video.currentTime - target) < 0.5` to avoid seek loops

### Binary Search for Scene Index
```javascript
function findSceneAtTime(time, cumulativeDurations) {
  for (let i = 0; i < cumulativeDurations.length - 1; i++) {
    if (time >= cumulativeDurations[i] && time < cumulativeDurations[i + 1]) {
      return i;
    }
  }
  return cumulativeDurations.length - 2; // Last scene
}
```

---

## 5. TESTING STRATEGY

### Unit Tests (Optional - No Test Suite Currently)
- `getVideoDuration()` helper
- Scene index binary search
- Time formatting utility

### Integration Testing
- Timeline generation with 1, 2, 5, 10 scenes
- Playback continuity across scene boundaries
- Scrubbing to specific timestamps
- Version stack rendering

### Manual Testing Focus Areas
1. **Performance**: Timeline generation time with 5+ scenes
2. **Memory**: Check browser memory usage (should not leak)
3. **Playback**: Smooth transitions, no buffering
4. **UI Responsiveness**: Scrubbing feels instant
5. **Version Hover**: Thumbnails load quickly

---

## 6. SUCCESS METRICS

### Functional Requirements
- ✅ All approved scenes visible in horizontal timeline
- ✅ Continuous playback across scenes
- ✅ Timeline scrubber with playhead indicator
- ✅ Scene cards display version history vertically
- ✅ Version hover shows thumbnail + prompt
- ✅ Remix updates version stack without breaking timeline

### Performance Requirements
- ✅ Timeline generation: < 5s for 5 scenes
- ✅ Thumbnail generation: < 500ms per video
- ✅ Playback latency: < 100ms seek time
- ✅ Memory usage: < 500MB for 10 scenes (4s each)

### UX Requirements
- ✅ Timeline toggle is discoverable
- ✅ Playhead position always visible
- ✅ Active scene clearly indicated
- ✅ Version stack intuitive (newest at bottom)
- ✅ No layout shift during playback

---

## 7. IMPLEMENTATION NOTES

### Key Design Decisions

**1. Timeline Generation Trigger**
- **Decision**: Manual trigger via "Approve & View Timeline" button
- **Rationale**: Concatenation takes time; user should opt-in
- **Alternative Considered**: Auto-generate on every approval (rejected due to performance)

**2. Version Stack Layout**
- **Decision**: Newest version at bottom (matches temporal flow)
- **Rationale**: Bottom = "latest" is intuitive for timelines
- **Alternative Considered**: Top = latest (rejected as counter-intuitive for timeline UX)

**3. Single Timeline Blob vs Dynamic Stitching**
- **Decision**: Pre-concatenate all scenes into single blob
- **Rationale**: Simpler playback, proven FFmpeg pattern
- **Alternative Considered**: Dynamic scene switching (rejected due to playback gaps)

**4. Thumbnail Generation Strategy**
- **Decision**: Lazy load on hover (except current version)
- **Rationale**: Reduces upfront cost, most users don't hover all versions
- **Alternative Considered**: Pre-generate all thumbnails (rejected due to memory)

### Potential Future Enhancements
- Drag-and-drop scene reordering
- Inline version comparison (split-screen)
- Timeline zoom controls
- Scene duration editing
- Export timeline as JSON
- Keyboard shortcuts (space = play/pause, arrows = seek)

---

## 8. RISK MITIGATION

### High-Risk Areas

**1. Memory Leaks from Object URLs**
- **Risk**: Failing to revoke blob URLs causes memory growth
- **Mitigation**: Strict cleanup in useEffect cleanup functions
- **Validation**: Monitor browser DevTools memory profiler

**2. FFmpeg Concatenation Failures**
- **Risk**: Incompatible video codecs between scenes
- **Mitigation**: All videos from same API (OpenAI Sora 2) use consistent codec
- **Fallback**: Catch error, show user-friendly message

**3. Timeline Scrubbing Accuracy**
- **Risk**: Cumulative duration calculation errors
- **Mitigation**: Use video metadata duration (not estimation)
- **Validation**: Manual testing with 5+ scenes

**4. Playback Performance Degradation**
- **Risk**: Large concatenated blob (10+ scenes) causes lag
- **Mitigation**: Set soft limit of 10 scenes, show warning at 8 scenes
- **Future**: Implement pagination or chunked timeline

---

## 9. VALIDATION COMMANDS

### Build Validation
```bash
npm run build
# Must succeed with no TypeScript errors
```

### Type Checking
```bash
npx tsc --noEmit
# Must show 0 errors
```

### Component Verification
```bash
grep -r "TimelinePlayer\|TimelineTrack\|SceneCard\|VersionStack" src/components/scene-builder/
# Should show all 4 components
```

### State Validation
```bash
grep -n "generateTimeline\|seekToScene\|updatePlaybackTime" src/stores/sceneBuilderStore.ts
# Should show all timeline actions
```

### Style Validation
```bash
grep -n "timeline-view\|timeline-player\|scene-card" src/styles/scene-builder.css
# Should show timeline CSS classes
```

---

## 10. COMPLETION CRITERIA

### Implementation Complete When:
- [ ] All 14 tasks implemented (Phases 1-5)
- [ ] Build succeeds with `npm run build`
- [ ] TypeScript types validate with `npx tsc --noEmit`
- [ ] All 12 manual test cases pass
- [ ] Timeline generation works with 1, 2, 5+ scenes
- [ ] Continuous playback verified across scenes
- [ ] Version stack displays correctly (vertical layout)
- [ ] Hover interactions work (brightness, tooltip)
- [ ] Memory cleanup verified (no leaks in DevTools)
- [ ] UI responsive on desktop browsers

### Ready for User Acceptance When:
- [ ] User can generate 3 scenes and approve all
- [ ] Timeline view shows all 3 scenes horizontally
- [ ] Video plays continuously from scene 1 → 2 → 3
- [ ] User can scrub to scene 2 by clicking scene card
- [ ] User can remix scene 2 and see new version in stack
- [ ] User can hover older versions to see thumbnail + prompt

---

**END OF PRP**
