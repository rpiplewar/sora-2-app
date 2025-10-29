import { useState } from 'react';
import '../styles/scene-builder.css';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { SceneCanvas } from '../components/scene-builder/SceneCanvas';
import { PromptEditor } from '../components/scene-builder/PromptEditor';
import { DeltaDisplay } from '../components/scene-builder/DeltaDisplay';
import { VersionControls } from '../components/scene-builder/VersionControls';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { GenerationConfig } from '../types';

export function SceneBuilder() {
  const { error, currentSceneId } = useSceneBuilderStore();

  // Set up undo/redo keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="scene-builder">
      <header>
        <h1>Scene Builder</h1>
        <ApiKeyInput />
        <VersionControls />
      </header>

      {error && <ErrorDisplay error={error} />}

      {!currentSceneId ? (
        <InitialSceneForm />
      ) : (
        <div className="split-view">
          <div className="left-panel">
            <SceneCanvas />
          </div>
          <div className="right-panel">
            <PromptEditor />
            <DeltaDisplay />
          </div>
        </div>
      )}
    </div>
  );
}

function InitialSceneForm() {
  const { createScene, isRemixing } = useSceneBuilderStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);

    const config: GenerationConfig = {
      prompt: formData.get('prompt') as string,
      seconds: Number(formData.get('seconds')),
      size: formData.get('size') as string,
      model: 'sora-2',
      numSegments: 1,
    };

    await createScene(config);
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="initial-scene-form">
      <h2>Create Your First Scene</h2>

      <label>
        Prompt
        <textarea
          name="prompt"
          required
          placeholder="Describe your scene..."
          rows={4}
          disabled={isSubmitting || isRemixing}
        />
      </label>

      <label>
        Duration
        <select name="seconds" required disabled={isSubmitting || isRemixing}>
          <option value="4">4 seconds</option>
          <option value="8">8 seconds</option>
          <option value="12">12 seconds</option>
        </select>
      </label>

      <label>
        Size
        <select name="size" required disabled={isSubmitting || isRemixing}>
          <option value="1280x720">Landscape (1280x720)</option>
          <option value="1792x1024">Landscape Wide (1792x1024)</option>
          <option value="720x1280">Portrait (720x1280)</option>
          <option value="1024x1792">Portrait Tall (1024x1792)</option>
        </select>
      </label>

      <button type="submit" disabled={isSubmitting || isRemixing}>
        {isSubmitting || isRemixing ? 'Generating...' : 'Generate First Scene'}
      </button>
    </form>
  );
}
