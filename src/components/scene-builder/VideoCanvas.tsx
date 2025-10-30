import { useRef, useEffect } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export const VideoCanvas = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { currentSceneId, scenes, loadVideoBlob } = useSceneBuilderStore();

  const currentScene = scenes.find((s) => s.id === currentSceneId);
  const currentVersion = currentScene?.versions[currentScene.currentVersionIndex];

  useEffect(() => {
    if (currentVersion && !currentVersion.videoBlob && !currentVersion.isLoading) {
      loadVideoBlob(currentVersion.id);
    }
  }, [currentVersion?.id, loadVideoBlob]);

  useEffect(() => {
    if (videoRef.current && currentVersion?.videoBlob) {
      const url = URL.createObjectURL(currentVersion.videoBlob);
      videoRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [currentVersion?.videoBlob]);

  if (!currentVersion) {
    return (
      <div className="video-canvas video-canvas--empty">
        <div className="video-canvas__placeholder">
          <span className="video-canvas__icon">🎬</span>
          <p>No scene selected. Create a new scene to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-canvas">
      {currentVersion.isLoading ? (
        <div className="video-canvas__loader">
          <div className="video-canvas__spinner"></div>
          <p>Loading video...</p>
        </div>
      ) : (
        <video ref={videoRef} controls className="video-canvas__player" />
      )}
    </div>
  );
};
