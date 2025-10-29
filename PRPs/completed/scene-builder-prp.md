# Scene Builder PRP (Pragmatic Reference Plan)

**Feature**: Scene Builder - Interactive Video Remix Interface with Split-View Editing

**Version**: 1.0
**Created**: 2025-10-29
**Confidence Score**: 9/10 for one-pass implementation success

---

## 1. FEATURE GOAL

### Primary Goal
Build a new "Scene Builder" module that enables users to iteratively refine AI-generated videos through prompt-based remixing with visual delta analysis, undo/redo history, and frame continuity between scenes.

### Deliverables
1. **New Route**: `/scene-builder` - Separate from existing multi-segment generator (`/`)
2. **Split-View Interface**:
   - Left 50%: Video player showing current scene
   - Right 50%: Editable prompt textarea with "Remix" button
3. **Prompt Delta Service**: GPT-4 API integration to analyze prompt changes and generate remix instructions
4. **Remix Generation**: Automated video regeneration using Sora 2 Remix API
5. **Version History**: Undo/Redo buttons for navigating through remix iterations
6. **Frame Continuity**: Extract last frame of approved scene to start next scene

### Success Definition
- User can create first video from prompt
- User can edit prompt and see AI-generated "delta" description
- User can click "Remix" to generate new version based on delta
- User can undo/redo between versions
- User can "lock" approved version and extend to next scene with frame continuity
- All generation preserves existing video blobs in memory with efficient history tracking

---

## 2. CONTEXT

### Critical Architectural Knowledge

```yaml
project_architecture:
  frontend:
    framework: React + TypeScript + Vite
    state_management: Zustand
    storage: sessionStorage (API key), localStorage (video metadata)
    styling: CSS (existing component patterns)

  backend:
    runtime: Vercel Edge Functions
    purpose: CORS proxy only (no video processing)
    endpoints:
      - api/proxy-create-video.ts  # POST to /v1/videos
      - api/proxy-get-status.ts    # GET /v1/videos/{id}
      - api/proxy-plan-prompts.ts  # POST /v1/chat/completions
      # NEED TO ADD:
      - api/proxy-remix-video.ts   # POST /v1/videos/{id}/remix
      - api/proxy-prompt-delta.ts  # POST /v1/chat/completions (delta analysis)

  video_processing:
    engine: FFmpeg.wasm (client-side only)
    initialization: 5-10 seconds on app mount
    memory_limits: Desktop browsers recommended
    operations: Concatenation with `-c copy` (no re-encoding)

existing_features_to_maintain:
  frame_extraction:
    file: src/utils/videoFrameExtractor.ts
    function: extractLastFrame(videoBlob: Blob) => Promise<Blob>
    technique: Canvas API, seeks to duration - 0.1s, JPEG 95% quality
    use_case: Input reference for next scene

  api_key_security:
    storage: sessionStorage only (cleared on tab close)
    validation: Must start with 'sk-proj-' or 'sk-'
    location: src/services/storageService.ts

  polling_pattern:
    interval: 2 seconds
    status_checks: queued | in_progress | completed | failed
    progress_tracking: 0-100 with weighted calculation
    file: src/services/openaiService.ts lines 45-95

  dual_content_type:
    pattern: Edge Functions handle both JSON and FormData
    json_use: First segment (no input_reference)
    formdata_use: Subsequent segments (with input_reference image)
    implementation: api/proxy-create-video.ts lines 15-75

reusable_components:
  services:
    - src/services/openaiService.ts   # Video creation, polling, download
    - src/services/videoService.ts    # FFmpeg wrapper and concatenation
    - src/services/storageService.ts  # API key persistence
    # EXTEND:
    - src/services/planningService.ts # Add delta analysis function

  components:
    - src/components/ApiKeyInput.tsx          # Reuse as-is
    - src/components/VideoPlayer.tsx          # Reuse as-is
    - src/components/OverallProgress.tsx      # Reuse progress bars
    - src/components/ErrorDisplay.tsx         # Reuse error handling
    # CREATE NEW:
    - src/components/scene-builder/SceneCanvas.tsx           # Split view container
    - src/components/scene-builder/PromptEditor.tsx          # Editable prompt + Remix button
    - src/components/scene-builder/DeltaDisplay.tsx          # Show AI-analyzed changes
    - src/components/scene-builder/VersionControls.tsx       # Undo/Redo buttons
    - src/components/scene-builder/SceneBuilder.tsx          # Main page component

  stores:
    - src/stores/videoStore.ts  # EXTEND with scene builder state
    # CREATE NEW:
    - src/stores/sceneBuilderStore.ts  # Scene history, current scene, versions

types:
  existing:
    file: src/types/index.ts
    types_to_extend:
      - VideoSegment: Add remixDelta field
      - CreateVideoRequest: Already has remixedFromVideoId
      - VideoMetadata: Already tracks createdAt, expiresAt, remixedFrom

  new_types_needed:
    - SceneVersion: Tracks individual remix iteration
    - PromptDelta: Delta analysis from GPT-4
    - SceneState: Current active scene with all versions
    - RemixConfig: Parameters for remix generation
```

### API Documentation

```yaml
sora_remix_api:
  documentation: PRPs/ai_docs/sora-2-remix-api.md
  endpoint: POST /v1/videos/{video_id}/remix

  required_parameters:
    prompt: string  # The remix instruction (delta from GPT-4)

  optional_parameters:
    input_reference: Blob  # Image for visual guidance

  inherited_from_parent:
    - model       # sora-2 or sora-2-pro
    - seconds     # "4", "8", or "12" (STRING format)
    - size        # "1280x720", "1792x1024", etc.

  critical_limitations:
    expiration: "Videos only available for remix for 24 hours"
    tracking: "Must track createdAt timestamp and calculate expiresAt"
    formula: "expiresAt = createdAt + (24 * 60 * 60 * 1000)"

  response_format:
    id: "video_abc123"
    status: "queued | in_progress | completed | failed"
    progress: 0-100
    remixed_from_video_id: "video_xyz789"

  polling: "Same pattern as standard video creation (2s interval)"

  best_practices:
    philosophy: "Remix is for nudging, not gambling. One change at a time."
    good_prompts:
      - "same shot, switch to 85 mm"
      - "same lighting, new palette: teal, sand, rust"
      - "same scene, add morning fog"
    bad_prompts:
      - "change lighting, make car blue, add people, aerial view"  # Too many changes

gpt4_prompt_delta:
  documentation: PRPs/ai_docs/undo_redo_patterns.md (section 6: GPT-4 Delta Extraction)

  recommended_model: "gpt-4o-mini"  # Cost: $0.0003 per analysis
  fallback_model: "gpt-4o-2024-08-06"  # For complex semantic analysis

  configuration:
    temperature: 0  # Deterministic output
    response_format: "json_object"
    max_tokens: 1000

  system_prompt_pattern: |
    You are a video prompt comparison specialist for Sora 2 video generation.

    Analyze differences between two prompts and categorize changes by:
    - Visual elements (subjects, environment, colors, lighting)
    - Motion (camera, action)
    - Style (mood, cinematography)
    - Technical (framing, timing)

    Output JSON with:
    - summary: Brief overview
    - changes: Array of categorized changes
    - preserved: Unchanged elements
    - remix_type: minor_tweak | style_shift | major_rewrite
    - warnings: Continuity concerns

  output_structure:
    summary: "One-sentence change overview"
    changes:
      - category: "visual_elements | motion | style | technical"
        type: "added | removed | modified"
        description: "Specific change"
        continuity_safe: boolean
    preserved: ["Unchanged elements"]
    remix_type: "minor_tweak | style_shift | major_rewrite"
    warnings: ["Any continuity concerns"]

  usage_pattern:
    pre_check: "Skip API call if prompts are identical or >95% similar"
    cost: "$0.0003 per delta analysis with gpt-4o-mini"
    speed: "1-3 seconds per request"

undo_redo_implementation:
  documentation: PRPs/ai_docs/undo_redo_patterns.md

  recommended_library: "zundo"
  installation: "npm install zundo"
  size: "<700 bytes"

  architecture_pattern: "Hybrid Metadata + Blob Separation"

  metadata_store:
    middleware: "temporal() from zundo"
    tracks:
      - Scene metadata (prompts, status, config)
      - Version history metadata
      - Delta analysis results
    excludes:
      - Video blobs
      - FFmpeg instances
      - Large binary data
    configuration:
      limit: 50  # Maximum history depth
      partialize: "Exclude videoBlobs, concatenatedVideo, ffmpegInstance"

  blob_store:
    middleware: "None (separate store without temporal)"
    pattern: "Reference-based storage with blobId keys"
    cleanup: "URL.revokeObjectURL() on removal"
    memory_benefit: "10 segments × 50MB × 50 history = 25GB ❌"
    with_separation: "10 segments × 5KB metadata × 50 history = 2.5MB ✅"

  keyboard_shortcuts:
    undo: "Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)"
    redo: "Ctrl+Shift+Z or Cmd+Shift+Z"
    alternative_redo: "Ctrl+Y or Cmd+Y"

  api_usage:
    undo_function: "useSceneBuilderStore.temporal.getState().undo()"
    redo_function: "useSceneBuilderStore.temporal.getState().redo()"
    history_state: "useSceneBuilderStore.temporal(state => state.pastStates)"
    can_undo: "pastStates.length > 0"
    can_redo: "futureStates.length > 0"
```

### Code Patterns to Follow

```yaml
existing_patterns:
  zustand_store_creation:
    file: src/stores/videoStore.ts
    pattern: |
      import { create } from 'zustand';
      import { persist } from 'zustand/middleware';

      export const useVideoStore = create<VideoStoreState>()(
        persist(
          (set, get) => ({
            // State
            apiKey: null,
            segments: [],

            // Actions
            setApiKey: (key) => {
              set({ apiKey: key });
              storageService.saveApiKey(key);
            },
          }),
          {
            name: 'video-storage',
            partialize: (state) => ({ /* selective persistence */ })
          }
        )
      );

  edge_function_structure:
    file: api/proxy-create-video.ts
    key_patterns:
      - "export const config = { runtime: 'edge' };"
      - "Validate API key format (sk-proj- or sk-)"
      - "Handle both JSON and multipart/form-data"
      - "Return standardized error format"
      - "Include CORS headers in response"
    example_validation: |
      if (!apiKey?.startsWith('sk-')) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

  polling_with_progress:
    file: src/services/openaiService.ts lines 70-95
    pattern: |
      export async function pollVideoStatus(
        videoId: string,
        apiKey: string,
        onProgress?: (progress: number) => void
      ): Promise<VideoJob> {
        while (true) {
          const response = await fetch(`/api/proxy-get-status?id=${videoId}`, {
            headers: { 'x-api-key': apiKey }
          });

          const video: VideoJob = await response.json();

          if (video.progress && onProgress) {
            onProgress(video.progress);
          }

          if (video.status === 'completed' || video.status === 'failed') {
            return video;
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

  frame_extraction:
    file: src/utils/videoFrameExtractor.ts
    full_implementation: |
      export async function extractLastFrame(videoBlob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';

          video.onloadedmetadata = () => {
            video.currentTime = Math.max(0, video.duration - 0.1);
          };

          video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Failed to get canvas context'));
              return;
            }

            ctx.drawImage(video, 0, 0);

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to extract frame'));
                }
                URL.revokeObjectURL(video.src);
              },
              'image/jpeg',
              0.95
            );
          };

          video.onerror = () => {
            reject(new Error('Video load error'));
            URL.revokeObjectURL(video.src);
          };

          video.src = URL.createObjectURL(videoBlob);
        });
      }

  component_structure:
    example_file: src/components/VideoPlayer.tsx
    patterns:
      - Import types from src/types/index.ts
      - Use Zustand store with selective subscription
      - Cleanup object URLs in useEffect
      - Show loading/error states
      - Accessible UI with proper ARIA labels
    example: |
      import { useVideoStore } from '../stores/videoStore';
      import type { VideoSegment } from '../types';

      export function VideoPlayer({ segmentId }: { segmentId: string }) {
        const segment = useVideoStore(
          state => state.segments.find(s => s.id === segmentId)
        );

        useEffect(() => {
          if (segment?.videoUrl) {
            return () => URL.revokeObjectURL(segment.videoUrl);
          }
        }, [segment?.videoUrl]);

        if (!segment) return <div>Loading...</div>;
        if (segment.error) return <ErrorDisplay error={segment.error} />;

        return <video src={segment.videoUrl} controls />;
      }
```

### Naming Conventions

```yaml
file_naming:
  components: PascalCase (SceneBuilder.tsx, PromptEditor.tsx)
  services: camelCase (remixService.ts, deltaService.ts)
  stores: camelCase with 'Store' suffix (sceneBuilderStore.ts)
  api_routes: kebab-case with 'proxy-' prefix (proxy-remix-video.ts)
  utilities: camelCase (sceneHelpers.ts)

type_naming:
  interfaces: PascalCase (SceneVersion, PromptDelta)
  types: PascalCase (RemixConfig)
  enums: PascalCase with SCREAMING_SNAKE_CASE values

variable_naming:
  constants: SCREAMING_SNAKE_CASE (MAX_HISTORY_DEPTH)
  functions: camelCase (analyzePromptDelta, generateRemix)
  components: PascalCase (SceneBuilder, PromptEditor)
  hooks: camelCase with 'use' prefix (useSceneHistory, useRemix)

route_naming:
  pages: kebab-case (/scene-builder)
  api_endpoints: kebab-case (/api/proxy-remix-video)
```

---

## 3. IMPLEMENTATION TASKS

### Phase 1: Foundation & Types (2-4 hours)

#### Task 1.1: Create New Type Definitions
**File**: `src/types/index.ts`

```typescript
// Add these new types to existing file:

// Scene Builder - Version Control
export interface SceneVersion {
  id: string;                    // Unique version ID (e.g., "v1", "v2")
  openaiVideoId: string;         // OpenAI video_id for this version
  prompt: string;                // Full prompt text for this version
  videoBlob?: Blob;              // In-memory video (only for current session)
  videoBlobId?: string;          // Reference to blob store
  delta?: PromptDelta;           // Changes from previous version
  createdAt: number;             // Timestamp
  parentVersionId?: string;      // Previous version ID (for undo/redo)
  isApproved: boolean;           // User locked this version
}

// Scene Builder - Prompt Delta Analysis
export interface PromptDelta {
  summary: string;                          // One-sentence overview
  changes: Array<{
    category: 'visual_elements' | 'motion' | 'style' | 'technical';
    type: 'added' | 'removed' | 'modified';
    description: string;
    continuity_safe: boolean;
  }>;
  preserved: string[];                      // Unchanged elements
  remix_type: 'minor_tweak' | 'style_shift' | 'major_rewrite';
  warnings?: string[];                      // Continuity concerns
}

// Scene Builder - Scene State
export interface Scene {
  id: string;                     // Scene ID (e.g., "scene-1")
  versions: SceneVersion[];       // All remix iterations for this scene
  currentVersionId: string;       // Active version being viewed
  isLocked: boolean;              // User approved and moved to next scene
  initialConfig: GenerationConfig; // Original parameters (seconds, size, model)
}

// Scene Builder - Store State
export interface SceneBuilderState {
  // Current state
  scenes: Scene[];                // All scenes in composition
  currentSceneId: string | null;  // Active scene being edited
  editedPrompt: string;           // Prompt being edited (not yet analyzed)
  deltaAnalysis: PromptDelta | null; // Latest delta from GPT-4

  // Processing state
  isAnalyzingDelta: boolean;      // GPT-4 analysis in progress
  isRemixing: boolean;            // Video generation in progress
  remixProgress: number;          // 0-100
  error: string | null;

  // Actions
  createScene: (config: GenerationConfig) => Promise<void>;
  setEditedPrompt: (prompt: string) => void;
  analyzeDelta: () => Promise<void>;
  remixScene: () => Promise<void>;
  approveVersion: () => void;
  extendToNextScene: () => Promise<void>;

  // Version control (via Zundo temporal)
  // undo/redo provided by temporal middleware
}

// Scene Builder - Blob Store (Separate from history)
export interface BlobStoreState {
  blobs: Map<string, Blob>;
  addBlob: (id: string, blob: Blob) => void;
  getBlob: (id: string) => Blob | undefined;
  removeBlob: (id: string) => void;
  clear: () => void;
}
```

**Validation**:
- [ ] File compiles without errors
- [ ] All existing types remain unchanged
- [ ] New types imported successfully in test file

---

#### Task 1.2: Install Dependencies
**Command**: `npm install zundo`

**Validation**:
- [ ] package.json updated with zundo dependency
- [ ] node_modules/zundo exists
- [ ] No version conflicts with existing dependencies

---

### Phase 2: Backend - Edge Functions (4-6 hours)

#### Task 2.1: Create Remix Video Proxy
**File**: `api/proxy-remix-video.ts`

**Pattern to Follow**: `api/proxy-create-video.ts` (lines 15-75)

```typescript
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { apiKey, videoId, prompt, inputReference } = await req.json();

    // Validate API key
    if (!apiKey?.startsWith('sk-')) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate required fields
    if (!videoId || !prompt) {
      return new Response(
        JSON.stringify({ error: 'videoId and prompt are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build remix endpoint URL
    const remixUrl = `https://api.openai.com/v1/videos/${videoId}/remix`;

    let response;

    if (inputReference) {
      // Use FormData for input reference
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('input_reference', inputReference);

      response = await fetch(remixUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } else {
      // Use JSON for prompt only
      response = await fetch(remixUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
    }

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'Remix failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Remix error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

**Validation**:
- [ ] Edge function deploys successfully
- [ ] Handles both JSON and FormData
- [ ] Returns proper error messages
- [ ] API key validation works

---

#### Task 2.2: Create Prompt Delta Analysis Proxy
**File**: `api/proxy-prompt-delta.ts`

**Pattern to Follow**: `api/proxy-plan-prompts.ts`

```typescript
export const config = {
  runtime: 'edge',
};

const DELTA_SYSTEM_PROMPT = `
You are a video prompt comparison specialist for Sora 2 video generation.

Analyze the differences between two prompts and categorize changes by:
- Visual elements (subjects, environment, colors, lighting)
- Motion (camera movement, subject actions)
- Style (mood, cinematography, atmosphere)
- Technical (framing, composition, timing)

Output JSON:
{
  "summary": "Brief overview of changes",
  "changes": [
    {
      "category": "visual_elements|motion|style|technical",
      "type": "added|removed|modified",
      "description": "Specific change description",
      "continuity_safe": true|false
    }
  ],
  "preserved": ["Elements that stayed the same"],
  "remix_type": "minor_tweak|style_shift|major_rewrite",
  "warnings": ["Any continuity concerns"]
}

Focus on semantic differences that affect visual output, not linguistic variations.
`.trim();

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { apiKey, originalPrompt, newPrompt } = await req.json();

    if (!apiKey?.startsWith('sk-')) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Pre-check: identical prompts
    if (originalPrompt === newPrompt) {
      return new Response(JSON.stringify({
        summary: 'No changes detected',
        changes: [],
        preserved: [originalPrompt],
        remix_type: 'identical',
        warnings: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call OpenAI for delta analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DELTA_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `ORIGINAL PROMPT:\n${originalPrompt}\n\nNEW PROMPT:\n${newPrompt}`
          }
        ],
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return new Response(
        JSON.stringify({ error: error.error?.message || 'Delta analysis failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const deltaContent = data.choices[0]?.message?.content || '{}';
    const delta = JSON.parse(deltaContent);

    // Add continuity recommendations
    const hasBreakingChanges = delta.changes?.some((c: any) => !c.continuity_safe);

    return new Response(JSON.stringify({
      ...delta,
      recommendations: {
        use_input_reference: delta.remix_type !== 'major_rewrite',
        show_warning: hasBreakingChanges
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Delta extraction error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

**Validation**:
- [ ] Edge function deploys successfully
- [ ] Returns valid JSON matching PromptDelta type
- [ ] Handles identical prompts without API call
- [ ] Temperature=0 produces consistent results

---

### Phase 3: Services Layer (6-8 hours)

#### Task 3.1: Create Remix Service
**File**: `src/services/remixService.ts`

**Reuse Pattern**: `src/services/openaiService.ts`

```typescript
import type { VideoJob, PromptDelta, SceneVersion } from '../types';

/**
 * Analyze delta between original and new prompt
 * Uses GPT-4o-mini for cost-effective analysis (~$0.0003 per call)
 */
export async function analyzePromptDelta(
  originalPrompt: string,
  newPrompt: string,
  apiKey: string
): Promise<PromptDelta> {
  const response = await fetch('/api/proxy-prompt-delta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, originalPrompt, newPrompt })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Delta analysis failed');
  }

  return response.json();
}

/**
 * Create remix of existing video using delta prompt
 * Reuses polling pattern from openaiService.ts
 */
export async function createRemix(
  videoId: string,
  deltaPrompt: string,
  apiKey: string,
  inputReference?: Blob,
  onProgress?: (progress: number) => void
): Promise<VideoJob> {
  // Start remix job
  const response = await fetch('/api/proxy-remix-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      videoId,
      prompt: deltaPrompt,
      inputReference
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Remix creation failed');
  }

  const job: VideoJob = await response.json();

  // Poll for completion using existing pattern
  return pollVideoStatus(job.id, apiKey, onProgress);
}

/**
 * Poll video status (reuse from openaiService.ts)
 */
async function pollVideoStatus(
  videoId: string,
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<VideoJob> {
  while (true) {
    const response = await fetch(`/api/proxy-get-status?id=${videoId}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) {
      throw new Error('Status check failed');
    }

    const video: VideoJob = await response.json();

    if (video.progress && onProgress) {
      onProgress(video.progress);
    }

    if (video.status === 'completed' || video.status === 'failed') {
      return video;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Download completed video (reuse from openaiService.ts)
 */
export async function downloadVideo(
  videoId: string,
  apiKey: string
): Promise<Blob> {
  const response = await fetch(
    `https://api.openai.com/v1/videos/${videoId}/content?variant=video`,
    {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }
  );

  if (!response.ok) {
    throw new Error('Video download failed');
  }

  return response.blob();
}

/**
 * Check if video is still available for remix (24-hour window)
 */
export function isVideoExpiredForRemix(createdAt: number): boolean {
  const expiresAt = createdAt + (24 * 60 * 60 * 1000);
  return Date.now() > expiresAt;
}

/**
 * Get time remaining before video expires
 */
export function getTimeRemaining(createdAt: number): string {
  const expiresAt = createdAt + (24 * 60 * 60 * 1000);
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) return 'Expired';

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
```

**Validation**:
- [ ] All functions compile without errors
- [ ] Types imported correctly
- [ ] Polling pattern matches openaiService.ts
- [ ] Error handling consistent with project patterns

---

#### Task 3.2: Create Scene Builder Store
**File**: `src/stores/sceneBuilderStore.ts`

**Pattern to Follow**: `src/stores/videoStore.ts` + Zundo temporal middleware

```typescript
import { create } from 'zustand';
import { temporal } from 'zundo';
import { persist } from 'zustand/middleware';
import type { Scene, SceneVersion, PromptDelta, GenerationConfig, SceneBuilderState } from '../types';
import { createVideo } from '../services/openaiService';
import { analyzePromptDelta, createRemix, downloadVideo } from '../services/remixService';
import { extractLastFrame } from '../utils/videoFrameExtractor';
import { storageService } from '../services/storageService';
import { useBlobStore } from './blobStore';

export const useSceneBuilderStore = create<SceneBuilderState>()(
  temporal(
    persist(
      (set, get) => ({
        // State
        scenes: [],
        currentSceneId: null,
        editedPrompt: '',
        deltaAnalysis: null,
        isAnalyzingDelta: false,
        isRemixing: false,
        remixProgress: 0,
        error: null,

        // Create first scene from initial prompt
        createScene: async (config: GenerationConfig) => {
          const apiKey = storageService.getApiKey();
          if (!apiKey) {
            set({ error: 'API key not found' });
            return;
          }

          const sceneId = `scene-${Date.now()}`;
          const versionId = `v1`;

          try {
            set({ isRemixing: true, error: null, remixProgress: 0 });

            // Create initial video (no remix)
            const job = await createVideo(
              apiKey,
              config.prompt,
              config.seconds.toString(),
              config.size,
              config.model,
              undefined, // No remixedFromVideoId
              undefined, // No inputReference
              (progress) => set({ remixProgress: progress })
            );

            if (job.status === 'failed') {
              throw new Error(job.error?.message || 'Video generation failed');
            }

            // Download video
            const blob = await downloadVideo(job.id, apiKey);
            const blobId = `blob-${Date.now()}`;
            useBlobStore.getState().addBlob(blobId, blob);

            // Create scene and version
            const version: SceneVersion = {
              id: versionId,
              openaiVideoId: job.id,
              prompt: config.prompt,
              videoBlobId: blobId,
              createdAt: Date.now(),
              isApproved: false,
            };

            const scene: Scene = {
              id: sceneId,
              versions: [version],
              currentVersionId: versionId,
              isLocked: false,
              initialConfig: config,
            };

            set({
              scenes: [scene],
              currentSceneId: sceneId,
              editedPrompt: config.prompt,
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

        // Update prompt being edited (no API call yet)
        setEditedPrompt: (prompt: string) => {
          set({ editedPrompt: prompt, deltaAnalysis: null });
        },

        // Analyze delta between current version and edited prompt
        analyzeDelta: async () => {
          const { currentSceneId, scenes, editedPrompt } = get();
          const apiKey = storageService.getApiKey();

          if (!apiKey || !currentSceneId) return;

          const scene = scenes.find(s => s.id === currentSceneId);
          if (!scene) return;

          const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
          if (!currentVersion) return;

          try {
            set({ isAnalyzingDelta: true, error: null });

            const delta = await analyzePromptDelta(
              currentVersion.prompt,
              editedPrompt,
              apiKey
            );

            set({ deltaAnalysis: delta, isAnalyzingDelta: false });

          } catch (error: any) {
            set({ error: error.message, isAnalyzingDelta: false });
          }
        },

        // Remix current scene with edited prompt
        remixScene: async () => {
          const { currentSceneId, scenes, editedPrompt, deltaAnalysis } = get();
          const apiKey = storageService.getApiKey();

          if (!apiKey || !currentSceneId || !deltaAnalysis) return;

          const scene = scenes.find(s => s.id === currentSceneId);
          if (!scene) return;

          const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
          if (!currentVersion) return;

          try {
            set({ isRemixing: true, error: null, remixProgress: 0 });

            // Use delta summary as remix prompt
            const remixPrompt = deltaAnalysis.summary;

            // Create remix
            const job = await createRemix(
              currentVersion.openaiVideoId,
              remixPrompt,
              apiKey,
              undefined, // No input reference for remix within same scene
              (progress) => set({ remixProgress: progress })
            );

            if (job.status === 'failed') {
              throw new Error(job.error?.message || 'Remix failed');
            }

            // Download remixed video
            const blob = await downloadVideo(job.id, apiKey);
            const blobId = `blob-${Date.now()}`;
            useBlobStore.getState().addBlob(blobId, blob);

            // Create new version
            const newVersionId = `v${scene.versions.length + 1}`;
            const newVersion: SceneVersion = {
              id: newVersionId,
              openaiVideoId: job.id,
              prompt: editedPrompt,
              videoBlobId: blobId,
              delta: deltaAnalysis,
              createdAt: Date.now(),
              parentVersionId: currentVersion.id,
              isApproved: false,
            };

            // Update scene
            set((state) => ({
              scenes: state.scenes.map(s =>
                s.id === currentSceneId
                  ? {
                      ...s,
                      versions: [...s.versions, newVersion],
                      currentVersionId: newVersionId,
                    }
                  : s
              ),
              deltaAnalysis: null,
              isRemixing: false,
              remixProgress: 0,
            }));

          } catch (error: any) {
            set({ error: error.message, isRemixing: false, remixProgress: 0 });
          }
        },

        // Approve current version and lock scene
        approveVersion: () => {
          const { currentSceneId, scenes } = get();
          if (!currentSceneId) return;

          set((state) => ({
            scenes: state.scenes.map(s =>
              s.id === currentSceneId
                ? {
                    ...s,
                    isLocked: true,
                    versions: s.versions.map(v =>
                      v.id === s.currentVersionId
                        ? { ...v, isApproved: true }
                        : v
                    ),
                  }
                : s
            ),
          }));
        },

        // Extend approved scene to next scene with frame continuity
        extendToNextScene: async () => {
          const { currentSceneId, scenes } = get();
          const apiKey = storageService.getApiKey();

          if (!apiKey || !currentSceneId) return;

          const currentScene = scenes.find(s => s.id === currentSceneId);
          if (!currentScene || !currentScene.isLocked) return;

          const currentVersion = currentScene.versions.find(
            v => v.id === currentScene.currentVersionId
          );
          if (!currentVersion?.videoBlobId) return;

          try {
            set({ isRemixing: true, error: null, remixProgress: 0 });

            // Extract last frame from current scene
            const currentBlob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
            if (!currentBlob) throw new Error('Video blob not found');

            const lastFrame = await extractLastFrame(currentBlob);

            // Prompt user for next scene prompt
            const nextPrompt = prompt('Enter prompt for next scene:');
            if (!nextPrompt) {
              set({ isRemixing: false });
              return;
            }

            // Create next scene with frame continuity
            const job = await createVideo(
              apiKey,
              nextPrompt,
              currentScene.initialConfig.seconds.toString(),
              currentScene.initialConfig.size,
              currentScene.initialConfig.model,
              undefined,
              lastFrame, // Frame continuity
              (progress) => set({ remixProgress: progress })
            );

            if (job.status === 'failed') {
              throw new Error(job.error?.message || 'Video generation failed');
            }

            // Download video
            const blob = await downloadVideo(job.id, apiKey);
            const blobId = `blob-${Date.now()}`;
            useBlobStore.getState().addBlob(blobId, blob);

            // Create new scene
            const newSceneId = `scene-${Date.now()}`;
            const newVersion: SceneVersion = {
              id: 'v1',
              openaiVideoId: job.id,
              prompt: nextPrompt,
              videoBlobId: blobId,
              createdAt: Date.now(),
              isApproved: false,
            };

            const newScene: Scene = {
              id: newSceneId,
              versions: [newVersion],
              currentVersionId: 'v1',
              isLocked: false,
              initialConfig: currentScene.initialConfig,
            };

            set((state) => ({
              scenes: [...state.scenes, newScene],
              currentSceneId: newSceneId,
              editedPrompt: nextPrompt,
              isRemixing: false,
              remixProgress: 0,
            }));

          } catch (error: any) {
            set({ error: error.message, isRemixing: false, remixProgress: 0 });
          }
        },
      }),
      {
        name: 'scene-builder-storage',
        partialize: (state) => ({
          // Only persist metadata, not blobs
          scenes: state.scenes.map(scene => ({
            ...scene,
            versions: scene.versions.map(v => ({
              ...v,
              videoBlob: undefined, // Exclude blob
            })),
          })),
          currentSceneId: state.currentSceneId,
        }),
      }
    ),
    {
      // Zundo configuration
      limit: 50,
      partialize: (state) => ({
        // Track these in history
        scenes: state.scenes,
        currentSceneId: state.currentSceneId,
        editedPrompt: state.editedPrompt,

        // Exclude these from history
        // isRemixing, remixProgress, error (ephemeral UI state)
      }),
    }
  )
);
```

**Validation**:
- [ ] Store compiles without errors
- [ ] Temporal middleware applied correctly
- [ ] Partialize excludes video blobs
- [ ] All actions update state correctly

---

#### Task 3.3: Create Blob Store (Separate from History)
**File**: `src/stores/blobStore.ts`

```typescript
import { create } from 'zustand';
import type { BlobStoreState } from '../types';

/**
 * Separate blob storage without undo/redo tracking
 * Memory efficient: blobs not duplicated in history
 */
export const useBlobStore = create<BlobStoreState>((set, get) => ({
  blobs: new Map(),

  addBlob: (id, blob) => set((state) => {
    const newBlobs = new Map(state.blobs);
    newBlobs.set(id, blob);
    return { blobs: newBlobs };
  }),

  getBlob: (id) => get().blobs.get(id),

  removeBlob: (id) => set((state) => {
    const newBlobs = new Map(state.blobs);
    const blob = state.blobs.get(id);

    // Revoke object URL to free memory
    if (blob) {
      const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(url);
    }

    newBlobs.delete(id);
    return { blobs: newBlobs };
  }),

  clear: () => set((state) => {
    // Revoke all object URLs
    state.blobs.forEach(blob => {
      const url = URL.createObjectURL(blob);
      URL.revokeObjectURL(url);
    });

    return { blobs: new Map() };
  }),
}));
```

**Validation**:
- [ ] Store compiles without errors
- [ ] No temporal middleware applied
- [ ] Object URLs revoked on removal

---

### Phase 4: UI Components (10-14 hours)

#### Task 4.1: Create Scene Builder Main Page
**File**: `src/pages/SceneBuilder.tsx`

**Pattern**: Similar to existing `src/App.tsx` structure

```typescript
import { useEffect } from 'react';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { SceneCanvas } from '../components/scene-builder/SceneCanvas';
import { PromptEditor } from '../components/scene-builder/PromptEditor';
import { DeltaDisplay } from '../components/scene-builder/DeltaDisplay';
import { VersionControls } from '../components/scene-builder/VersionControls';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export function SceneBuilder() {
  const { error, currentSceneId } = useSceneBuilderStore();

  // Set up undo/redo keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="scene-builder">
      <header>
        <h1>Scene Builder</h1>
        <ApiKeyInput />
        <VersionControls />
      </header>

      {error && <ErrorDisplay error={error} />}

      {!currentSceneId ? (
        <InitialSceneForm />
      ) : (
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
}

function InitialSceneForm() {
  const { createScene } = useSceneBuilderStore();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    await createScene({
      prompt: formData.get('prompt') as string,
      seconds: Number(formData.get('seconds')),
      size: formData.get('size') as string,
      model: 'sora-2',
      numSegments: 1,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="initial-scene-form">
      <h2>Create Your First Scene</h2>

      <label>
        Prompt
        <textarea
          name="prompt"
          required
          placeholder="Describe your scene..."
          rows={4}
        />
      </label>

      <label>
        Duration
        <select name="seconds" required>
          <option value="4">4 seconds</option>
          <option value="8">8 seconds</option>
          <option value="12">12 seconds</option>
        </select>
      </label>

      <label>
        Size
        <select name="size" required>
          <option value="1280x720">Landscape (1280x720)</option>
          <option value="1792x1024">Landscape Wide (1792x1024)</option>
          <option value="720x1280">Portrait (720x1280)</option>
          <option value="1024x1792">Portrait Tall (1024x1792)</option>
        </select>
      </label>

      <button type="submit">Generate First Scene</button>
    </form>
  );
}
```

**Validation**:
- [ ] Component renders without errors
- [ ] Form submission triggers createScene
- [ ] Error display works

---

#### Task 4.2: Create Scene Canvas Component (Video Player)
**File**: `src/components/scene-builder/SceneCanvas.tsx`

**Reuse**: `src/components/VideoPlayer.tsx` pattern

```typescript
import { useEffect, useState } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { useBlobStore } from '../../stores/blobStore';

export function SceneCanvas() {
  const { scenes, currentSceneId, isRemixing, remixProgress } = useSceneBuilderStore();
  const getBlob = useBlobStore(state => state.getBlob);

  const [videoUrl, setVideoUrl] = useState<string>();

  const currentScene = scenes.find(s => s.id === currentSceneId);
  const currentVersion = currentScene?.versions.find(
    v => v.id === currentScene.currentVersionId
  );

  useEffect(() => {
    if (currentVersion?.videoBlobId) {
      const blob = getBlob(currentVersion.videoBlobId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [currentVersion?.videoBlobId, getBlob]);

  if (isRemixing) {
    return (
      <div className="scene-canvas loading">
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${remixProgress}%` }} />
          <p>Generating remix... {remixProgress}%</p>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return <div className="scene-canvas empty">No video loaded</div>;
  }

  return (
    <div className="scene-canvas">
      <video
        src={videoUrl}
        controls
        loop
        autoPlay
        muted
        className="scene-video"
      />

      <div className="scene-metadata">
        <p>Scene: {currentScene?.id}</p>
        <p>Version: {currentVersion?.id}</p>
        <p>Duration: {currentScene?.initialConfig.seconds}s</p>
      </div>
    </div>
  );
}
```

**Validation**:
- [ ] Video displays correctly
- [ ] Loading state shows progress
- [ ] Object URLs cleaned up

---

#### Task 4.3: Create Prompt Editor Component
**File**: `src/components/scene-builder/PromptEditor.tsx`

```typescript
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export function PromptEditor() {
  const {
    scenes,
    currentSceneId,
    editedPrompt,
    deltaAnalysis,
    isAnalyzingDelta,
    isRemixing,
    setEditedPrompt,
    analyzeDelta,
    remixScene,
    approveVersion,
    extendToNextScene,
  } = useSceneBuilderStore();

  const currentScene = scenes.find(s => s.id === currentSceneId);
  const currentVersion = currentScene?.versions.find(
    v => v.id === currentScene.currentVersionId
  );

  const handleAnalyze = async () => {
    await analyzeDelta();
  };

  const handleRemix = async () => {
    await remixScene();
  };

  const handleApprove = () => {
    approveVersion();
  };

  const handleExtend = async () => {
    await extendToNextScene();
  };

  const hasChanges = editedPrompt !== currentVersion?.prompt;

  return (
    <div className="prompt-editor">
      <h3>Edit Prompt</h3>

      <textarea
        value={editedPrompt}
        onChange={(e) => setEditedPrompt(e.target.value)}
        placeholder="Modify your prompt..."
        rows={8}
        className="prompt-textarea"
        disabled={currentScene?.isLocked || isRemixing}
      />

      <div className="action-buttons">
        {!currentScene?.isLocked && (
          <>
            <button
              onClick={handleAnalyze}
              disabled={!hasChanges || isAnalyzingDelta || isRemixing}
              className="analyze-button"
            >
              {isAnalyzingDelta ? 'Analyzing...' : 'Analyze Changes'}
            </button>

            <button
              onClick={handleRemix}
              disabled={!deltaAnalysis || isRemixing}
              className="remix-button primary"
            >
              {isRemixing ? 'Remixing...' : 'Remix Scene'}
            </button>

            <button
              onClick={handleApprove}
              disabled={isRemixing}
              className="approve-button success"
            >
              Approve Version
            </button>
          </>
        )}

        {currentScene?.isLocked && (
          <button
            onClick={handleExtend}
            disabled={isRemixing}
            className="extend-button primary"
          >
            Extend to Next Scene
          </button>
        )}
      </div>

      {currentScene?.isLocked && (
        <div className="locked-notice">
          ✓ Scene approved and locked. Ready to extend to next scene.
        </div>
      )}
    </div>
  );
}
```

**Validation**:
- [ ] Textarea updates editedPrompt state
- [ ] Buttons disabled appropriately
- [ ] Locked state shows correct UI

---

#### Task 4.4: Create Delta Display Component
**File**: `src/components/scene-builder/DeltaDisplay.tsx`

```typescript
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export function DeltaDisplay() {
  const { deltaAnalysis } = useSceneBuilderStore();

  if (!deltaAnalysis) return null;

  return (
    <div className="delta-display">
      <h3>Proposed Changes</h3>

      <div className="delta-summary">
        <p><strong>Summary:</strong> {deltaAnalysis.summary}</p>
        <span className={`remix-type ${deltaAnalysis.remix_type}`}>
          {deltaAnalysis.remix_type.replace('_', ' ')}
        </span>
      </div>

      {deltaAnalysis.changes.length > 0 && (
        <div className="delta-changes">
          <h4>Changes:</h4>
          <ul>
            {deltaAnalysis.changes.map((change, i) => (
              <li key={i} className={`change-item ${change.type}`}>
                <span className="change-category">{change.category}:</span>
                <span className="change-description">{change.description}</span>
                {!change.continuity_safe && (
                  <span className="warning-badge">⚠️ May affect continuity</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {deltaAnalysis.preserved.length > 0 && (
        <div className="delta-preserved">
          <h4>Preserved:</h4>
          <p>{deltaAnalysis.preserved.join(', ')}</p>
        </div>
      )}

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
    </div>
  );
}
```

**Validation**:
- [ ] Displays delta analysis correctly
- [ ] Warnings highlighted
- [ ] Hidden when no delta

---

#### Task 4.5: Create Version Controls Component (Undo/Redo)
**File**: `src/components/scene-builder/VersionControls.tsx`

**Pattern**: Based on `PRPs/ai_docs/undo_redo_patterns.md` section 5

```typescript
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { TemporalState } from 'zundo';

function useTemporalStore<T>(
  selector: (state: TemporalState<any>) => T,
  equality?: (a: T, b: T) => boolean,
) {
  return useStoreWithEqualityFn(
    useSceneBuilderStore.temporal,
    selector,
    equality
  );
}

export function VersionControls() {
  const { undo, redo, pastStates, futureStates } = useTemporalStore(
    (state) => state
  );

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  return (
    <div className="version-controls">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="undo-button"
      >
        ← Undo
      </button>

      <span className="history-count">
        {pastStates.length} / {futureStates.length}
      </span>

      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="redo-button"
      >
        Redo →
      </button>
    </div>
  );
}
```

**Validation**:
- [ ] Buttons disabled when appropriate
- [ ] History count displays correctly
- [ ] Clicking undo/redo updates state

---

#### Task 4.6: Create Keyboard Shortcuts Hook
**File**: `src/hooks/useKeyboardShortcuts.ts`

**Pattern**: Based on `PRPs/ai_docs/undo_redo_patterns.md` section 5

```typescript
import { useEffect } from 'react';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl+Z
      if (ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        const { undo } = useSceneBuilderStore.temporal.getState();
        undo();
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      else if (
        (ctrlKey && e.shiftKey && e.key === 'z') ||
        (ctrlKey && e.key === 'y')
      ) {
        e.preventDefault();
        const { redo } = useSceneBuilderStore.temporal.getState();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

**Validation**:
- [ ] Ctrl+Z triggers undo
- [ ] Ctrl+Shift+Z triggers redo
- [ ] Ctrl+Y triggers redo
- [ ] Works on both Mac and Windows

---

### Phase 5: Routing & Integration (2-4 hours)

#### Task 5.1: Add Scene Builder Route
**File**: Update `src/App.tsx` or `src/main.tsx` (depending on routing setup)

**Check Current Routing**: Determine if project uses React Router or simple conditional rendering

**If using React Router**:
```typescript
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';  // Existing multi-segment generator
import { SceneBuilder } from './pages/SceneBuilder';

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Multi-Segment Generator</Link>
        <Link to="/scene-builder">Scene Builder</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scene-builder" element={<SceneBuilder />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**If not using React Router**:
```typescript
// Install React Router first
// npm install react-router-dom
```

**Validation**:
- [ ] `/scene-builder` route accessible
- [ ] Navigation between routes works
- [ ] Both routes maintain separate state

---

#### Task 5.2: Add Navigation UI
**File**: Create `src/components/Navigation.tsx`

```typescript
import { Link, useLocation } from 'react-router-dom';

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="main-nav">
      <div className="nav-brand">
        <h1>Sora Video Generator</h1>
      </div>

      <ul className="nav-links">
        <li>
          <Link
            to="/"
            className={location.pathname === '/' ? 'active' : ''}
          >
            Multi-Segment Generator
          </Link>
        </li>
        <li>
          <Link
            to="/scene-builder"
            className={location.pathname === '/scene-builder' ? 'active' : ''}
          >
            Scene Builder
          </Link>
        </li>
      </ul>
    </nav>
  );
}
```

**Validation**:
- [ ] Navigation visible on all pages
- [ ] Active route highlighted
- [ ] Links work correctly

---

### Phase 6: Styling (4-6 hours)

#### Task 6.1: Create Scene Builder Styles
**File**: `src/styles/scene-builder.css`

**Pattern**: Follow existing CSS patterns in `src/` (check for CSS modules or global styles)

```css
/* Scene Builder Layout */
.scene-builder {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.scene-builder header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
}

/* Split View */
.split-view {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  height: calc(100vh - 80px);
  overflow: hidden;
}

.left-panel, .right-panel {
  overflow-y: auto;
  padding: 2rem;
}

.left-panel {
  border-right: 1px solid #e0e0e0;
  background: #f9f9f9;
}

/* Scene Canvas */
.scene-canvas {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.scene-canvas.loading {
  justify-content: center;
  min-height: 400px;
}

.scene-video {
  width: 100%;
  max-width: 720px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.scene-metadata {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

/* Progress Bar */
.progress-container {
  width: 100%;
  max-width: 400px;
}

.progress-bar {
  height: 8px;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Prompt Editor */
.prompt-editor {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.prompt-textarea {
  width: 100%;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: inherit;
  font-size: 1rem;
  resize: vertical;
  min-height: 120px;
}

.prompt-textarea:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
}

.action-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.analyze-button {
  background: #2196F3;
  color: white;
}

.remix-button.primary {
  background: #4CAF50;
  color: white;
}

.approve-button.success {
  background: #8BC34A;
  color: white;
}

.extend-button.primary {
  background: #FF9800;
  color: white;
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.locked-notice {
  padding: 1rem;
  background: #E8F5E9;
  border-left: 4px solid #4CAF50;
  border-radius: 4px;
  color: #2E7D32;
}

/* Delta Display */
.delta-display {
  padding: 1.5rem;
  background: #FFF9C4;
  border-radius: 8px;
  border: 1px solid #FDD835;
}

.delta-summary {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1rem;
}

.remix-type {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
}

.remix-type.minor_tweak {
  background: #C8E6C9;
  color: #2E7D32;
}

.remix-type.style_shift {
  background: #FFE082;
  color: #F57C00;
}

.remix-type.major_rewrite {
  background: #FFCDD2;
  color: #C62828;
}

.delta-changes ul {
  list-style: none;
  padding: 0;
}

.change-item {
  padding: 0.75rem;
  margin: 0.5rem 0;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #4CAF50;
}

.change-item.added {
  border-left-color: #4CAF50;
}

.change-item.removed {
  border-left-color: #F44336;
}

.change-item.modified {
  border-left-color: #FF9800;
}

.change-category {
  font-weight: 600;
  margin-right: 0.5rem;
  text-transform: capitalize;
}

.warning-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #FFEBEE;
  color: #C62828;
  border-radius: 4px;
  font-size: 0.8rem;
}

.delta-warnings {
  margin-top: 1rem;
  padding: 1rem;
  background: #FFEBEE;
  border-radius: 4px;
  border-left: 4px solid #F44336;
}

/* Version Controls */
.version-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.undo-button, .redo-button {
  padding: 0.5rem 1rem;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.undo-button:hover:not(:disabled),
.redo-button:hover:not(:disabled) {
  background: #f5f5f5;
  border-color: #999;
}

.history-count {
  font-size: 0.85rem;
  color: #666;
  padding: 0 0.5rem;
}

/* Initial Scene Form */
.initial-scene-form {
  max-width: 600px;
  margin: 4rem auto;
  padding: 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.initial-scene-form h2 {
  margin-bottom: 2rem;
  color: #333;
}

.initial-scene-form label {
  display: block;
  margin-bottom: 1.5rem;
  font-weight: 500;
  color: #555;
}

.initial-scene-form input,
.initial-scene-form select,
.initial-scene-form textarea {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
}

.initial-scene-form button[type="submit"] {
  width: 100%;
  background: #4CAF50;
  color: white;
  padding: 1rem;
  margin-top: 1rem;
}

/* Responsive */
@media (max-width: 968px) {
  .split-view {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .left-panel {
    border-right: none;
    border-bottom: 1px solid #e0e0e0;
  }
}
```

**Validation**:
- [ ] Split view renders correctly
- [ ] Responsive on smaller screens
- [ ] Matches existing app design language

---

### Phase 7: Testing & Validation (4-6 hours)

#### Task 7.1: Manual Testing Checklist

**Test 1: Initial Scene Creation**
- [ ] Navigate to `/scene-builder`
- [ ] Enter API key
- [ ] Fill initial scene form
- [ ] Click "Generate First Scene"
- [ ] Video loads and plays correctly
- [ ] Prompt appears in editor

**Test 2: Prompt Delta Analysis**
- [ ] Edit prompt text
- [ ] Click "Analyze Changes"
- [ ] Delta display shows summary
- [ ] Changes categorized correctly
- [ ] Warnings shown if applicable

**Test 3: Remix Generation**
- [ ] Click "Remix Scene" after analysis
- [ ] Progress bar shows
- [ ] New version loads
- [ ] Previous version accessible via undo

**Test 4: Undo/Redo**
- [ ] Press Ctrl+Z (or Cmd+Z)
- [ ] Previous version restores
- [ ] Press Ctrl+Shift+Z
- [ ] Next version restores
- [ ] Button states update correctly

**Test 5: Scene Approval & Extension**
- [ ] Click "Approve Version"
- [ ] Scene locks (editor disabled)
- [ ] Click "Extend to Next Scene"
- [ ] Last frame extracted
- [ ] Next scene prompt requested
- [ ] New scene generates with frame continuity

**Test 6: Memory Management**
- [ ] Generate 5+ versions
- [ ] Undo/redo through history
- [ ] Check browser memory (DevTools Performance tab)
- [ ] Verify blobs not duplicated
- [ ] Object URLs revoked properly

**Test 7: Error Handling**
- [ ] Invalid API key shows error
- [ ] Network failure shows error
- [ ] Expired video ID handled (24-hour limit)
- [ ] Empty prompt rejected

**Test 8: State Persistence**
- [ ] Refresh page
- [ ] Scene metadata persists (localStorage)
- [ ] Video blobs lost (expected - sessionStorage)
- [ ] API key persists (sessionStorage)

---

## 4. VALIDATION GATES

### Pre-Implementation Validation

**Gate 1: Dependencies Installed**
```bash
npm install zundo
npm run build  # Verify no errors
```
- [ ] Zundo installed
- [ ] Project compiles
- [ ] No version conflicts

---

### Development Validation (Per Phase)

**Gate 2: Types Compile**
```bash
npm run type-check  # or tsc --noEmit
```
- [ ] All new types valid
- [ ] No TypeScript errors
- [ ] Types exported correctly

**Gate 3: Edge Functions Deploy**
```bash
vercel --prod  # or vercel dev for local testing
```
- [ ] Both proxy endpoints accessible
- [ ] CORS headers correct
- [ ] Error handling works

**Gate 4: Services Test**
```bash
# Manual testing via browser console
import { analyzePromptDelta } from './services/remixService';
await analyzePromptDelta('original', 'new', 'api-key');
```
- [ ] Delta analysis returns valid JSON
- [ ] Remix service creates job
- [ ] Polling completes successfully

**Gate 5: Stores Test**
```bash
# Manual testing via browser console
useSceneBuilderStore.getState().createScene(config);
```
- [ ] State updates correctly
- [ ] Temporal middleware works
- [ ] Blobs stored separately

**Gate 6: Components Render**
```bash
npm run dev:vercel
# Navigate to /scene-builder
```
- [ ] No console errors
- [ ] Split view renders
- [ ] Forms functional

---

### Final Validation

**Gate 7: Full Feature Test**

Follow Task 7.1 Manual Testing Checklist (all checkboxes must pass)

**Gate 8: Performance Validation**
```bash
# Chrome DevTools > Performance > Record
# Generate 5 versions, undo/redo 10 times
```
- [ ] Memory usage < 2GB
- [ ] No memory leaks detected
- [ ] Frame rates stable (60fps)

**Gate 9: Browser Compatibility**
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Gate 10: Accessibility**
```bash
# Chrome DevTools > Lighthouse > Accessibility
```
- [ ] Score > 90
- [ ] Keyboard navigation works
- [ ] Screen reader compatible

---

## 5. ROLLBACK PLAN

If implementation fails or major issues arise:

### Step 1: Isolate Scene Builder Code
All Scene Builder code is in these locations:
- `src/pages/SceneBuilder.tsx`
- `src/components/scene-builder/*`
- `src/stores/sceneBuilderStore.ts`
- `src/stores/blobStore.ts`
- `src/services/remixService.ts`
- `api/proxy-remix-video.ts`
- `api/proxy-prompt-delta.ts`
- `src/styles/scene-builder.css`

### Step 2: Remove Route
Comment out Scene Builder route in routing file:
```typescript
// <Route path="/scene-builder" element={<SceneBuilder />} />
```

### Step 3: Remove Dependencies
```bash
npm uninstall zundo
```

### Step 4: Verify Core App Still Works
- [ ] Multi-segment generator still functional
- [ ] No console errors
- [ ] All existing features work

---

## 6. KNOWN LIMITATIONS & FUTURE ENHANCEMENTS

### Current Limitations
1. **24-Hour Remix Window**: Videos expire after 24 hours (OpenAI limitation)
2. **Memory Constraints**: Desktop browsers recommended for multiple versions
3. **No Persistence**: Video blobs lost on page refresh (intentional for privacy)
4. **Sequential Scenes**: Cannot edit earlier scenes after extending

### Future Enhancements
1. **Scene Timeline UI**: Visual timeline showing all scenes side-by-side
2. **Batch Export**: Export all scenes as single video
3. **Cloud Storage Integration**: Optional video persistence
4. **Collaborative Editing**: Share scene builder projects
5. **AI Suggestions**: GPT-4 suggests prompt improvements

---

## 7. SUCCESS METRICS

**Implementation Success**:
- All 10 Validation Gates pass
- Zero TypeScript errors
- Zero console errors in production build
- All manual test cases pass

**User Experience Success**:
- Scene creation < 60 seconds (dependent on OpenAI)
- Delta analysis < 3 seconds
- Undo/redo instant (<100ms)
- Memory usage stays < 2GB for 10 versions

**Code Quality Success**:
- All types explicitly defined
- All functions documented
- Consistent naming conventions
- No dead code or unused imports

---

## 8. IMPLEMENTATION TIMELINE

**Estimated Total Time**: 32-48 hours (4-6 days full-time)

| Phase | Time | Dependencies |
|-------|------|--------------|
| Phase 1: Foundation | 2-4h | None |
| Phase 2: Edge Functions | 4-6h | Phase 1 |
| Phase 3: Services | 6-8h | Phase 1, 2 |
| Phase 4: UI Components | 10-14h | Phase 1, 3 |
| Phase 5: Routing | 2-4h | Phase 4 |
| Phase 6: Styling | 4-6h | Phase 4, 5 |
| Phase 7: Testing | 4-6h | All phases |

**Recommended Approach**: Complete phases sequentially. Test each phase before proceeding.

---

## 9. CONFIDENCE SCORE JUSTIFICATION

**9/10 Confidence for One-Pass Implementation Success**

**Strengths (+)**:
- ✅ Complete API documentation available (Sora Remix, GPT-4 Delta)
- ✅ Existing codebase patterns well-documented (polling, frame extraction, Edge Functions)
- ✅ Clear reusable services and components identified
- ✅ Undo/redo implementation guide with working examples
- ✅ All types explicitly defined with validation
- ✅ Step-by-step tasks with dependency ordering
- ✅ Comprehensive validation gates at each phase
- ✅ Clear rollback plan if issues arise

**Risks (-)**:
- ⚠️ Zundo temporal middleware not tested in this specific codebase yet (-0.5)
- ⚠️ GPT-4 delta analysis quality dependent on prompt engineering (-0.5)
- ⚠️ Memory optimization requires careful blob separation (well-documented but untested)

**Mitigation**:
- Early testing of Zundo in Phase 1
- Delta analysis prompt can be iteratively improved
- Memory monitoring added to validation gates

---

## 10. ADDITIONAL RESOURCES

### Documentation References
- **Sora Remix API**: `PRPs/ai_docs/sora-2-remix-api.md`
- **Undo/Redo Patterns**: `PRPs/ai_docs/undo_redo_patterns.md`
- **Project Architecture**: `CLAUDE.md`
- **Existing Types**: `src/types/index.ts`

### External Resources
- **Zundo GitHub**: https://github.com/charkour/zundo
- **OpenAI Sora Docs**: https://platform.openai.com/docs/guides/video-generation
- **OpenAI Sora Cookbook**: https://cookbook.openai.com/examples/sora/sora2_prompting_guide
- **FFmpeg.wasm**: https://ffmpegwasm.netlify.app/

### Key Files to Reference During Implementation
1. `src/stores/videoStore.ts` - Zustand pattern
2. `src/services/openaiService.ts` - API calling pattern
3. `api/proxy-create-video.ts` - Edge Function pattern
4. `src/utils/videoFrameExtractor.ts` - Frame extraction
5. `src/components/VideoPlayer.tsx` - Video display pattern

---

**END OF PRP**
