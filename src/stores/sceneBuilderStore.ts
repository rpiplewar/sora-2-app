import { create } from 'zustand';
import { cloudStorageService } from '../services/cloudStorageService';
import { remixService } from '../services/remixService';
import { openaiService } from '../services/openaiService';
import { extractLastFrame } from '../utils/videoFrameExtractor';

// Get API key from environment variable
const getApiKey = () => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    throw new Error('Please set VITE_OPENAI_API_KEY in your .env.local file');
  }
  return apiKey;
};

export interface RemixVersion {
  id: string;
  prompt: string;
  openaiVideoId: string;
  videoLocalId: string; // From database local_id
  videoDatabaseId: string; // Database UUID for foreign key references
  videoBlob: Blob | null; // Lazy-loaded
  thumbnailUrl: string | null;
  createdAt: number;
  isLoading: boolean;
}

export interface Scene {
  id: string;
  versions: RemixVersion[]; // Stack: [Original, Remix v1, Remix v2, ...]
  currentVersionIndex: number; // Points to active version
  prompt: string; // Editable prompt for next remix
  isLocked: boolean; // True after "Approve & Extend"
  parameters: {
    model: string;
    size: string;
    seconds: string;
  };
  extensions: Scene[]; // Extended scenes that play sequentially after this one
}

interface SceneBuilderState {
  scenes: Scene[];
  currentSceneId: string | null;
  isGenerating: boolean;
  isRemixing: boolean;
  isExtending: boolean;
  plannerEnabled: boolean;
  error: string | null;

  // Actions
  loadUserScenes: () => Promise<void>;
  createNewScene: (prompt: string, parameters: Scene['parameters']) => Promise<void>;
  remixCurrentVersion: () => Promise<void>;
  selectVersion: (sceneId: string, versionIndex: number) => void;
  extendScene: (newPrompt: string) => Promise<void>;
  updatePrompt: (sceneId: string, prompt: string) => void;
  togglePlanner: () => void;
  loadVideoBlob: (versionId: string) => Promise<void>;
  setCurrentScene: (sceneId: string) => void;
  clearError: () => void;
}

export const useSceneBuilderStore = create<SceneBuilderState>((set, get) => ({
  scenes: [],
  currentSceneId: null,
  isGenerating: false,
  isRemixing: false,
  isExtending: false,
  plannerEnabled: false,
  error: null,

  loadUserScenes: async () => {
    try {
      const scenesFromDB = await cloudStorageService.listScenes();

      // Build scene hierarchy by grouping remixed videos as versions and extensions
      const processedVideos = new Set<string>();
      const scenes: Scene[] = [];

      // Find root videos (non-remixes, non-extensions) and build version stacks + extensions
      for (const video of scenesFromDB) {
        if (processedVideos.has(video.databaseId)) continue;

        // Skip if this is a remix or extension (will be processed with its parent)
        if ((video.isRemix && video.remixedFrom) || (video.isExtension && video.extendedFrom)) continue;

        // Build version stack for this root video
        const versions: RemixVersion[] = [];
        const versionStack: typeof scenesFromDB = [];

        // Start with the root video
        const currentVideo = video;
        versionStack.push(currentVideo);
        processedVideos.add(currentVideo.databaseId);

        // Find all remixes of this video (and remixes of remixes)
        const findRemixes = (parentDbId: string) => {
          for (const v of scenesFromDB) {
            if (v.remixedFrom === parentDbId && !processedVideos.has(v.databaseId)) {
              versionStack.push(v);
              processedVideos.add(v.databaseId);
              findRemixes(v.databaseId); // Recursively find remixes of this remix
            }
          }
        };

        findRemixes(currentVideo.databaseId);

        // Convert to RemixVersion format
        for (const v of versionStack) {
          versions.push({
            id: v.id,
            prompt: v.prompt,
            openaiVideoId: v.openaiVideoId,
            videoLocalId: v.id,
            videoDatabaseId: v.databaseId,
            videoBlob: null,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt,
            isLoading: false,
          });
        }

        // Build extensions recursively
        const buildExtensions = (parentDbId: string): Scene[] => {
          const extensions: Scene[] = [];

          for (const extVideo of scenesFromDB) {
            if (extVideo.extendedFrom === parentDbId && !processedVideos.has(extVideo.databaseId)) {
              processedVideos.add(extVideo.databaseId);

              // Build version stack for this extension (it can also have remixes)
              const extVersions: RemixVersion[] = [];
              const extVersionStack: typeof scenesFromDB = [extVideo];

              // Find remixes of this extension
              const findExtRemixes = (extParentDbId: string) => {
                for (const v of scenesFromDB) {
                  if (v.remixedFrom === extParentDbId && !processedVideos.has(v.databaseId)) {
                    extVersionStack.push(v);
                    processedVideos.add(v.databaseId);
                    findExtRemixes(v.databaseId);
                  }
                }
              };

              findExtRemixes(extVideo.databaseId);

              // Convert to RemixVersion format
              for (const v of extVersionStack) {
                extVersions.push({
                  id: v.id,
                  prompt: v.prompt,
                  openaiVideoId: v.openaiVideoId,
                  videoLocalId: v.id,
                  videoDatabaseId: v.databaseId,
                  videoBlob: null,
                  thumbnailUrl: v.thumbnailUrl,
                  createdAt: v.createdAt,
                  isLoading: false,
                });
              }

              // Recursively build extensions of this extension
              const nestedExtensions = buildExtensions(extVideo.databaseId);

              extensions.push({
                id: extVideo.id,
                versions: extVersions,
                currentVersionIndex: extVersions.length - 1,
                prompt: extVersions[extVersions.length - 1].prompt,
                isLocked: false,
                parameters: extVideo.parameters,
                extensions: nestedExtensions,
              });
            }
          }

          return extensions;
        };

        const extensions = buildExtensions(currentVideo.databaseId);

        // Create scene with all versions and extensions
        scenes.push({
          id: video.id, // Use root video's local_id as scene ID
          versions,
          currentVersionIndex: versions.length - 1, // Point to latest version
          prompt: versions[versions.length - 1].prompt, // Use latest prompt
          isLocked: false,
          parameters: video.parameters,
          extensions,
        });
      }

      set({
        scenes,
        error: null,
        // Auto-select first scene if available and no scene is currently selected
        currentSceneId: scenes.length > 0 && !get().currentSceneId ? scenes[0].id : get().currentSceneId
      });
    } catch (error) {
      console.error('Failed to load scenes:', error);
      set({ error: 'Failed to load scenes from database' });
    }
  },

  createNewScene: async (prompt: string, parameters: Scene['parameters']) => {
    set({ isGenerating: true, error: null });
    console.log('[SceneBuilder] Creating new scene:', { prompt: prompt.slice(0, 50), parameters });

    try {
      const apiKey = getApiKey();

      // Generate video
      const job = await openaiService.createVideo({
        apiKey,
        prompt,
        seconds: parameters.seconds,
        size: parameters.size,
        model: parameters.model,
      });

      const completedJob = await openaiService.pollUntilComplete(job.id, apiKey);
      const videoBlob = await openaiService.downloadVideo(completedJob.id, apiKey);

      // Upload to cloud storage
      const result = await cloudStorageService.uploadVideo(videoBlob, {
        openaiVideoId: completedJob.id,
        prompt,
        seconds: parseInt(parameters.seconds),
        size: parameters.size,
        model: parameters.model,
      });

      // Create new scene in state
      const newScene: Scene = {
        id: result.localId,
        versions: [
          {
            id: result.localId,
            prompt,
            openaiVideoId: completedJob.id,
            videoLocalId: result.localId,
            videoDatabaseId: result.databaseId, // Store database UUID
            videoBlob,
            thumbnailUrl: result.thumbnailUrl || null,
            createdAt: Date.now(),
            isLoading: false,
          },
        ],
        currentVersionIndex: 0,
        prompt,
        isLocked: false,
        parameters,
        extensions: [],
      };

      set((state) => ({
        scenes: [...state.scenes, newScene],
        currentSceneId: newScene.id,
        isGenerating: false,
      }));
    } catch (error) {
      console.error('Failed to create scene:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create scene',
        isGenerating: false,
      });
    }
  },

  remixCurrentVersion: async () => {
    const { currentSceneId, scenes } = get();
    const scene = scenes.find((s) => s.id === currentSceneId);
    if (!scene) {
      set({ error: 'No scene selected' });
      return;
    }

    set({ isRemixing: true, error: null });
    console.log('[SceneBuilder] Remixing scene:', { sceneId: currentSceneId, newPrompt: scene.prompt.slice(0, 50) });

    try {
      const apiKey = getApiKey();

      const currentVersion = scene.versions[scene.currentVersionIndex];
      const newPrompt = scene.prompt;

      // Call remix API with prompt analysis
      const job = await remixService.autoRemix(
        currentVersion.openaiVideoId,
        newPrompt,
        scene.parameters,
        apiKey,
        {
          analyzePromptChanges: true,
          originalPrompt: currentVersion.prompt,
        }
      );

      const videoBlob = await openaiService.downloadVideo(job.id, apiKey);

      // Upload remixed video
      const result = await cloudStorageService.uploadVideo(videoBlob, {
        openaiVideoId: job.id,
        prompt: newPrompt,
        seconds: parseInt(scene.parameters.seconds),
        size: scene.parameters.size,
        model: scene.parameters.model,
        remixedFrom: currentVersion.videoDatabaseId, // Use database UUID for foreign key
      });

      // Add new version to stack
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === currentSceneId
            ? {
                ...s,
                versions: [
                  ...s.versions,
                  {
                    id: result.localId,
                    prompt: newPrompt,
                    openaiVideoId: job.id,
                    videoLocalId: result.localId,
                    videoDatabaseId: result.databaseId, // Store database UUID
                    videoBlob,
                    thumbnailUrl: result.thumbnailUrl || null,
                    createdAt: Date.now(),
                    isLoading: false,
                  },
                ],
                currentVersionIndex: s.versions.length, // Point to new version
              }
            : s
        ),
        isRemixing: false,
      }));
    } catch (error) {
      console.error('Failed to remix:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to remix video',
        isRemixing: false,
      });
    }
  },

  selectVersion: (sceneId: string, versionIndex: number) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId ? { ...s, currentVersionIndex: versionIndex } : s
      ),
    }));
  },

  extendScene: async (newPrompt: string) => {
    const { currentSceneId, scenes } = get();
    const scene = scenes.find((s) => s.id === currentSceneId);
    if (!scene) {
      set({ error: 'No scene selected' });
      return;
    }

    set({ isExtending: true, error: null });
    console.log('[SceneBuilder] Extending scene:', { sceneId: currentSceneId, newPrompt: newPrompt.slice(0, 50) });

    try {
      const apiKey = getApiKey();

      const currentVersion = scene.versions[scene.currentVersionIndex];

      // Extract last frame for continuity
      if (!currentVersion.videoBlob) {
        throw new Error('Video not loaded. Please wait for video to load.');
      }

      const lastFrameBlob = await extractLastFrame(currentVersion.videoBlob);

      // Create new video with frame continuity
      const job = await openaiService.createVideo({
        apiKey,
        prompt: newPrompt,
        seconds: scene.parameters.seconds,
        size: scene.parameters.size,
        model: scene.parameters.model,
        inputReference: lastFrameBlob,
      });

      const completedJob = await openaiService.pollUntilComplete(job.id, apiKey);
      const videoBlob = await openaiService.downloadVideo(completedJob.id, apiKey);

      // Upload extended video with reference to parent
      const result = await cloudStorageService.uploadVideo(videoBlob, {
        openaiVideoId: completedJob.id,
        prompt: newPrompt,
        seconds: parseInt(scene.parameters.seconds),
        size: scene.parameters.size,
        model: scene.parameters.model,
        extendedFrom: currentVersion.videoDatabaseId, // Link to parent for sequential playback
      });

      // Create new scene for the extended video and add to parent's extensions
      const newScene: Scene = {
        id: result.localId,
        versions: [
          {
            id: result.localId,
            prompt: newPrompt,
            openaiVideoId: completedJob.id,
            videoLocalId: result.localId,
            videoDatabaseId: result.databaseId, // Store database UUID
            videoBlob,
            thumbnailUrl: result.thumbnailUrl || null,
            createdAt: Date.now(),
            isLoading: false,
          },
        ],
        currentVersionIndex: 0,
        prompt: newPrompt,
        isLocked: false,
        parameters: scene.parameters,
        extensions: [],
      };

      // Add extended scene to parent's extensions AND to top-level scenes array
      // This allows it to be viewed independently while maintaining the sequence relationship
      set((state) => ({
        scenes: [
          ...state.scenes.map((s) =>
            s.id === currentSceneId
              ? { ...s, extensions: [...s.extensions, newScene] }
              : s
          ),
          newScene, // Also add to top-level so it can be selected/viewed
        ],
        currentSceneId: newScene.id, // Automatically switch to the new extended scene
        isExtending: false,
      }));
    } catch (error) {
      console.error('Failed to extend scene:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to extend scene',
        isExtending: false,
      });
    }
  },

  updatePrompt: (sceneId: string, prompt: string) => {
    set((state) => ({
      scenes: state.scenes.map((s) => (s.id === sceneId ? { ...s, prompt } : s)),
    }));
  },

  togglePlanner: () => {
    set((state) => ({ plannerEnabled: !state.plannerEnabled }));
  },

  loadVideoBlob: async (versionId: string) => {
    try {
      // Mark as loading
      set((state) => ({
        scenes: state.scenes.map((scene) => ({
          ...scene,
          versions: scene.versions.map((v) =>
            v.id === versionId ? { ...v, isLoading: true } : v
          ),
        })),
      }));

      // Lazy-load video blob from GCS
      const blob = await cloudStorageService.loadVideo(versionId);

      set((state) => ({
        scenes: state.scenes.map((scene) => ({
          ...scene,
          versions: scene.versions.map((v) =>
            v.id === versionId ? { ...v, videoBlob: blob, isLoading: false } : v
          ),
        })),
      }));
    } catch (error) {
      console.error('Failed to load video:', error);
      set((state) => ({
        scenes: state.scenes.map((scene) => ({
          ...scene,
          versions: scene.versions.map((v) =>
            v.id === versionId ? { ...v, isLoading: false } : v
          ),
        })),
        error: 'Failed to load video from cloud storage',
      }));
    }
  },

  setCurrentScene: (sceneId: string) => {
    set({ currentSceneId: sceneId });
  },

  clearError: () => {
    set({ error: null });
  },
}));
