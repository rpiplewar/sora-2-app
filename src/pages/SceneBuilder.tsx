import { useEffect } from 'react';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';
import { VideoCanvas } from '../components/scene-builder/VideoCanvas';
import { RemixHistoryStack } from '../components/scene-builder/RemixHistoryStack';
import { PromptEditor } from '../components/scene-builder/PromptEditor';
import { TimelineView } from '../components/scene-builder/TimelineView';
import { PlannerToggle } from '../components/scene-builder/PlannerToggle';
import '../styles/scene-builder.css';

export const SceneBuilder = () => {
  const loadUserScenes = useSceneBuilderStore((state) => state.loadUserScenes);
  const error = useSceneBuilderStore((state) => state.error);
  const clearError = useSceneBuilderStore((state) => state.clearError);

  useEffect(() => {
    loadUserScenes();
  }, [loadUserScenes]);

  return (
    <div className="scene-builder">
      <div className="scene-builder__header">
        <h1>Scene Builder</h1>
        <div className="scene-builder__header-right">
          <PlannerToggle />
        </div>
      </div>

      {error && (
        <div className="scene-builder__error">
          <span>{error}</span>
          <button onClick={clearError} className="scene-builder__error-close">
            ✕
          </button>
        </div>
      )}

      <div className="scene-builder__main">
        <div className="scene-builder__video-section">
          <VideoCanvas />
          <RemixHistoryStack />
        </div>

        <div className="scene-builder__editor-section">
          <PromptEditor />
        </div>
      </div>

      <div className="scene-builder__timeline">
        <TimelineView />
      </div>
    </div>
  );
};
