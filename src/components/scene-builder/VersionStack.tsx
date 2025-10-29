import { useState, useEffect } from 'react';
import type { Scene } from '../../types';
import { useBlobStore } from '../../stores/blobStore';
import { extractFirstFrame } from '../../utils/videoFrameExtractor';

interface VersionStackProps {
  scene: Scene;
  isHovered: boolean;
  isActive: boolean;
}

export function VersionStack({ scene, isHovered }: VersionStackProps) {
  const getBlob = useBlobStore(state => state.getBlob);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());

  // Reverse versions: oldest at top, newest at bottom
  const reversedVersions = [...scene.versions].reverse();

  // Generate thumbnails for current version (lazy load others on hover)
  useEffect(() => {
    const loadThumbnails = async () => {
      const currentVersion = scene.versions.find(v => v.id === scene.currentVersionId);
      if (!currentVersion) return;

      const blob = getBlob(currentVersion.videoBlobId!);
      if (!blob) return;

      try {
        const frameBlob = await extractFirstFrame(blob);
        const url = URL.createObjectURL(frameBlob);

        setThumbnails(prev => {
          const next = new Map(prev);
          next.set(currentVersion.id, url);
          return next;
        });
      } catch (error) {
        console.error('Failed to extract thumbnail:', error);
      }
    };

    loadThumbnails();
  }, [scene.currentVersionId, getBlob, scene.versions]);

  // Load all thumbnails on hover
  useEffect(() => {
    if (!isHovered) return;

    const loadAllThumbnails = async () => {
      for (const version of scene.versions) {
        if (thumbnails.has(version.id)) continue;

        const blob = getBlob(version.videoBlobId!);
        if (!blob) continue;

        try {
          const frameBlob = await extractFirstFrame(blob);
          const url = URL.createObjectURL(frameBlob);

          setThumbnails(prev => {
            const next = new Map(prev);
            next.set(version.id, url);
            return next;
          });
        } catch (error) {
          console.error(`Failed to load thumbnail for ${version.id}:`, error);
        }
      }
    };

    loadAllThumbnails();
  }, [isHovered, scene.versions, getBlob, thumbnails]);

  // Cleanup thumbnails on unmount
  useEffect(() => {
    return () => {
      thumbnails.forEach(url => URL.revokeObjectURL(url));
    };
  }, [thumbnails]);

  return (
    <div className="version-stack">
      {reversedVersions.map((version) => {
        const isCurrent = version.id === scene.currentVersionId;
        const thumbnailUrl = thumbnails.get(version.id);

        // Opacity: current = 1.0, others fade based on age
        const opacity = isCurrent ? 1.0 : isHovered ? 0.6 : 0.3;

        return (
          <div
            key={version.id}
            className={`version-item ${isCurrent ? 'current' : ''}`}
            style={{ opacity }}
            title={version.prompt}
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={`Version ${version.id}`} />
            ) : (
              <div className="version-placeholder">{version.id}</div>
            )}

            {isCurrent && <div className="current-badge">Current</div>}
          </div>
        );
      })}
    </div>
  );
}
