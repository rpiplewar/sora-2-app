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

        // Cleanup: revoke URL when version changes or unmounts
        return () => URL.revokeObjectURL(url);
      }
    }

    // Clear video URL if no current version
    setVideoUrl(undefined);
  }, [currentSceneId, currentVersion?.videoBlobId, currentVersion?.id, getBlob]);

  if (isRemixing) {
    return (
      <div className="scene-canvas loading">
        <div className="progress-container">
          <div className="progress-bar" style={{ width: `${remixProgress}%` }} />
          <p>Generating...</p>
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
    </div>
  );
}
