import { useState } from 'react';
import type { PromptFormData } from '../types';

interface PromptFormProps {
  onSubmit: (data: PromptFormData) => void;
  onPlanWithAI?: (data: PromptFormData) => void;
  disabled?: boolean;
  defaultPrompt?: string;
  defaultSeconds?: number;
  defaultSize?: string;
}

export function PromptForm({ onSubmit, onPlanWithAI, disabled = false, defaultPrompt = '', defaultSeconds = 4, defaultSize = '1280x720' }: PromptFormProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [seconds, setSeconds] = useState<number>(defaultSeconds);
  const [numSegments, setNumSegments] = useState<number>(1);
  const [size, setSize] = useState(defaultSize);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      alert('Please enter a video prompt');
      return;
    }

    onSubmit({
      prompt: prompt.trim(),
      seconds,
      numSegments,
      size,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 mb-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          <span className="text-base">✨</span>
          Video Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to generate... Be creative!"
          rows={5}
          disabled={disabled}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all disabled:bg-gray-100 disabled:cursor-not-allowed bg-white resize-none"
          style={{ fontFamily: 'Inter, sans-serif' }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span>⏱️</span>
            Segment Duration
          </label>
          <select
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            disabled={disabled}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all bg-white"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <option value={4}>4 seconds</option>
            <option value={8}>8 seconds</option>
            <option value={12}>12 seconds</option>
            <option value={16}>16 seconds</option>
            <option value={20}>20 seconds</option>
          </select>
        </div>

        <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span>🎞️</span>
            Number of Segments
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={numSegments}
            onChange={(e) => setNumSegments(Number(e.target.value))}
            disabled={disabled}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all bg-white"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          <p className="text-xs text-gray-600 mt-2 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            Total: {seconds * numSegments}s
          </p>
        </div>

        <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span>📐</span>
            Resolution & Orientation
          </label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all bg-white"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <optgroup label="Landscape (16:9)">
              <option value="1280x720">720p HD (1280x720)</option>
              <option value="1792x1024">1024p Pro (1792x1024) - Sora 2 Pro</option>
            </optgroup>
            <optgroup label="Portrait (9:16)">
              <option value="720x1280">Portrait HD (720x1280)</option>
              <option value="1024x1792">Portrait Pro (1024x1792) - Sora 2 Pro</option>
            </optgroup>
          </select>
          <p className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            💡 Pro resolutions require sora-2-pro model
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        {onPlanWithAI && (
          <button
            type="button"
            onClick={() => onPlanWithAI({ prompt: prompt.trim(), seconds, numSegments, size })}
            disabled={disabled || !prompt.trim()}
            className="flex-1 px-8 py-4 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-all font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {disabled ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⚙️</span> Planning...
              </span>
            ) : (
              '🎨 Plan with AI'
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={disabled || !prompt.trim()}
          className="flex-1 px-8 py-4 bg-black text-white rounded-lg hover:bg-gray-800 transition-all font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {disabled ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⚙️</span> Generating...
            </span>
          ) : (
            '✨ Generate Video'
          )}
        </button>
      </div>
    </form>
  );
}
