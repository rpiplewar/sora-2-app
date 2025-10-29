# Undo/Redo Implementation Patterns for Video Generation App

## Research Summary

This document provides implementation guidance for adding undo/redo functionality to the Sora Video Generator with Zustand state management. Special focus on memory optimization for large video blobs.

---

## 1. Recommended Approach: Zundo Middleware (Lightweight)

### Overview
**Zundo** is the most popular and lightweight undo/redo middleware for Zustand (<700 bytes). It provides built-in time-travel capabilities with minimal overhead.

### Installation
```bash
npm install zundo
```

### Basic Implementation

```typescript
import { create } from 'zustand';
import { temporal } from 'zundo';

interface VideoStoreState {
  segments: VideoSegment[];
  apiKey: string;
  videoBlobs: Blob[];
  // ... other state
}

const useVideoStore = create<VideoStoreState>()(
  temporal(
    (set) => ({
      segments: [],
      apiKey: '',
      videoBlobs: [],
      // ... actions
    }),
    {
      // Configuration options (see below)
      limit: 50,  // Maximum history depth
      partialize: (state) => {
        // CRITICAL: Exclude large blobs from history
        const { videoBlobs, ...rest } = state;
        return rest;
      },
      equality: (past, current) =>
        JSON.stringify(past) === JSON.stringify(current),
    }
  )
);
```

### Accessing Temporal Functions

```typescript
// In React components
const { undo, redo, clear } = useVideoStore.temporal.getState();

// Undo/redo buttons
<button onClick={() => undo()} disabled={!canUndo}>
  Undo (Ctrl+Z)
</button>
<button onClick={() => redo()} disabled={!canRedo}>
  Redo (Ctrl+Shift+Z)
</button>
```

### React Hook for Reactive History State

```typescript
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { TemporalState } from 'zundo';

function useTemporalStore<T>(
  selector: (state: TemporalState<VideoStoreState>) => T,
  equality?: (a: T, b: T) => boolean,
) {
  return useStoreWithEqualityFn(useVideoStore.temporal, selector, equality);
}

// Usage in component
function UndoRedoControls() {
  const { undo, redo, pastStates, futureStates } = useTemporalStore(
    (state) => state
  );

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>
        Undo ({pastStates.length})
      </button>
      <button onClick={redo} disabled={!canRedo}>
        Redo ({futureStates.length})
      </button>
    </div>
  );
}
```

---

## 2. Critical: Memory Optimization for Video Blobs

### Problem
Video blobs can be 10-100MB each. Storing them in history would create:
- 10 segments × 50 history states = 500 video copies = 5-50GB memory usage ❌

### Solution 1: Partialize (Exclude Blobs from History)

```typescript
{
  partialize: (state) => {
    const {
      videoBlobs,           // Exclude raw blobs
      concatenatedVideo,    // Exclude final video
      ffmpegInstance,       // Exclude FFmpeg instance
      ...trackableState
    } = state;
    return trackableState;
  }
}
```

**What Gets Tracked:**
- ✅ Video segment metadata (prompts, status, config)
- ✅ API key
- ✅ Processing state flags
- ✅ Error messages
- ❌ Video blob data
- ❌ FFmpeg instance
- ❌ Large binary data

### Solution 2: Reference-Based Blob Management

Keep blobs in a separate store that doesn't use undo/redo:

```typescript
// Separate store for blob storage (no temporal middleware)
const useBlobStore = create<{
  blobs: Map<string, Blob>;
  addBlob: (id: string, blob: Blob) => void;
  getBlob: (id: string) => Blob | undefined;
}>((set, get) => ({
  blobs: new Map(),
  addBlob: (id, blob) => set((state) => {
    const newBlobs = new Map(state.blobs);
    newBlobs.set(id, blob);
    return { blobs: newBlobs };
  }),
  getBlob: (id) => get().blobs.get(id),
}));

// Main store only tracks blob IDs
const useVideoStore = create<VideoStoreState>()(
  temporal(
    (set) => ({
      segments: [
        { id: 'seg-1', blobId: 'blob-123', prompt: '...' }
      ],
      // ...
    }),
    { limit: 50 }
  )
);
```

### Solution 3: IndexedDB for Large Video Storage

For persistent storage across sessions:

```typescript
// Store videos in IndexedDB, keep only references in Zustand
async function saveVideoToIndexedDB(id: string, blob: Blob): Promise<void> {
  const db = await openDB('sora-videos', 1, {
    upgrade(db) {
      db.createObjectStore('videos');
    },
  });
  await db.put('videos', blob, id);
}

async function getVideoFromIndexedDB(id: string): Promise<Blob | undefined> {
  const db = await openDB('sora-videos', 1);
  return db.get('videos', id);
}

// Store only references in Zustand
{
  segments: [
    {
      id: 'seg-1',
      videoId: 'video-123',  // Reference to IndexedDB
      prompt: '...'
    }
  ]
}
```

**Benefits:**
- Persistent storage (survives page refresh)
- No memory duplication in undo/redo history
- Can store gigabytes of video data
- Browser handles memory management

---

## 3. Alternative: Zustand-Travel (JSON Patch Based)

### Overview
Uses JSON Patch to store only state differences, not full snapshots. **10x faster than Immer** according to documentation.

### Installation
```bash
npm install zustand-travel
```

### Implementation

```typescript
import { travel } from 'zustand-travel';

const useVideoStore = create<VideoStoreState>()(
  travel(
    (set) => ({
      segments: [],
      // ... state
    }),
    {
      limit: 50,
      // Auto-archive mode: each set() creates history entry
    }
  )
);

// Access controls
const { undo, redo, archive, go, reset, controls } = useVideoStore.getState();
```

### When to Use
- Complex nested state structures
- Frequent small updates to large objects
- Need precise memory optimization (stores only diffs)

### Memory Efficiency Example
```typescript
// Traditional snapshot approach: 1MB state × 100 changes = 100MB
// JSON Patch approach: 1MB state + 100 patches (~5KB each) = 1.5MB

// Example patch for incrementing a counter:
[{ op: 'replace', path: 'count', value: 5 }]  // Only ~30 bytes!
```

---

## 4. Command Pattern (Most Flexible)

### Overview
Best for complex operations that need custom undo logic. Used by professional video editors (Premiere Pro, DaVinci Resolve).

### Base Implementation

```typescript
// Base Command class
export abstract class Command<T> {
  utils: T;

  constructor(utils: T) {
    this.utils = utils;
  }

  abstract execute(): void | Promise<void>;
  abstract undo(): void | Promise<void>;
  abstract getInfo(): string;
}

// Example: Add Video Segment Command
interface VideoCommandUtils {
  segments: VideoSegment[];
  setSegments: (segments: VideoSegment[]) => void;
  blobStore: Map<string, Blob>;
}

export class AddSegmentCommand extends Command<VideoCommandUtils> {
  private segmentId: string;
  private segment: VideoSegment;

  constructor(utils: VideoCommandUtils, segment: VideoSegment) {
    super(utils);
    this.segment = segment;
    this.segmentId = segment.id;
  }

  async execute() {
    const { segments, setSegments } = this.utils;
    setSegments([...segments, this.segment]);
  }

  async undo() {
    const { segments, setSegments, blobStore } = this.utils;

    // Remove segment from state
    setSegments(segments.filter(s => s.id !== this.segmentId));

    // Clean up blob (optional, prevents memory leak)
    blobStore.delete(this.segment.blobId);
  }

  getInfo() {
    return `Add segment: "${this.segment.prompt}"`;
  }
}

// History Manager Hook
function useHistoryManager<T>() {
  const [backHistory, setBackHistory] = useState<Command<T>[]>([]);
  const [forwardHistory, setForwardHistory] = useState<Command<T>[]>([]);

  const executeCommand = async (command: Command<T>) => {
    setForwardHistory([]);  // Clear redo stack
    await command.execute();
    setBackHistory(prev => [...prev, command]);
  };

  const undo = async () => {
    if (backHistory.length === 0) return;

    const command = backHistory[backHistory.length - 1];
    await command.undo();

    setBackHistory(prev => prev.slice(0, -1));
    setForwardHistory(prev => [...prev, command]);
  };

  const redo = async () => {
    if (forwardHistory.length === 0) return;

    const command = forwardHistory[forwardHistory.length - 1];
    await command.execute();

    setForwardHistory(prev => prev.slice(0, -1));
    setBackHistory(prev => [...prev, command]);
  };

  return { executeCommand, undo, redo, backHistory, forwardHistory };
}
```

### Video-Specific Commands

```typescript
// Delete Segment Command
export class DeleteSegmentCommand extends Command<VideoCommandUtils> {
  private segmentId: string;
  private deletedSegment: VideoSegment;
  private deletedIndex: number;

  constructor(utils: VideoCommandUtils, segmentId: string) {
    super(utils);
    this.segmentId = segmentId;
  }

  async execute() {
    const { segments, setSegments } = this.utils;
    this.deletedIndex = segments.findIndex(s => s.id === this.segmentId);
    this.deletedSegment = segments[this.deletedIndex];

    setSegments(segments.filter(s => s.id !== this.segmentId));
  }

  async undo() {
    const { segments, setSegments } = this.utils;
    const newSegments = [...segments];
    newSegments.splice(this.deletedIndex, 0, this.deletedSegment);
    setSegments(newSegments);
  }

  getInfo() {
    return `Delete segment: "${this.deletedSegment?.prompt || 'Unknown'}"`;
  }
}

// Reorder Segments Command
export class ReorderSegmentsCommand extends Command<VideoCommandUtils> {
  private oldOrder: VideoSegment[];
  private newOrder: VideoSegment[];

  constructor(utils: VideoCommandUtils, newOrder: VideoSegment[]) {
    super(utils);
    this.oldOrder = [...utils.segments];
    this.newOrder = newOrder;
  }

  async execute() {
    this.utils.setSegments(this.newOrder);
  }

  async undo() {
    this.utils.setSegments(this.oldOrder);
  }

  getInfo() {
    return 'Reorder segments';
  }
}

// Update Segment Prompt Command
export class UpdatePromptCommand extends Command<VideoCommandUtils> {
  private segmentId: string;
  private oldPrompt: string;
  private newPrompt: string;

  constructor(utils: VideoCommandUtils, segmentId: string, newPrompt: string) {
    super(utils);
    this.segmentId = segmentId;
    this.newPrompt = newPrompt;

    const segment = utils.segments.find(s => s.id === segmentId);
    this.oldPrompt = segment?.prompt || '';
  }

  async execute() {
    const { segments, setSegments } = this.utils;
    setSegments(
      segments.map(s =>
        s.id === this.segmentId ? { ...s, prompt: this.newPrompt } : s
      )
    );
  }

  async undo() {
    const { segments, setSegments } = this.utils;
    setSegments(
      segments.map(s =>
        s.id === this.segmentId ? { ...s, prompt: this.oldPrompt } : s
      )
    );
  }

  getInfo() {
    return `Update prompt: "${this.oldPrompt}" → "${this.newPrompt}"`;
  }
}
```

### Benefits of Command Pattern
- ✅ Custom undo logic per operation type
- ✅ Handles complex async operations
- ✅ Descriptive history (shows what was done)
- ✅ Can batch multiple commands
- ✅ Memory efficient (stores only necessary data)
- ❌ More boilerplate code
- ❌ Requires discipline to use consistently

---

## 5. UI Patterns & Best Practices

### Keyboard Shortcuts (Industry Standard)

```typescript
import { useEffect } from 'react';

function useUndoRedoShortcuts(undo: () => void, redo: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      } else if (ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (ctrlKey && e.key === 'y') {
        // Alternative redo shortcut
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}
```

### Button UI Pattern

```typescript
function UndoRedoToolbar() {
  const { undo, redo } = useVideoStore.temporal.getState();
  const { pastStates, futureStates } = useTemporalStore((state) => state);

  useUndoRedoShortcuts(undo, redo);

  return (
    <div className="undo-redo-toolbar">
      <button
        onClick={undo}
        disabled={pastStates.length === 0}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <UndoIcon />
        Undo
      </button>

      <button
        onClick={redo}
        disabled={futureStates.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <RedoIcon />
        Redo
      </button>

      {/* Optional: History dropdown */}
      <HistoryDropdown
        pastStates={pastStates}
        futureStates={futureStates}
      />
    </div>
  );
}
```

### History List UI

```typescript
function HistoryList() {
  const { pastStates, futureStates, undo, redo } = useTemporalStore(
    (state) => state
  );

  return (
    <div className="history-list">
      <h3>History</h3>
      <ul>
        {/* Future states (above current) */}
        {futureStates.slice().reverse().map((state, i) => (
          <li key={`future-${i}`} className="future-state" onClick={redo}>
            {getStateSummary(state)}
          </li>
        ))}

        {/* Current state */}
        <li className="current-state">
          <strong>Current State</strong>
        </li>

        {/* Past states (below current) */}
        {pastStates.slice().reverse().map((state, i) => (
          <li key={`past-${i}`} className="past-state" onClick={undo}>
            {getStateSummary(state)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 6. Hybrid Approach (Recommended for Sora App)

### Strategy
Combine Zundo for lightweight metadata tracking with separate blob storage:

```typescript
// 1. Blob storage (no undo/redo)
const useBlobStore = create<{
  blobs: Map<string, Blob>;
  addBlob: (id: string, blob: Blob) => void;
  removeBlob: (id: string) => void;
  getBlob: (id: string) => Blob | undefined;
}>((set, get) => ({
  blobs: new Map(),

  addBlob: (id, blob) => set((state) => {
    const newBlobs = new Map(state.blobs);
    newBlobs.set(id, blob);
    return { blobs: newBlobs };
  }),

  removeBlob: (id) => set((state) => {
    const newBlobs = new Map(state.blobs);
    newBlobs.delete(id);

    // Revoke object URL to free memory
    const blob = state.blobs.get(id);
    if (blob) {
      URL.revokeObjectURL(URL.createObjectURL(blob));
    }

    return { blobs: newBlobs };
  }),

  getBlob: (id) => get().blobs.get(id),
}));

// 2. Main store with temporal middleware (tracks metadata only)
interface VideoSegmentMetadata {
  id: string;
  blobId: string;        // Reference to blob store
  prompt: string;
  status: SegmentStatus;
  config: GenerationConfig;
  error?: string;
}

const useVideoStore = create<VideoStoreState>()(
  temporal(
    (set, get) => ({
      segments: [] as VideoSegmentMetadata[],
      apiKey: '',

      addSegment: (segment: VideoSegmentMetadata) =>
        set((state) => ({
          segments: [...state.segments, segment]
        })),

      removeSegment: (id: string) =>
        set((state) => {
          // Clean up blob when removing segment
          const segment = state.segments.find(s => s.id === id);
          if (segment) {
            useBlobStore.getState().removeBlob(segment.blobId);
          }
          return {
            segments: state.segments.filter(s => s.id !== id)
          };
        }),
    }),
    {
      limit: 50,
      partialize: (state) => ({
        segments: state.segments,
        apiKey: state.apiKey,
        // Exclude non-serializable data
      }),
    }
  )
);

// 3. Helper hook to combine both stores
function useVideoSegmentWithBlob(segmentId: string) {
  const segment = useVideoStore(state =>
    state.segments.find(s => s.id === segmentId)
  );
  const blob = useBlobStore(state =>
    segment ? state.getBlob(segment.blobId) : undefined
  );

  return { segment, blob };
}
```

### Usage in Components

```typescript
function VideoSegmentPlayer({ segmentId }: { segmentId: string }) {
  const { segment, blob } = useVideoSegmentWithBlob(segmentId);
  const [videoUrl, setVideoUrl] = useState<string>();

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob]);

  if (!segment || !videoUrl) return <div>Loading...</div>;

  return (
    <video src={videoUrl} controls>
      <source src={videoUrl} type="video/mp4" />
    </video>
  );
}
```

---

## 7. Memory Management Best Practices

### Track Memory Usage

```typescript
function useMemoryMonitor() {
  const [memoryUsage, setMemoryUsage] = useState<number>(0);

  useEffect(() => {
    const updateMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMemoryUsage(memory.usedJSHeapSize);
      }
    };

    const interval = setInterval(updateMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  return memoryUsage;
}

// Usage
function MemoryWarning() {
  const memoryUsage = useMemoryMonitor();
  const memoryInMB = memoryUsage / (1024 * 1024);

  if (memoryInMB > 1500) {  // Warn at 1.5GB
    return (
      <div className="warning">
        ⚠️ High memory usage ({memoryInMB.toFixed(0)}MB).
        Consider reducing history depth or clearing old segments.
      </div>
    );
  }

  return null;
}
```

### Clean Up Blobs Proactively

```typescript
// Revoke object URLs when segments are removed from history
useEffect(() => {
  const { pastStates } = useVideoStore.temporal.getState();

  // If history is full, clean up oldest blobs
  if (pastStates.length >= 50) {
    const oldestState = pastStates[0];
    oldestState.segments.forEach(seg => {
      useBlobStore.getState().removeBlob(seg.blobId);
    });
  }
}, []);
```

### Limit History Depth Based on Memory

```typescript
// Dynamic history limit based on segment count
function calculateHistoryLimit(segmentCount: number): number {
  if (segmentCount <= 3) return 50;
  if (segmentCount <= 5) return 30;
  if (segmentCount <= 8) return 20;
  return 10;  // Max 10 segments → lower limit
}

// Update temporal options dynamically
useEffect(() => {
  const segments = useVideoStore.getState().segments;
  const newLimit = calculateHistoryLimit(segments.length);

  // Note: Zundo doesn't support dynamic limit updates
  // Consider implementing custom limit logic
}, [useVideoStore(state => state.segments.length)]);
```

---

## 8. Implementation Checklist

### Phase 1: Basic Undo/Redo
- [ ] Install Zundo: `npm install zundo`
- [ ] Wrap store with `temporal()` middleware
- [ ] Configure `partialize` to exclude large objects
- [ ] Set reasonable `limit` (start with 50)
- [ ] Create undo/redo buttons in UI
- [ ] Add keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
- [ ] Test with small state changes

### Phase 2: Blob Management
- [ ] Create separate `useBlobStore` without temporal middleware
- [ ] Update `VideoSegment` type to use `blobId` references
- [ ] Implement blob cleanup on segment removal
- [ ] Create helper hooks to combine metadata + blobs
- [ ] Test memory usage with 10+ segments

### Phase 3: Advanced Features
- [ ] Add history list UI (optional)
- [ ] Implement memory monitoring
- [ ] Add memory warnings
- [ ] Consider IndexedDB for persistence (optional)
- [ ] Add unit tests for undo/redo logic

### Phase 4: Polish
- [ ] Add loading states during undo/redo
- [ ] Prevent undo during video generation
- [ ] Add tooltips explaining what will be undone
- [ ] Test edge cases (undo during API call, etc.)

---

## 9. Documentation Resources

### Libraries
- **Zundo**: https://github.com/charkour/zundo
- **Zustand-Travel**: https://github.com/mutativejs/zustand-travel
- **Zustand Docs**: https://zustand.docs.pmnd.rs/

### Articles
- **Command Pattern in React**: https://dev.to/mustafamilyas/creating-undo-redo-system-using-command-pattern-in-react-mmg
- **Practical Undo with Immutable.js**: https://macwright.com/2015/05/18/practical-undo.html
- **Kapwing's Undo Implementation**: https://www.kapwing.com/blog/how-to-implement-undo-in-a-react-redux-application/

### Stack Overflow
- **Undo/Redo for Huge Objects**: https://stackoverflow.com/questions/58324932/undo-redo-for-a-huge-object
- **Storing Videos in IndexedDB**: https://stackoverflow.com/questions/16289477/can-i-store-videos-as-blobs-in-indexeddb

---

## 10. Recommendation for Sora App

**Use Hybrid Approach:**

1. ✅ **Zundo for metadata** (segments, prompts, config, status)
2. ✅ **Separate blob store** (no undo/redo, memory efficient)
3. ✅ **50-state history limit** (balance between usability and memory)
4. ✅ **Partialize to exclude blobs** (critical for performance)
5. ✅ **Keyboard shortcuts** (Ctrl+Z, Ctrl+Shift+Z)
6. ⚠️ **Memory monitoring** (warn users at 1.5GB usage)
7. 🔄 **Optional: IndexedDB** (for persistent storage across sessions)

**Why This Approach:**
- Simple to implement (Zundo is <700 bytes)
- Memory efficient (blobs stored separately)
- User-friendly (standard keyboard shortcuts)
- Scalable (works with 10+ video segments)
- Compatible with existing Zustand architecture

**Estimated Implementation Time:**
- Phase 1 (Basic undo/redo): 2-4 hours
- Phase 2 (Blob management): 4-6 hours
- Phase 3 (Advanced features): 2-4 hours
- Total: 1-2 days for full implementation
