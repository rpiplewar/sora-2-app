import { useState, useEffect } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { TimelineThumbnail } from './TimelineThumbnail';
import { SegmentThumbnailGenerator } from '../../utils/videoThumbnailGenerator';
import type { ThumbnailData } from '../../utils/videoThumbnailGenerator';

export const TimelineView = () => {
  const { currentSceneId, scenes } = useSceneBuilderStore();
  const [thumbnails, setThumbnails] = useState<ThumbnailData[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  const currentScene = scenes.find((s) => s.id === currentSceneId);
  const currentVersion = currentScene?.versions[currentScene.currentVersionIndex];
  const hasExtensions = currentScene && currentScene.extensions && currentScene.extensions.length > 0;

  useEffect(() => {
    if (currentVersion?.videoBlob) {
      const generator = new SegmentThumbnailGenerator();
      const duration = parseInt(currentScene!.parameters.seconds);
      const interval = SegmentThumbnailGenerator.calculateThumbnailInterval(duration);

      generator
        .generateThumbnails(currentVersion.videoBlob, duration, interval)
        .then(setThumbnails)
        .catch((err) => {
          console.error('Failed to generate thumbnails:', err);
        });

      return () => {
        // Cleanup old thumbnails
        SegmentThumbnailGenerator.cleanupThumbnails(thumbnails);
      };
    }
  }, [currentVersion?.videoBlob]);

  // Listen to video timeupdate
  useEffect(() => {
    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime);
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    return () => videoElement.removeEventListener('timeupdate', handleTimeUpdate);
  }, [currentVersion?.id]);

  if (!currentVersion || thumbnails.length === 0) return null;

  const handleThumbnailClick = (timestamp: number) => {
    const videoEl = document.querySelector('video');
    if (videoEl) {
      videoEl.currentTime = timestamp;
    }
  };

  return (
    <div className="timeline-view">
      <div className="timeline-view__track">
        {thumbnails.map((thumbnail, index) => (
          <TimelineThumbnail
            key={index}
            thumbnail={thumbnail}
            isActive={Math.floor(currentTime) === Math.floor(thumbnail.timestamp)}
            onClick={() => handleThumbnailClick(thumbnail.timestamp)}
          />
        ))}
      </div>

      <div
        className="timeline-view__playhead"
        style={{
          left: `${(currentTime / parseInt(currentScene!.parameters.seconds)) * 100}%`,
        }}
      />

      {hasExtensions && (
        <div className="timeline-view__extensions">
          <span>+ {currentScene.extensions.length} extended scene{currentScene.extensions.length > 1 ? 's' : ''}</span>
          <small>Extended scenes will be shown sequentially</small>
        </div>
      )}
    </div>
  );
};
