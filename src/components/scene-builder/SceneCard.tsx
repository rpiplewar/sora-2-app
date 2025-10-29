import { useState } from 'react';
import type { Scene } from '../../types';
import { VersionStack } from './VersionStack';

interface SceneCardProps {
  scene: Scene;
  duration: number;
  startTime: number;
  isActive: boolean;
  onSelect: () => void;
}

export function SceneCard({ scene, duration, startTime, isActive, onSelect }: SceneCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Calculate width based on duration (min 120px, max 300px)
  const widthPx = Math.max(120, Math.min(300, duration * 30));

  return (
    <div
      className={`scene-card ${isActive ? 'active' : ''}`}
      style={{ width: `${widthPx}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <div className="scene-card-header">
        <span className="scene-number">Scene {scene.id.split('-')[1]}</span>
        <span className="scene-duration">{duration}s</span>
      </div>

      <VersionStack
        scene={scene}
        isHovered={isHovered}
        isActive={isActive}
      />

      <div className="scene-card-footer">
        <span className="scene-start-time">{formatTime(startTime)}</span>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
