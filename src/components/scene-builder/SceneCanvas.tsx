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
