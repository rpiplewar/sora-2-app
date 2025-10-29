import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Scene, SceneVersion, GenerationConfig, SceneBuilderState } from '../types';
import { openaiService } from '../services/openaiService';
import { analyzePromptDelta, createRemix, downloadVideo } from '../services/remixService';
import { extractLastFrame } from '../utils/videoFrameExtractor';
import { storageService } from '../services/storageService';
import { useBlobStore } from './blobStore';

export const useSceneBuilderStore = create<SceneBuilderState>()(
  temporal(
    (set, get) => ({
      // State
      scenes: [],
      currentSceneId: null,
      editedPrompt: '',
      deltaAnalysis: null,
      lastFramePreview: null,
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
              editedPrompt: editedPrompt,
              lastFramePreview: null,
              isRemixing: false,
              remixProgress: 0,
            }));

          } catch (error: any) {
            set({ error: error.message, isRemixing: false, remixProgress: 0 });
          }
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
        editedPrompt: state.editedPrompt,

        // Exclude these from history (ephemeral UI state)
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
