// Video Segment Types
export interface VideoSegment {
  id: string; // Local segment ID (e.g., "segment-0")
  openaiVideoId?: string; // OpenAI video_id (format: "video_abc123...")
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  videoBlob?: Blob; // Only in memory during current session
  videoUrl?: string; // Object URL (lost on refresh)
  error?: string;
  createdAt?: number; // Timestamp for expiration tracking
}

// Video metadata stored in localStorage (NO video files)
export interface VideoMetadata {
  openaiVideoId: string; // OpenAI video_id (required for remix)
  localId: string; // Local identifier for UI
  prompt: string;
  parameters: {
    seconds: number;
    size: string;
    model: string;
  };
  createdAt: number; // Timestamp (ms since epoch)
  expiresAt: number; // createdAt + 24 hours
  remixedFrom?: string; // Parent video's OpenAI ID
  remixCount: number; // Number of child remixes
  isExpired: boolean; // Computed: Date.now() > expiresAt
}

// Helper function to check if metadata is expired
export function isVideoExpired(metadata: VideoMetadata): boolean {
  return Date.now() > metadata.expiresAt;
}

// Helper to calculate expiration time
export function calculateExpiresAt(createdAt: number): number {
  return createdAt + (24 * 60 * 60 * 1000); // 24 hours in milliseconds
}

// OpenAI Video Job Types
export interface VideoJob {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: { message: string };
  remixed_from_video_id?: string | null;
}

// Video Generation Configuration
export interface GenerationConfig {
  prompt: string;
  seconds: number; // UI uses number for easier calculation
  numSegments: number;
  size: string;
  model: string;
}

// OpenAI API Request Types
export interface CreateVideoRequest {
  apiKey: string;
  prompt: string;
  seconds: string; // OpenAI API expects string: '4', '8', or '12'
  size: string;
  model: string;
  remixedFromVideoId?: string; // Optional: ID of video to remix from
  inputReference?: Blob; // Optional: Image for frame continuity (last frame of previous video)
}

// Planned Segment from AI
export interface PlannedSegment {
  title: string;
  seconds: number;
  prompt: string;
}

// Planning Response
export interface PlanningResponse {
  segments: PlannedSegment[];
}

// Zustand Store State
export interface VideoStoreState {
  // State
  apiKey: string | null;
  segments: VideoSegment[];
  finalVideoUrl: string | null;
  isProcessing: boolean;
  error: string | null;
  ffmpegReady: boolean;

  // Video metadata history (NOT video files)
  videoHistory: VideoMetadata[];
  selectedVideoForRemix: VideoMetadata | null;

  // Actions
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  addSegment: (segment: VideoSegment) => void;
  updateSegment: (id: string, updates: Partial<VideoSegment>) => void;
  setFinalVideo: (url: string) => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  setFFmpegReady: (ready: boolean) => void;
  reset: () => void;

  // Actions for remix feature
  saveVideoMetadata: (metadata: VideoMetadata) => void;
  loadVideoHistory: () => void;
  deleteVideoMetadata: (openaiVideoId: string) => void;
  selectVideoForRemix: (metadata: VideoMetadata | null) => void;
  incrementRemixCount: (openaiVideoId: string) => void;
}

// Form Data Types
export interface PromptFormData {
  prompt: string;
  seconds: number;
  numSegments: number;
  size: string;
}

// ============================================================================
// Scene Builder Types - Video Remix Interface with Split-View Editing
// ============================================================================

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
  lastFramePreview: string | null;  // Object URL for last frame preview (after approval)

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
  approveVersion: () => Promise<void>;
  extendToNextScene: () => Promise<void>;
  reset: () => void; // Clear all state

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
