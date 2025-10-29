# Video Import & Minimal UI PRP

**Story**: Import homepage videos into Scene Builder + Minimal text-focused UI redesign

**Type**: Feature Enhancement + UI Refactor
**Complexity**: Medium-High
**Created**: 2025-10-30
**Confidence Score**: 8/10 for one-pass implementation

---

## 1. STORY GOAL

### User Requirements
1. **Import Homepage Videos**: Users should be able to use videos generated on homepage in Scene Builder
2. **24-Hour Remix Window**: Videos older than 24h cannot be remixed, but can still be extended
3. **Minimal UI**: Scene Builder should be text-focused, removing unnecessary buttons and visual clutter

### Success Criteria
- ✅ User can select a video from homepage history and open it in Scene Builder
- ✅ Videos >24h old show "Remix Disabled - Extend Only" state
- ✅ Videos <24h old allow both remix and extend
- ✅ Scene Builder UI is minimal, text-focused, and decluttered
- ✅ All existing Scene Builder functionality remains intact

---

## 2. CONTEXT

### Current Architecture

**Homepage Video Storage** (`src/stores/videoStore.ts`):
- Stores `VideoMetadata[]` in localStorage via `storageService`
- Video blobs are memory-only (lost on refresh)
- Metadata persists for 24 hours
- Fields: `openaiVideoId`, `prompt`, `parameters`, `createdAt`, `expiresAt`, `remixedFrom`, `remixCount`

**Scene Builder Storage** (`src/stores/sceneBuilderStore.ts`):
- Stores `Scene[]` with embedded `SceneVersion[]`
- No localStorage persistence (session-only by design)
- Separate `useBlobStore` for video blobs
- Uses Zundo temporal middleware for undo/redo

**Key Services**:
- `src/services/openaiService.ts` - Video creation, polling, download
- `src/services/remixService.ts` - Remix, delta analysis, expiration checks
- `src/services/storageService.ts` - localStorage wrapper
- `src/utils/videoFrameExtractor.ts` - Last frame extraction

### Critical Files for Import Flow
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/types/index.ts` | Type definitions | ADD: `ImportedVideoMetadata` type |
| `src/components/VideoHistoryGallery.tsx` | Homepage video gallery | ADD: "Open in Scene Builder" button |
| `src/pages/SceneBuilder.tsx` | Scene Builder main page | ADD: Import flow on mount |
| `src/stores/sceneBuilderStore.ts` | Scene Builder state | ADD: `importFromHomepage()` action |
| `src/App.tsx` | Routing | ADD: Query param support for import |

### Current UI Elements (Scene Builder)

**Elements to KEEP**:
- ✅ Prompt textarea (core input)
- ✅ Video player (core output)
- ✅ Action buttons (Analyze/Remix/Approve/Generate)
- ✅ Undo/Redo buttons
- ✅ DeltaDisplay changes list
- ✅ Initial scene form

**Elements to REMOVE/SIMPLIFY**:
- ❌ Scene metadata display (Scene ID, Version ID, Duration)
- ❌ Progress percentage text (keep bar only)
- ❌ History counter "3 / 2" (show buttons only)
- ❌ DeltaDisplay "Preserved" section
- ❌ DeltaDisplay "Warnings" section (merge into changes)
- ❌ Emoji icons (✨, ⚠️, ←, →)
- ❌ Colored status badges (use text only)
- ❌ Next scene notice banner (redundant)
- ❌ Last frame preview label text
- ❌ Button hover animations

---

## 3. IMPLEMENTATION TASKS

### Phase 1: Import Infrastructure (4-6 hours)

#### Task 1.1: Add Import Types
**File**: `src/types/index.ts`

**Action**: ADD new types after `SceneBuilderState`

```typescript
// Video import from homepage to Scene Builder
export interface ImportConfig {
  videoMetadata: VideoMetadata;  // From homepage history
  importMode: 'remix' | 'extend';  // Based on expiration
}

// Extend SceneBuilderState interface
export interface SceneBuilderState {
  // ... existing fields
  importedFrom: VideoMetadata | null;  // Track source video

  // ... existing actions
  importFromHomepage: (config: ImportConfig) => Promise<void>;
}
```

**Validation**:
```bash
npm run build  # Must compile without errors
```

---

#### Task 1.2: Add Import Action to Scene Builder Store
**File**: `src/stores/sceneBuilderStore.ts`

**Action**: ADD `importFromHomepage` action before `reset()` function

**Pattern to Follow**: Mirror `createScene()` structure (lines 26-88)

```typescript
// Import video from homepage with appropriate mode
importFromHomepage: async (config: ImportConfig) => {
  const { videoMetadata, importMode } = config;
  const apiKey = storageService.getApiKey();

  if (!apiKey) {
    set({ error: 'API key not found' });
    return;
  }

  const sceneId = `scene-${Date.now()}`;
  const versionId = `v1`;

  try {
    set({ isRemixing: true, error: null, remixProgress: 0 });

    // Re-download video from OpenAI (blob not persisted)
    const blob = await openaiService.downloadVideo(videoMetadata.openaiVideoId, apiKey);
    const blobId = `blob-${Date.now()}`;
    useBlobStore.getState().addBlob(blobId, blob);

    // Create scene from imported video
    const version: SceneVersion = {
      id: versionId,
      openaiVideoId: videoMetadata.openaiVideoId,
      prompt: videoMetadata.prompt,
      videoBlobId: blobId,
      createdAt: videoMetadata.createdAt,  // Preserve original timestamp
      isApproved: false,
    };

    const scene: Scene = {
      id: sceneId,
      versions: [version],
      currentVersionId: versionId,
      isLocked: false,
      initialConfig: {
        prompt: videoMetadata.prompt,
        seconds: videoMetadata.parameters.seconds,
        size: videoMetadata.parameters.size,
        model: videoMetadata.parameters.model,
        numSegments: 1,
      },
    };

    set({
      scenes: [scene],
      currentSceneId: sceneId,
      editedPrompt: videoMetadata.prompt,
      importedFrom: videoMetadata,
      isRemixing: false,
      remixProgress: 0,
    });

  } catch (error: any) {
    set({
      error: error.message,
      isRemixing: false,
      remixProgress: 0,
    });
  }
},
```

**Also UPDATE**: `reset()` function to clear `importedFrom`:
```typescript
reset: () => {
  // ... existing cleanup
  set({
    // ... existing fields
    importedFrom: null,  // ADD this line
  });
},
```

**Validation**:
```bash
npm run build
# Must compile without errors
```

---

#### Task 1.3: Add "Open in Scene Builder" Button to Homepage Gallery
**File**: `src/components/VideoHistoryGallery.tsx`

**Action**: ADD new button in actions overlay (after Remix button, before Download)

**Pattern to Follow**: Existing button structure (lines with Remix/Download buttons)

**Add after Remix button**:
```typescript
{/* Open in Scene Builder */}
<button
  onClick={() => handleOpenInSceneBuilder(metadata)}
  disabled={!apiKey}
  title="Open in Scene Builder"
  className="action-button"
>
  🎬 Scene Builder
</button>
```

**Add handler function** before return statement:
```typescript
const handleOpenInSceneBuilder = (metadata: VideoMetadata) => {
  if (!apiKey) return;

  // Navigate to Scene Builder with import params
  const importMode = isVideoExpired(metadata) ? 'extend' : 'remix';
  const params = new URLSearchParams({
    import: 'true',
    videoId: metadata.openaiVideoId,
    mode: importMode,
  });

  window.location.href = `/scene-builder?${params.toString()}`;
};
```

**Validation**:
```bash
npm run dev:vercel
# Navigate to homepage, generate video, click "Scene Builder" button
# Should redirect to Scene Builder with query params
```

---

#### Task 1.4: Handle Import on Scene Builder Mount
**File**: `src/pages/SceneBuilder.tsx`

**Action**: ADD import detection useEffect after hooks setup

**Add after** `useKeyboardShortcuts()` call (line 16):

```typescript
import { useEffect } from 'react';  // ADD to imports
import { useLocation } from 'react-router-dom';  // ADD to imports
import { useVideoStore } from '../stores/videoStore';  // ADD to imports
import { isVideoExpired } from '../types';  // ADD to imports

// ... inside SceneBuilder component:

const location = useLocation();
const videoHistory = useVideoStore(state => state.videoHistory);

useEffect(() => {
  const params = new URLSearchParams(location.search);
  const shouldImport = params.get('import') === 'true';
  const videoId = params.get('videoId');
  const mode = params.get('mode') as 'remix' | 'extend';

  if (shouldImport && videoId) {
    // Find video in homepage history
    const metadata = videoHistory.find(v => v.openaiVideoId === videoId);

    if (metadata) {
      const actualMode = isVideoExpired(metadata) ? 'extend' : mode;
      importFromHomepage({ videoMetadata: metadata, importMode: actualMode });

      // Clean up URL params after import
      window.history.replaceState({}, '', '/scene-builder');
    } else {
      setError('Video not found in history');
    }
  }
}, [location.search, videoHistory]);
```

**Validation**:
```bash
npm run dev:vercel
# Test flow: Homepage → Generate Video → Click "Scene Builder"
# Scene Builder should auto-load video
```

---

### Phase 2: Remix-Disabled Mode for Expired Videos (2-3 hours)

#### Task 2.1: Add Expiration Warning to Prompt Editor
**File**: `src/components/scene-builder/PromptEditor.tsx`

**Action**: UPDATE to show expiration notice when imported video is expired

**Add** before textarea (around line 57):

```typescript
const importedFrom = useSceneBuilderStore(state => state.importedFrom);
const isImportExpired = importedFrom && isVideoExpired(importedFrom);

// ... in JSX:

{isImportExpired && !isLocked && (
  <div className="expiration-notice">
    ⏰ This video is >24h old. Remix disabled, but you can extend it.
  </div>
)}
```

**Update** Analyze and Remix buttons to disable if expired:
```typescript
<button
  onClick={handleAnalyze}
  disabled={!hasChanges || isAnalyzingDelta || isRemixing || isImportExpired}
  className="analyze-button"
  title={isImportExpired ? 'Remix disabled - video >24h old' : ''}
>
  {isAnalyzingDelta ? 'Analyzing...' : 'Analyze Changes'}
</button>

<button
  onClick={handleRemix}
  disabled={!deltaAnalysis || isRemixing || isImportExpired}
  className="remix-button primary"
  title={isImportExpired ? 'Remix disabled - video >24h old' : ''}
>
  {isRemixing ? 'Remixing...' : 'Remix Scene'}
</button>
```

**Validation**:
```bash
# Manual test with expired video:
# 1. Modify videoMetadata.expiresAt to past date in localStorage
# 2. Import video to Scene Builder
# 3. Verify Analyze/Remix buttons are disabled
# 4. Verify "Approve & Continue →" button still works
```

---

#### Task 2.2: Add CSS for Expiration Notice
**File**: `src/styles/scene-builder.css`

**Action**: ADD after `.next-scene-notice` (line 141)

```css
.expiration-notice {
  padding: 1rem;
  background: #FFF3E0;
  border-left: 4px solid #FF9800;
  border-radius: 4px;
  color: #E65100;
  font-size: 0.95rem;
  margin-bottom: 1rem;
}
```

**Validation**:
```bash
npm run build
# Check that CSS compiles
```

---

### Phase 3: Minimal UI Redesign (6-8 hours)

#### Task 3.1: Remove Scene Metadata Display
**File**: `src/components/scene-builder/SceneCanvas.tsx`

**Action**: REMOVE lines 53-57 (scene metadata display)

**Delete** entire block:
```typescript
<div className="scene-metadata">
  <p>Scene: {currentScene?.id}</p>
  <p>Version: {currentVersion?.id}</p>
  <p>Duration: {currentScene?.initialConfig.seconds}s</p>
</div>
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 66-74):
```css
.scene-metadata {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

.scene-metadata p {
  margin: 0.25rem 0;
}
```

**Validation**:
```bash
npm run dev:vercel
# Navigate to Scene Builder
# Verify metadata no longer displayed under video
```

---

#### Task 3.2: Simplify Progress Display
**File**: `src/components/scene-builder/SceneCanvas.tsx`

**Action**: UPDATE progress text to be minimal

**Replace** line 32:
```typescript
// OLD:
<p>Generating remix... {remixProgress}%</p>

// NEW:
<p>Generating...</p>
```

**Validation**:
```bash
# Test during remix generation
# Verify only "Generating..." shown (no percentage)
```

---

#### Task 3.3: Remove History Counter
**File**: `src/components/scene-builder/VersionControls.tsx`

**Action**: REMOVE lines 28-30 (history count display)

**Delete**:
```typescript
<span className="history-count">
  {pastStates.length} / {futureStates.length}
</span>
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 368-372):
```css
.history-count {
  font-size: 0.85rem;
  color: #666;
  padding: 0 0.5rem;
}
```

**Validation**:
```bash
npm run dev:vercel
# Verify only Undo/Redo buttons shown (no counter)
```

---

#### Task 3.4: Simplify Delta Display - Remove Preserved Section
**File**: `src/components/scene-builder/DeltaDisplay.tsx`

**Action**: REMOVE lines 36-41 (preserved section)

**Delete entire block**:
```typescript
{deltaAnalysis.preserved.length > 0 && (
  <div className="delta-preserved">
    <h4>Preserved:</h4>
    <p>{deltaAnalysis.preserved.join(', ')}</p>
  </div>
)}
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 314-326):
```css
.delta-preserved {
  margin-top: 1rem;
}

.delta-preserved h4 {
  margin-bottom: 0.5rem;
}

.delta-preserved p {
  margin: 0;
  font-size: 0.9rem;
  color: #666;
}
```

**Validation**:
```bash
npm run dev:vercel
# Analyze prompt changes
# Verify "Preserved" section not shown
```

---

#### Task 3.5: Simplify Delta Display - Inline Warnings
**File**: `src/components/scene-builder/DeltaDisplay.tsx`

**Action**: REMOVE warnings section, warnings already shown inline per change

**Delete** lines 43-52:
```typescript
{deltaAnalysis.warnings && deltaAnalysis.warnings.length > 0 && (
  <div className="delta-warnings">
    <h4>⚠️ Warnings:</h4>
    <ul>
      {deltaAnalysis.warnings.map((warning, i) => (
        <li key={i}>{warning}</li>
      ))}
    </ul>
  </div>
)}
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 328-344):
```css
.delta-warnings {
  margin-top: 1rem;
  padding: 1rem;
  background: #FFEBEE;
  border-radius: 4px;
  border-left: 4px solid #F44336;
}

.delta-warnings h4 {
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.delta-warnings ul {
  margin: 0;
  padding-left: 1.5rem;
}
```

**Validation**:
```bash
# Warnings still shown inline on change items (warning-badge remains)
```

---

#### Task 3.6: Remove Emoji Icons
**File**: Multiple files

**Action**: REMOVE emoji characters from text

**File 1**: `src/components/scene-builder/PromptEditor.tsx`
- Line 111: Change `✨ Scene approved!` to `Scene approved!`

**File 2**: `src/components/scene-builder/DeltaDisplay.tsx`
- Line 28: Change `⚠️ May affect continuity` to `May affect continuity`

**File 3**: `src/components/scene-builder/VersionControls.tsx`
- Line 25: Change `← Undo` to `Undo`
- Line 39: Change `Redo →` to `Redo`

**File 4**: `src/components/VideoHistoryGallery.tsx` (if not done in Task 1.3)
- Change `🎬 Scene Builder` to `Scene Builder`

**Validation**:
```bash
npm run dev:vercel
# Verify no emoji icons displayed
```

---

#### Task 3.7: Simplify Remix Type Badge to Text
**File**: `src/components/scene-builder/DeltaDisplay.tsx`

**Action**: REPLACE styled badge with simple text

**Replace** lines 14-16:
```typescript
// OLD:
<span className={`remix-type ${deltaAnalysis.remix_type}`}>
  {deltaAnalysis.remix_type.replace('_', ' ')}
</span>

// NEW:
<span className="remix-type-text">
  ({deltaAnalysis.remix_type.replace('_', ' ')})
</span>
```

**UPDATE** CSS in `src/styles/scene-builder.css`:

**REPLACE** lines 244-267 (all remix-type variations) with:
```css
.remix-type-text {
  font-size: 0.9rem;
  color: #666;
  margin-left: 0.5rem;
}
```

**Validation**:
```bash
# Verify remix type shown as "(minor tweak)" text, not colored badge
```

---

#### Task 3.8: Remove Button Hover Animations
**File**: `src/styles/scene-builder.css`

**Action**: DELETE lines 206-209

**Remove**:
```css
button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

**KEEP** color change on hover (if exists elsewhere)

**Validation**:
```bash
npm run dev:vercel
# Hover over buttons - verify no transform animation
```

---

#### Task 3.9: Remove Next Scene Notice Banner
**File**: `src/components/scene-builder/PromptEditor.tsx`

**Action**: DELETE lines 109-113

**Remove**:
```typescript
{isLocked && !isRemixing && (
  <div className="next-scene-notice">
    ✨ Scene approved! Describe what happens next to continue your story.
  </div>
)}
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 134-141):
```css
.next-scene-notice {
  padding: 1rem;
  background: #E8F5E9;
  border-left: 4px solid #4CAF50;
  border-radius: 4px;
  color: #2E7D32;
  font-size: 0.95rem;
}
```

**Validation**:
```bash
# Approve scene, verify no banner shown (header change is enough indicator)
```

---

#### Task 3.10: Simplify Last Frame Preview Label
**File**: `src/components/scene-builder/PromptEditor.tsx`

**Action**: REMOVE label text from last frame preview

**Replace** lines 49-54:
```typescript
// OLD:
<div className="last-frame-preview">
  <p className="preview-label">Continuing from:</p>
  <img src={lastFramePreview} alt="Last frame" className="preview-image" />
</div>

// NEW:
<div className="last-frame-preview">
  <img src={lastFramePreview} alt="Last frame" className="preview-image" />
</div>
```

**Also DELETE** CSS in `src/styles/scene-builder.css` (lines 119-125):
```css
.preview-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}
```

**Validation**:
```bash
# Approve scene, verify frame shown without "Continuing from:" label
```

---

### Phase 4: Testing & Documentation (2-3 hours)

#### Task 4.1: Manual Testing Checklist

**Test Import Flow**:
- [ ] Generate video on homepage
- [ ] Click "Scene Builder" button
- [ ] Verify video loads in Scene Builder
- [ ] Verify prompt pre-populated
- [ ] Verify import mode correct (remix/extend)

**Test Expired Video Import**:
- [ ] Manually expire video (change expiresAt to past)
- [ ] Import to Scene Builder
- [ ] Verify expiration notice shown
- [ ] Verify Analyze/Remix disabled
- [ ] Verify Approve & Extend still works

**Test Fresh Video Import**:
- [ ] Import fresh video (<24h)
- [ ] Verify all buttons enabled
- [ ] Test remix flow
- [ ] Test extend flow

**Test Minimal UI**:
- [ ] Verify no scene metadata shown
- [ ] Verify no history counter shown
- [ ] Verify no "Preserved" section in delta
- [ ] Verify no warnings section in delta
- [ ] Verify no emoji icons
- [ ] Verify no button animations
- [ ] Verify no next scene banner

**Validation**:
```bash
# All checkboxes must pass
```

---

#### Task 4.2: Update CLAUDE.md Documentation
**File**: `CLAUDE.md`

**Action**: ADD new section about Scene Builder import feature

**Add** after Scene Builder section:

```markdown
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
```

**Validation**:
```bash
# Documentation added, commit changes
git add CLAUDE.md
git commit -m "docs: add Scene Builder import documentation"
```

---

## 4. VALIDATION GATES

### Pre-Implementation Validation
```bash
npm run build  # Must succeed before starting
npm run dev:vercel  # Verify dev server works
```

### Per-Task Validation
Each task above includes specific validation command(s). All must pass before proceeding to next task.

### Final Integration Validation
```bash
# Build check
npm run build

# Type check
npx tsc --noEmit

# Verify all features work:
npm run dev:vercel
# 1. Generate video on homepage
# 2. Import to Scene Builder (fresh video)
# 3. Test remix flow
# 4. Import expired video
# 5. Verify extend-only mode
# 6. Check minimal UI (no clutter)
```

---

## 5. ROLLBACK PLAN

If critical issues arise:

### Rollback Import Feature
```bash
git revert <commit-hash>  # Revert import-related commits
# Or manually:
# - Remove "Scene Builder" button from VideoHistoryGallery
# - Remove import detection from SceneBuilder.tsx
# - Remove importFromHomepage action from store
```

### Rollback UI Changes
```bash
# Restore original components:
git checkout HEAD~1 src/components/scene-builder/
git checkout HEAD~1 src/styles/scene-builder.css
```

### Partial Rollback
- Import feature independent from UI changes
- Can rollback one without affecting the other
- All changes are additive (no breaking changes to existing API)

---

## 6. KNOWN LIMITATIONS

1. **No Video Thumbnail**: Gallery shows placeholders, not actual video frames
2. **No Bulk Import**: Can only import one video at a time
3. **Session-Only**: Imported videos lost on refresh (by design for privacy)
4. **No Import History**: Can't see which videos were imported before
5. **Manual Expiration Override**: No way to force remix on expired video (OpenAI API limitation)

---

## 7. FUTURE ENHANCEMENTS

1. **Import Multiple Videos**: Batch import as sequential scenes
2. **Video Thumbnails**: Extract first frame for gallery preview
3. **Import from URL**: Allow direct OpenAI video ID import
4. **Keyboard Shortcuts**: Alt+I for quick import
5. **Import Confirmation**: Show preview before importing
6. **Expiration Timer**: Live countdown in Scene Builder

---

## 8. SUCCESS METRICS

**Feature Complete**:
- ✅ All 17 tasks pass validation
- ✅ Build succeeds with zero errors
- ✅ Manual testing checklist 100% pass rate

**UX Improved**:
- ✅ Scene Builder 25-30% less visual clutter
- ✅ Text-focused design achieved
- ✅ Import flow requires ≤3 clicks

**Code Quality**:
- ✅ CSS reduced by ~120-150 lines
- ✅ No console errors in production
- ✅ All imports type-safe

---

**END OF PRP**
