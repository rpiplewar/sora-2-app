import { useState } from 'react';
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

function HistoryCard({ item, onReusePrompt }: { item: Scene; onReusePrompt: (item: Scene) => void }) {
  const [imgError, setImgError] = useState(false);
  const seconds = item.parameters.seconds;
  const size = item.parameters.size;
  const model = item.parameters.model;

  return (
    <div className="flex-shrink-0 w-52 bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-400 hover:shadow-sm transition-all group">
      {/* Thumbnail */}
      <div className="relative w-full h-28 bg-gray-100 overflow-hidden">
        {item.thumbnailUrl && !imgError ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">
            🎬
          </div>
        )}
        {/* Badge: remix/extension tag */}
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

      {/* Content */}
      <div className="p-3">
        <p className="text-xs text-gray-800 leading-snug line-clamp-2 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          {item.prompt}
        </p>
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{seconds}s</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{size}</span>
          {model === 'sora-2-pro' && (
            <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Pro</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
            {timeAgo(item.createdAt)}
          </span>
          <button
            onClick={() => onReusePrompt(item)}
            className="text-xs font-medium text-gray-900 hover:text-black underline underline-offset-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Use prompt
          </button>
        </div>
      </div>
    </div>
  );
}

export function VideoHistoryPanel({ items, loading, onReusePrompt }: VideoHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

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
            <HistoryCard key={item.id} item={item} onReusePrompt={onReusePrompt} />
          ))}
        </div>
      )}
    </div>
  );
}
