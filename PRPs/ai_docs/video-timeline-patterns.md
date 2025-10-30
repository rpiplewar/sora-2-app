# Video Timeline UI/UX Patterns for SceneBuilder

## Recommended Stack

### Thumbnail Extraction: Canvas API + requestVideoFrameCallback

**Why This Combination**:
- Canvas API is universally supported and reliable
- `requestVideoFrameCallback` provides frame-accurate timing (Baseline 2024)
- Simpler than WebCodecs, better than FFmpeg.wasm for thumbnails
- Good balance of performance and compatibility

**Implementation**:

```typescript
// src/utils/videoThumbnailGenerator.ts
export class SegmentThumbnailGenerator {
  async generateThumbnails(
    videoBlob: Blob,
    segmentDuration: number,
    interval: number = 1 // Generate every 1 second
  ): Promise<ThumbnailData[]> {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    await new Promise(resolve => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    });

    const thumbnails: ThumbnailData[] = [];
    const count = Math.floor(segmentDuration / interval);

    for (let i = 0; i < count; i++) {
      const timestamp = i * interval;
      video.currentTime = timestamp;

      await new Promise(resolve => {
        video.addEventListener('seeked', resolve, { once: true });
      });

      // Use requestVideoFrameCallback for frame-accurate capture
      const blob = await new Promise<Blob>((resolve) => {
        video.requestVideoFrameCallback(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 120;
          canvas.height = Math.floor(120 / (video.videoWidth / video.videoHeight));

          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
        });
      });

      thumbnails.push({
        timestamp,
        blob,
        url: URL.createObjectURL(blob)
      });
    }

    URL.revokeObjectURL(video.src);
    return thumbnails;
  }
}
```

**Browser Support**:
- Chrome 83+
- Edge 83+
- Firefox 132+
- Safari 15.4+

### Timeline Component: @xzdarcy/react-timeline-editor

**NPM**: https://www.npmjs.com/package/@xzdarcy/react-timeline-editor
**GitHub**: https://github.com/xzdarcy/react-timeline-editor
**Stars**: 560+ | **TypeScript**: 95.5%

**Why This Library**:
- Most mature React timeline library
- TypeScript support
- Active maintenance
- Customizable rendering
- Drag-and-drop built-in

**Installation**:
```bash
npm install @xzdarcy/react-timeline-editor
```

**Basic Usage**:
```typescript
import { Timeline, TimelineRow, TimelineEffect } from '@xzdarcy/react-timeline-editor';

const SceneTimeline = () => {
  const [timelineData, setTimelineData] = useState<TimelineRow[]>([
    {
      id: "scene-1",
      actions: [
        {
          id: "action-1",
          start: 0,
          end: 12,  // 12 seconds
          effectId: "video-segment"
        }
      ]
    }
  ]);

  const effects: Record<string, TimelineEffect> = {
    "video-segment": {
      id: "video-segment",
      name: "Video Segment"
    }
  };

  return (
    <Timeline
      editorData={timelineData}
      effects={effects}
      onChange={setTimelineData}
    />
  );
};
```

## Timeline Architecture

### Multi-Segment Sync Pattern

```typescript
const MultiSegmentTimeline = () => {
  const segments = useSceneBuilderStore(state => state.scenes);
  const [globalTime, setGlobalTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  // Calculate cumulative durations for scrubbing
  const cumulativeDurations = useMemo(() => {
    let accumulated = 0;
    return segments.map(segment => {
      const start = accumulated;
      accumulated += segment.duration;
      return { start, end: accumulated };
    });
  }, [segments]);

  // Find active segment based on global time
  const getActiveSegment = (time: number) => {
    for (let i = 0; i < cumulativeDurations.length; i++) {
      const { start, end } = cumulativeDurations[i];
      if (time >= start && time < end) {
        return { index: i, localTime: time - start };
      }
    }
    return { index: segments.length - 1, localTime: 0 };
  };

  const handleTimelineClick = (clickX: number, timelineWidth: number) => {
    const totalDuration = cumulativeDurations[cumulativeDurations.length - 1].end;
    const newTime = (clickX / timelineWidth) * totalDuration;
    setGlobalTime(newTime);

    const { index, localTime } = getActiveSegment(newTime);
    setActiveSegmentIndex(index);
    // Update video player to segment[index] at localTime
  };

  return (
    <div className="multi-segment-timeline">
      {segments.map((segment, index) => {
        const duration = cumulativeDurations[index];
        const width = ((duration.end - duration.start) / totalDuration) * 100;

        return (
          <div
            key={segment.id}
            className={`segment ${index === activeSegmentIndex ? 'active' : ''}`}
            style={{ width: `${width}%` }}
          >
            {/* Segment thumbnails */}
          </div>
        );
      })}
    </div>
  );
};
```

## Thumbnail Density Strategy

```typescript
const calculateThumbnailInterval = (duration: number): number => {
  if (duration <= 30) return 1;      // 1 second for short videos
  if (duration <= 120) return 2;     // 2 seconds for medium videos
  return 5;                           // 5 seconds for long videos
};

// Memory budget: Target <10MB for all thumbnails
const estimateThumbnailMemory = (count: number): number => {
  const width = 120;
  const height = 68;
  const bytesPerPixel = 1.5; // JPEG at 85% quality
  const bytesPerThumbnail = width * height * bytesPerPixel;
  const totalMB = (bytesPerThumbnail * count) / 1024 / 1024;
  return totalMB;
};
```

## UI/UX Patterns (Inspired by Kapwing + YouTube Studio)

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Video Player (Current Scene)                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │         [Active Video Display]                   │  │
│  │                                                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Remix History Stack (Vertical)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Original │→│ Remix v1 │→│ Remix v2 │               │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  Timeline (Horizontal Filmstrip)                         │
│  ┌────┬────┬────┐ ┌────┬────┬────┐ ┌────┬────┬────┐  │
│  │ T1 │ T2 │ T3 │ │ T4 │ T5 │ T6 │ │ T7 │ T8 │ T9 │  │
│  └────┴────┴────┘ └────┴────┴────┘ └────┴────┴────┘  │
│    Scene 1 (12s)    Scene 2 (8s)     Scene 3 (12s)    │
│               ▲ Playhead                                │
│  [00:00] ─────┼───────────────────────────── [00:32]  │
└─────────────────────────────────────────────────────────┘
```

### Interaction Patterns

1. **Click Timeline to Seek**:
   - Click thumbnail → Jump to that scene + timestamp
   - Playhead indicator follows video playback

2. **Segment Boundaries**:
   - Visual separators between scenes
   - Distinct colors per scene
   - Duration labels on each segment

3. **Remix History Vertical Stack**:
   - Original at bottom (or top - decide in implementation)
   - Each remix stacked vertically
   - Click to preview old version
   - Current version highlighted

4. **Auto-Scroll Timeline**:
   - Timeline scrolls to keep playhead visible
   - Smooth scrolling during playback

## Memory Optimization

### Lazy Loading Pattern

```typescript
const LazyThumbnailTimeline = ({ segments }) => {
  const [loadedThumbnails, setLoadedThumbnails] = useState(new Set());
  const timelineRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const segmentId = entry.target.dataset.segmentId;
            if (!loadedThumbnails.has(segmentId)) {
              generateThumbnails(segmentId);
              setLoadedThumbnails(prev => new Set([...prev, segmentId]));
            }
          }
        });
      },
      { rootMargin: '100px' } // Pre-load 100px ahead
    );

    const segments = timelineRef.current.querySelectorAll('.segment-container');
    segments.forEach(segment => observer.observe(segment));

    return () => observer.disconnect();
  }, [segments]);

  return <div ref={timelineRef}>{/* segments */}</div>;
};
```

### Canvas Optimization

```typescript
// Use offscreen canvas for repeated operations
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 120;
offscreenCanvas.height = 68;
const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });

// Disable alpha channel for opaque images (faster rendering)
const ctx = canvas.getContext('2d', { alpha: false });

// Use integer coordinates to avoid sub-pixel rendering
ctx.drawImage(video, Math.floor(x), Math.floor(y));

// Always clean up blob URLs
URL.revokeObjectURL(thumbnailUrl);
```

## Resources

### MDN Documentation
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- requestVideoFrameCallback: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- Canvas Optimization: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

### GitHub Examples
- react-timeline-editor: https://github.com/xzdarcy/react-timeline-editor
- react-video-timeline-slider: https://github.com/prakhars144/react-video-timelines-slider
- clientside-video-thumbnails: https://github.com/SCRMHub/clientside-video-thumbnails

### Tutorials
- Video Thumbnails with Canvas: https://medium.com/@c.nwaugha/render-video-thumbnails-using-html-canvas-dc7d08a5ed6f
- requestVideoFrameCallback Guide: https://web.dev/articles/requestvideoframecallback-rvfc
