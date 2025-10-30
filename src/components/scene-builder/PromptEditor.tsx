import { useState } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export const PromptEditor = () => {
  const {
    currentSceneId,
    scenes,
    updatePrompt,
    remixCurrentVersion,
    isRemixing,
    createNewScene,
    isGenerating,
    extendScene,
    isExtending,
  } = useSceneBuilderStore();

  const [newScenePrompt, setNewScenePrompt] = useState('');
  const [extendPrompt, setExtendPrompt] = useState('');
  const [seconds, setSeconds] = useState('8');
  const [size, setSize] = useState('1280x720');

  const currentScene = scenes.find((s) => s.id === currentSceneId);

  if (!currentScene) {
    return (
      <div className="prompt-editor">
        <h3>Create New Scene</h3>
        <textarea
          className="prompt-editor__textarea"
          value={newScenePrompt}
          onChange={(e) => setNewScenePrompt(e.target.value)}
          placeholder="Describe your video scene..."
          rows={6}
        />

        <div className="prompt-editor__parameters">
          <label>
            Duration:
            <select value={seconds} onChange={(e) => setSeconds(e.target.value)}>
              <option value="4">4 seconds</option>
              <option value="8">8 seconds</option>
              <option value="12">12 seconds</option>
            </select>
          </label>

          <label>
            Size:
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <optgroup label="Landscape">
                <option value="1280x720">1280x720 (HD Landscape)</option>
                <option value="1920x1080">1920x1080 (Full HD Landscape)</option>
              </optgroup>
              <optgroup label="Portrait">
                <option value="720x1280">720x1280 (HD Portrait)</option>
                <option value="1080x1920">1080x1920 (Full HD Portrait)</option>
              </optgroup>
            </select>
          </label>
        </div>

        <button
          className="prompt-editor__remix-btn"
          onClick={() => {
            if (newScenePrompt.trim()) {
              createNewScene(newScenePrompt, {
                seconds,
                size,
                model: 'sora-2',
              });
              setNewScenePrompt('');
            }
          }}
          disabled={!newScenePrompt.trim() || isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Create Scene'}
        </button>
      </div>
    );
  }

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updatePrompt(currentSceneId!, e.target.value);
  };

  const handleRemix = () => {
    if (currentScene.prompt.trim()) {
      remixCurrentVersion();
    }
  };

  const handleExtend = () => {
    if (extendPrompt.trim()) {
      extendScene(extendPrompt);
      setExtendPrompt('');
    }
  };

  const hasChanges =
    currentScene.prompt !== currentScene.versions[currentScene.currentVersionIndex].prompt;

  return (
    <div className="prompt-editor">
      <h3>Edit Prompt</h3>
      <textarea
        className="prompt-editor__textarea"
        value={currentScene.prompt}
        onChange={handlePromptChange}
        placeholder="Describe your video scene..."
        rows={6}
      />

      <button
        className="prompt-editor__remix-btn"
        onClick={handleRemix}
        disabled={!hasChanges || isRemixing || currentScene.isLocked}
      >
        {isRemixing ? 'Remixing...' : 'Remix with New Prompt'}
      </button>

      {hasChanges && (
        <p className="prompt-editor__hint">Changes detected. Click "Remix" to generate new version.</p>
      )}

      <hr className="prompt-editor__divider" />

      <h3>Extend Scene</h3>
      <textarea
        className="prompt-editor__textarea"
        value={extendPrompt}
        onChange={(e) => setExtendPrompt(e.target.value)}
        placeholder="Describe what happens next..."
        rows={4}
      />

      <button
        className="prompt-editor__extend-btn"
        onClick={handleExtend}
        disabled={!extendPrompt.trim() || isExtending}
      >
        {isExtending ? 'Extending...' : 'Extend Scene'}
      </button>

      <p className="prompt-editor__hint-small">
        Extend creates a new scene that continues from the last frame of the current scene.
      </p>
    </div>
  );
};
