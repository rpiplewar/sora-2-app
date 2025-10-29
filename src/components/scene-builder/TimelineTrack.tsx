import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { SceneCard } from './SceneCard';

export function TimelineTrack() {
  const {
    scenes,
    cumulativeDurations,
    sceneDurations,
    currentPlaybackTime,
    timelineDuration,
    currentSceneId,
    seekToScene,
  } = useSceneBuilderStore();

  const allScenes = scenes;

  if (allScenes.length === 0) {
    return (
      <div className="timeline-track empty">
        <p>No scenes yet. Generate scenes to build your timeline.</p>
      </div>
    );
  }

  // Calculate playhead position (0-100%)
  const playheadPercent = timelineDuration > 0
    ? (currentPlaybackTime / timelineDuration) * 100
    : 0;

  return (
    <div className="timeline-track">
      <div className="timeline-header">
        <h3>Timeline</h3>
        <span className="timeline-duration">
          {formatTime(currentPlaybackTime)} / {formatTime(timelineDuration)}
        </span>
      </div>

      <div className="timeline-scenes-container">
        <div className="playhead" style={{ left: `${playheadPercent}%` }} />

        <div className="timeline-scenes">
          {allScenes.map((scene, index) => {
            const duration = sceneDurations[index] || 0;
            const startTime = cumulativeDurations[index] || 0;
            const isActive = scene.id === currentSceneId;

            return (
              <SceneCard
                key={scene.id}
                scene={scene}
                duration={duration}
                startTime={startTime}
                isActive={isActive}
                onSelect={() => seekToScene(scene.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper: Format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
