// Video Segment Types
export interface VideoSegment {
  id: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  videoBlob?: Blob;
  videoUrl?: string;
  error?: string;
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

// Valid seconds values for OpenAI Sora 2 API
export const VALID_SECONDS = ['4', '8', '12', '16', '20'] as const;

// Pro sizes require sora-2-pro model
export const PRO_SIZES = ['1792x1024', '1024x1792', '1920x1080', '1080x1920'] as const;

// Auto-select model based on size
export function getModelForSize(size: string): 'sora-2' | 'sora-2-pro' {
  return PRO_SIZES.includes(size as typeof PRO_SIZES[number]) ? 'sora-2-pro' : 'sora-2';
}

// OpenAI API Request Types
export interface CreateVideoRequest {
  apiKey: string;
  prompt: string;
  seconds: string; // OpenAI API expects string: '4', '8', '12', '16', or '20'
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
}

// Form Data Types
export interface PromptFormData {
  prompt: string;
  seconds: number;
  numSegments: number;
  size: string;
}
