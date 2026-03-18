import { useState, useEffect, useRef } from 'react';
import type { Scene } from '../services/cloudStorageService';

interface VideoHistoryPanelProps {
  items: Scene[];
  loading: boolean;
  onReusePrompt: (item: Scene) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Video Modal ──────────────────────────────────────────────────────────────

interface VideoModalProps {
  item: Scene;
  onClose: () => void;
  onReusePrompt: (item: Scene) => void;
}

function VideoModal({ item, onClose, onReusePrompt }: VideoModalProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get signed download URL from the API — streams directly, no blob download
    fetch(`/api/get-video-url?videoId=${item.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.downloadUrl) {
          setVideoUrl(data.downloadUrl);
        } else {
          setLoadError(data.error || 'Could not load video');
        }
      })
      .catch(() => setLoadError('Failed to load video URL'));
  }, [item.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div className="flex-1 pr-4">
            <p className="text-sm text-gray-800 line-clamp-2 leading-snug" style={{ fontFamily: 'Inter, sans-serif' }}>
              {item.prompt}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{item.parameters.seconds}s</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{item.parameters.size}</span>
              {item.parameters.model === 'sora-2-pro' && (
                <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pro</span>
              )}
              <span className="text-xs text-gray-400">{timeAgo(item.createdAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Video */}
        <div className="bg-black aspect-video flex items-center justify-center">
          {loadError ? (
            <p className="text-white/60 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{loadError}</p>
          ) : videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-white" />
              <p className="text-white/60 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Loading video...</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => { onReusePrompt(item); onClose(); }}
            className="text-sm font-medium text-gray-900 hover:text-black underline underline-offset-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Use this prompt
          </button>
          {videoUrl && (
            <a
              href={videoUrl}
              download={`sora-${item.id}.mp4`}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Download ↓
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History Card ─────────────────────────────────────────────────────────────

function HistoryCard({ item, onWatch }: {
  item: Scene;
  onReusePrompt?: (item: Scene) => void;
  onWatch: (item: Scene) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={() => onWatch(item)}
      className="flex-shrink-0 w-48 bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-400 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Thumbnail / preview */}
      <div className="relative w-full h-28 bg-gray-100 overflow-hidden">
        {item.thumbnailUrl && !imgError ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <span className="text-3xl opacity-40">🎬</span>
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <span className="text-gray-900 text-sm ml-0.5">▶</span>
          </div>
        </div>

        {/* Badges */}
        {item.isRemix && (
          <span className="absolute top-1.5 left-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
            remix
          </span>
        )}
        {item.isExtension && (
          <span className="absolute top-1.5 left-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
            extend
          </span>
        )}
      </div>

      {/* Text */}
      <div className="p-2.5">
        <p className="text-xs text-gray-800 leading-snug line-clamp-2 mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
          {item.prompt}
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-mono">{item.parameters.seconds}s</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-mono">{item.parameters.size}</span>
          {item.parameters.model === 'sora-2-pro' && (
            <span className="text-xs bg-amber-50 text-amber-600 px-1 py-0.5 rounded">Pro</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          {timeAgo(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function VideoHistoryPanel({ items, loading, onReusePrompt }: VideoHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [watchingItem, setWatchingItem] = useState<Scene | null>(null);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto mt-8 px-4">
        <div className="flex items-center gap-2 text-sm text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="animate-spin text-base">⏳</div>
          Loading history...
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <>
      {watchingItem && (
        <VideoModal
          item={watchingItem}
          onClose={() => setWatchingItem(null)}
          onReusePrompt={onReusePrompt}
        />
      )}

      <div className="max-w-5xl mx-auto mt-8 px-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <span className="text-base">🕐</span>
            Video History
            <span className="text-xs text-gray-400 font-normal">({items.length})</span>
            <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
          </button>
        </div>

        {!collapsed && (
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'thin' }}>
            {items.map((item) => (
              <HistoryCard
                key={item.id}
                item={item}
                onReusePrompt={onReusePrompt}
                onWatch={(i) => setWatchingItem(i)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
