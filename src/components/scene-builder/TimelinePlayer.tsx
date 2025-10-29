import { useEffect, useRef, useState } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { useBlobStore } from '../../stores/blobStore';

export function TimelinePlayer() {
  const {
    timelineVideoBlobId,
    cumulativeDurations,
    scenes,
    currentPlaybackTime,
    updatePlaybackTime,
    isRegeneratingTimeline,
  } = useSceneBuilderStore();

  const getBlob = useBlobStore(state => state.getBlob);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>();

  // Load timeline video blob
  useEffect(() => {
    if (timelineVideoBlobId) {
      const blob = getBlob(timelineVideoBlobId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
    setVideoUrl(undefined);
  }, [timelineVideoBlobId, getBlob]);

  // Sync playback time with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      updatePlaybackTime(video.currentTime);
      detectSceneChange(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [updatePlaybackTime, cumulativeDurations, scenes]);

  // Detect scene changes during playback
  const detectSceneChange = (currentTime: number) => {
    if (cumulativeDurations.length === 0) return;

    const allScenes = scenes;

    // Binary search for current scene
    let sceneIndex = 0;
    for (let i = 0; i < cumulativeDurations.length - 1; i++) {
      if (currentTime >= cumulativeDurations[i] && currentTime < cumulativeDurations[i + 1]) {
        sceneIndex = i;
        break;
      }
    }

    const currentScene = allScenes[sceneIndex];
    if (currentScene) {
      // Update current scene without seeking (avoid loop)
      useSceneBuilderStore.setState({ currentSceneId: currentScene.id });
    }
  };

  // Handle external seek requests
  useEffect(() => {
    const video = videoRef.current;
    if (video && Math.abs(video.currentTime - currentPlaybackTime) > 0.5) {
      video.currentTime = currentPlaybackTime;
    }
  }, [currentPlaybackTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (isRegeneratingTimeline) {
    return (
      <div className="timeline-player loading">
        <div className="loading-spinner">
          <p>Generating timeline...</p>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="timeline-player empty">
        <p>No timeline generated. Approve scenes to create timeline.</p>
      </div>
    );
  }

  return (
    <div className="timeline-player">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="timeline-video"
        onError={(e) => {
          console.error('Timeline video playback error:', e);
        }}
      />
    </div>
  );
}
