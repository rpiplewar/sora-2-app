import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../styles/scene-builder.css';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';
import { useVideoStore } from '../stores/videoStore';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { SceneCanvas } from '../components/scene-builder/SceneCanvas';
import { PromptEditor } from '../components/scene-builder/PromptEditor';
import { DeltaDisplay } from '../components/scene-builder/DeltaDisplay';
import { VersionControls } from '../components/scene-builder/VersionControls';
import { TimelinePlayer } from '../components/scene-builder/TimelinePlayer';
import { TimelineTrack } from '../components/scene-builder/TimelineTrack';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { GenerationConfig } from '../types';
import { isVideoExpired } from '../types';

export function SceneBuilder() {
  const { error, currentSceneId, importFromHomepage, isTimelineMode, toggleTimelineMode, timelineVideoBlobId, generateTimeline } = useSceneBuilderStore();
  const location = useLocation();
  const videoHistory = useVideoStore(state => state.videoHistory);

  // DEBUG: Verify logging works
  console.log('🎬 SceneBuilder loaded!', { currentSceneId, isTimelineMode, timelineVideoBlobId });

  // Set up undo/redo keyboard shortcuts
  useKeyboardShortcuts();

  // Handle import from homepage
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
        useSceneBuilderStore.setState({ error: 'Video not found in history' });
      }
    }
  }, [location.search, videoHistory, importFromHomepage]);

  return (
    <div className="scene-builder">
      <header>
        <h1>Scene Builder</h1>
        <ApiKeyInput />
        <VersionControls />

        {/* Timeline toggle button */}
        {currentSceneId && (
          <button
            onClick={async () => {
              console.log('[Timeline View Button] Clicked');
              console.log('[Timeline View Button] isTimelineMode:', isTimelineMode);
              console.log('[Timeline View Button] timelineVideoBlobId:', timelineVideoBlobId);

              if (!isTimelineMode && !timelineVideoBlobId) {
                console.log('[Timeline View Button] Calling generateTimeline()...');
                await generateTimeline();
                console.log('[Timeline View Button] generateTimeline() completed');
              } else {
                console.log('[Timeline View Button] Toggling timeline mode');
                toggleTimelineMode();
              }
            }}
            className="timeline-toggle-button"
          >
            {isTimelineMode ? 'Edit Mode' : 'Timeline View'}
          </button>
        )}
      </header>

      {error && <ErrorDisplay error={error} />}

      {!currentSceneId ? (
        <InitialSceneForm />
      ) : isTimelineMode ? (
        /* Timeline View - Video editor layout */
        <div className="timeline-view">
          {/* Top section: Video (left) + Prompt (right) */}
          <div className="timeline-content-section">
            <div className="video-panel-container">
              <TimelinePlayer />
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
        /* Split View for Editing */
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
  const { createScene, isRemixing } = useSceneBuilderStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    const config: GenerationConfig = {
      prompt: formData.get('prompt') as string,
      seconds: Number(formData.get('seconds')),
      size: formData.get('size') as string,
      model: 'sora-2',
      numSegments: 1,
    };

    await createScene(config);
    setIsSubmitting(false);
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
          disabled={isSubmitting || isRemixing}
        />
      </label>

      <label>
        Duration
        <select name="seconds" required disabled={isSubmitting || isRemixing}>
          <option value="4">4 seconds</option>
          <option value="8">8 seconds</option>
          <option value="12">12 seconds</option>
        </select>
      </label>

      <label>
        Size
        <select name="size" required disabled={isSubmitting || isRemixing}>
          <option value="1280x720">Landscape (1280x720)</option>
          <option value="1792x1024">Landscape Wide (1792x1024)</option>
          <option value="720x1280">Portrait (720x1280)</option>
          <option value="1024x1792">Portrait Tall (1024x1792)</option>
        </select>
      </label>

      <button type="submit" disabled={isSubmitting || isRemixing}>
        {isSubmitting || isRemixing ? 'Generating...' : 'Generate First Scene'}
      </button>
    </form>
  );
}
