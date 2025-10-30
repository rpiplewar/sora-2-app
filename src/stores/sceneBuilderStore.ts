import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Scene, SceneVersion, GenerationConfig, SceneBuilderState, ImportConfig, VideoMetadata } from '../types';
import { calculateExpiresAt } from '../types';
import { openaiService } from '../services/openaiService';
import { analyzePromptDelta, createRemix, downloadVideo } from '../services/remixService';
import { extractLastFrame } from '../utils/videoFrameExtractor';
import { storageService } from '../services/storageService';
import { useBlobStore } from './blobStore';
import { useVideoStore } from './videoStore';
import { videoService } from '../services/videoService';

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

export const useSceneBuilderStore = create<SceneBuilderState>()(
  temporal(
    (set, get) => ({
      // State
      scenes: [],
      currentSceneId: null,
      editedPrompt: '',
      deltaAnalysis: null,
      lastFramePreview: null,
      importedFrom: null,
      isAnalyzingDelta: false,
      isRemixing: false,
      remixProgress: 0,
      error: null,

      // Timeline state
      timelineVideoBlobId: null,
      timelineDuration: 0,
      sceneDurations: [],
      cumulativeDurations: [],
      currentPlaybackTime: 0,
      isTimelineMode: false,
      isRegeneratingTimeline: false,

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
            const job = await openaiService.createVideo({
              apiKey,
              prompt: config.prompt,
              seconds: config.seconds.toString(),
              size: config.size,
              model: config.model,
            });

            // Poll for completion
            const completedJob = await openaiService.pollUntilComplete(
              job.id,
              apiKey,
              (progress) => set({ remixProgress: progress })
            );

            if (completedJob.status === 'failed') {
              throw new Error(completedJob.error?.message || 'Video generation failed');
            }

            // Download video
            const blob = await openaiService.downloadVideo(completedJob.id, apiKey);
            const blobId = `blob-${Date.now()}`;
            useBlobStore.getState().addBlob(blobId, blob);

            // Create scene and version
            const version: SceneVersion = {
              id: versionId,
              openaiVideoId: completedJob.id,
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

            // Save to homepage history
            const metadata: VideoMetadata = {
              openaiVideoId: completedJob.id,
              localId: `scene-${Date.now()}`,
              prompt: config.prompt,
              parameters: {
                seconds: config.seconds,
                size: config.size,
                model: config.model,
              },
              createdAt: Date.now(),
              expiresAt: calculateExpiresAt(Date.now()),
              remixCount: 0,
              isExpired: false,
            };
            useVideoStore.getState().saveVideoMetadata(metadata);

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
          const { currentSceneId, scenes, editedPrompt } = get();
          const apiKey = storageService.getApiKey();

          if (!apiKey || !currentSceneId) return;

          const scene = scenes.find(s => s.id === currentSceneId);
          if (!scene) return;

          const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
          if (!currentVersion) return;

          try {
            set({ isRemixing: true, error: null, remixProgress: 0 });

            // Analyze delta first (if not already analyzed)
            let deltaAnalysis = get().deltaAnalysis;
            if (!deltaAnalysis) {
              set({ isAnalyzingDelta: true });
              deltaAnalysis = await analyzePromptDelta(
                currentVersion.prompt,
                editedPrompt,
                apiKey
              );
              set({ deltaAnalysis, isAnalyzingDelta: false });
            }

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
              timelineVideoBlobId: null,  // Invalidate timeline
              isTimelineMode: false,      // Exit timeline mode
            }));

            // Save to homepage history
            const metadata: VideoMetadata = {
              openaiVideoId: job.id,
              localId: `scene-remix-${Date.now()}`,
              prompt: editedPrompt,
              parameters: {
                seconds: scene.initialConfig.seconds,
                size: scene.initialConfig.size,
                model: scene.initialConfig.model,
              },
              createdAt: Date.now(),
              expiresAt: calculateExpiresAt(Date.now()),
              remixedFrom: currentVersion.openaiVideoId, // Link to parent
              remixCount: 0,
              isExpired: false,
            };
            useVideoStore.getState().saveVideoMetadata(metadata);

          } catch (error: any) {
            set({ error: error.message, isRemixing: false, remixProgress: 0 });
          }
        },

        // Approve current version and lock scene - prepares for next scene
        approveVersion: async () => {
          const { currentSceneId, scenes } = get();
          if (!currentSceneId) return;

          const currentScene = scenes.find(s => s.id === currentSceneId);
          if (!currentScene) return;

          const currentVersion = currentScene.versions.find(
            v => v.id === currentScene.currentVersionId
          );

          // Lock the scene
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
            editedPrompt: '', // Clear prompt for next scene
            deltaAnalysis: null,
            timelineVideoBlobId: null,  // Invalidate timeline
            isTimelineMode: false,      // Exit timeline mode
          }));

          // Extract last frame for preview
          try {
            if (currentVersion?.videoBlobId) {
              const blob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
              if (blob) {
                const lastFrameBlob = await extractLastFrame(blob);
                const previewUrl = URL.createObjectURL(lastFrameBlob);

                // Revoke old preview URL if exists
                const oldPreview = get().lastFramePreview;
                if (oldPreview) {
                  URL.revokeObjectURL(oldPreview);
                }

                set({ lastFramePreview: previewUrl });
              }
            }
          } catch (error: any) {
            console.error('Failed to extract last frame:', error);
            // Don't block approval if frame extraction fails
          }
        },

        // Extend approved scene to next scene with frame continuity
        extendToNextScene: async () => {
          const { currentSceneId, scenes, editedPrompt } = get();
          const apiKey = storageService.getApiKey();

          if (!apiKey || !currentSceneId) return;

          // Validate we have a prompt for next scene
          if (!editedPrompt.trim()) {
            set({ error: 'Please enter a prompt for the next scene' });
            return;
          }

          const currentScene = scenes.find(s => s.id === currentSceneId);
          if (!currentScene || !currentScene.isLocked) return;

          const currentVersion = currentScene.versions.find(
            v => v.id === currentScene.currentVersionId
          );
          if (!currentVersion?.videoBlobId) return;

          try {
            set({ isRemixing: true, error: null, remixProgress: 0 });

            // Extract last frame from current scene (fresh extraction for generation)
            const currentBlob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
            if (!currentBlob) throw new Error('Video blob not found');

            const lastFrame = await extractLastFrame(currentBlob);

            // Create next scene with frame continuity using prompt from state
            const job = await openaiService.createVideo({
              apiKey,
              prompt: editedPrompt,
              seconds: currentScene.initialConfig.seconds.toString(),
              size: currentScene.initialConfig.size,
              model: currentScene.initialConfig.model,
              inputReference: lastFrame,
            });

            // Poll for completion
            const completedJob = await openaiService.pollUntilComplete(
              job.id,
              apiKey,
              (progress) => set({ remixProgress: progress })
            );

            if (completedJob.status === 'failed') {
              throw new Error(completedJob.error?.message || 'Video generation failed');
            }

            // Download video
            const blob = await openaiService.downloadVideo(completedJob.id, apiKey);
            const blobId = `blob-${Date.now()}`;
            useBlobStore.getState().addBlob(blobId, blob);

            // Create new scene
            const newSceneId = `scene-${Date.now()}`;
            const newVersion: SceneVersion = {
              id: 'v1',
              openaiVideoId: completedJob.id,
              prompt: editedPrompt,
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

            // Revoke last frame preview
            const oldPreview = get().lastFramePreview;
            if (oldPreview) {
              URL.revokeObjectURL(oldPreview);
            }

            set((state) => ({
              scenes: [...state.scenes, newScene],
              currentSceneId: newSceneId,
              editedPrompt: editedPrompt, // Keep the prompt from the new scene
              lastFramePreview: null,
              isRemixing: false,
              remixProgress: 0,
              timelineVideoBlobId: null,  // Invalidate timeline - needs regeneration
              isTimelineMode: false,      // Exit timeline mode
            }));

            // Save to homepage history
            const metadata: VideoMetadata = {
              openaiVideoId: completedJob.id,
              localId: `scene-extend-${Date.now()}`,
              prompt: editedPrompt,
              parameters: {
                seconds: currentScene.initialConfig.seconds,
                size: currentScene.initialConfig.size,
                model: currentScene.initialConfig.model,
              },
              createdAt: Date.now(),
              expiresAt: calculateExpiresAt(Date.now()),
              remixCount: 0,
              isExpired: false,
            };
            useVideoStore.getState().saveVideoMetadata(metadata);

          } catch (error: any) {
            set({ error: error.message, isRemixing: false, remixProgress: 0 });
          }
        },

        // Import video from homepage with appropriate mode
        importFromHomepage: async (config: ImportConfig) => {
          const { videoMetadata } = config;
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

        // Timeline actions
        generateTimeline: async () => {
          const { scenes } = get();
          console.log('[generateTimeline] Started. Scenes count:', scenes.length);

          // Edge case: No scenes
          if (scenes.length === 0) {
            console.log('[generateTimeline] No scenes found');
            set({ error: 'No scenes to generate timeline' });
            return;
          }

          // Get all scenes for timeline (locked or unlocked)
          const allScenes = scenes;
          console.log('[generateTimeline] All scenes:', allScenes.map(s => s.id));

          try {
            console.log('[generateTimeline] Setting regenerating flag');
            set({ isRegeneratingTimeline: true, error: null });

            // Edge case: Single scene - no concatenation needed
            if (allScenes.length === 1) {
              const scene = allScenes[0];
              const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);

              if (!currentVersion?.videoBlobId) {
                set({ error: 'Scene missing video data', isRegeneratingTimeline: false });
                return;
              }

              const blob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
              if (!blob) {
                set({ error: 'Video blob not found', isRegeneratingTimeline: false });
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

            // Collect video blobs for all scenes (use current version)
            console.log('[generateTimeline] Multi-scene path. Scene count:', allScenes.length);
            const videoBlobs: Blob[] = [];
            const durations: number[] = [];

            for (const scene of allScenes) {
              console.log('[generateTimeline] Processing scene:', scene.id);
              const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
              if (!currentVersion?.videoBlobId) {
                console.error('[generateTimeline] Scene missing video blob:', scene.id);
                throw new Error(`Scene ${scene.id} missing video blob`);
              }

              console.log('[generateTimeline] Getting blob:', currentVersion.videoBlobId);
              const blob = useBlobStore.getState().getBlob(currentVersion.videoBlobId);
              if (!blob) {
                console.error('[generateTimeline] Blob not found in store:', currentVersion.videoBlobId);
                throw new Error(`Video blob not found: ${currentVersion.videoBlobId}`);
              }

              videoBlobs.push(blob);
              console.log('[generateTimeline] Blob added. Size:', blob.size);

              // Get video duration using temporary video element
              console.log('[generateTimeline] Getting video duration...');
              const duration = await getVideoDuration(blob);
              durations.push(duration);
              console.log('[generateTimeline] Duration:', duration);
            }

            // Calculate cumulative durations for scrubbing
            const cumulative = durations.reduce<number[]>((acc, dur, idx) => {
              const prev = idx === 0 ? 0 : acc[idx - 1];
              acc.push(prev + dur);
              return acc;
            }, []);
            cumulative.unshift(0); // Add 0 at start: [0, 4, 12, 16, 28]

            const totalDuration = cumulative[cumulative.length - 1];
            console.log('[generateTimeline] Total duration:', totalDuration);
            console.log('[generateTimeline] Cumulative durations:', cumulative);

            // Concatenate videos using FFmpeg
            console.log('[generateTimeline] Starting FFmpeg concatenation...');
            const concatenatedBlob = await videoService.concatenateVideos(videoBlobs);
            console.log('[generateTimeline] Concatenation complete. Blob size:', concatenatedBlob.size);

            const blobId = `timeline-${Date.now()}`;
            console.log('[generateTimeline] Storing timeline blob with ID:', blobId);
            useBlobStore.getState().addBlob(blobId, concatenatedBlob);

            // Cleanup old timeline blob
            const oldBlobId = get().timelineVideoBlobId;
            if (oldBlobId) {
              console.log('[generateTimeline] Cleaning up old blob:', oldBlobId);
              useBlobStore.getState().removeBlob(oldBlobId);
            }

            console.log('[generateTimeline] Setting state: isTimelineMode=true, blobId=', blobId);
            set({
              timelineVideoBlobId: blobId,
              sceneDurations: durations,
              cumulativeDurations: cumulative,
              timelineDuration: totalDuration,
              isRegeneratingTimeline: false,
              isTimelineMode: true,
            });
            console.log('[generateTimeline] SUCCESS! Timeline generated');

          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[generateTimeline] ERROR:', errorMessage, error);
            set({
              error: `Timeline generation failed: ${errorMessage}`,
              isRegeneratingTimeline: false,
            });
          }
        },

        updatePlaybackTime: (time: number) => {
          set({ currentPlaybackTime: time });
        },

        seekToScene: (sceneId: string) => {
          const { scenes, cumulativeDurations } = get();
          const sceneIndex = scenes.findIndex(s => s.id === sceneId);

          if (sceneIndex === -1) {
            console.warn(`Scene ${sceneId} not found`);
            return;
          }

          const startTime = cumulativeDurations[sceneIndex];
          set({ currentPlaybackTime: startTime, currentSceneId: sceneId });
        },

        toggleTimelineMode: () => {
          set((state) => ({ isTimelineMode: !state.isTimelineMode }));
        },

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

        // Reset all state (for refresh or starting fresh)
        reset: () => {
          const lastFramePreview = get().lastFramePreview;
          if (lastFramePreview) {
            URL.revokeObjectURL(lastFramePreview);
          }
          useBlobStore.getState().clear();
          set({
            scenes: [],
            currentSceneId: null,
            editedPrompt: '',
            deltaAnalysis: null,
            lastFramePreview: null,
            importedFrom: null,
            isAnalyzingDelta: false,
            isRemixing: false,
            remixProgress: 0,
            error: null,
          });
        },
      }),
    {
      // Zundo configuration
      limit: 50,
      partialize: (state) => ({
        // Track these in history
        scenes: state.scenes,
        currentSceneId: state.currentSceneId,

        // Exclude these from history (ephemeral UI state)
        // editedPrompt - transient edit state, not version history
        // isRemixing, remixProgress, error, deltaAnalysis, isAnalyzingDelta
      }),
      // Only create history entry if partialized state actually changed
      equality: (pastState, currentState) => {
        return (
          JSON.stringify(pastState) === JSON.stringify(currentState)
        );
      },
    }
  )
);
