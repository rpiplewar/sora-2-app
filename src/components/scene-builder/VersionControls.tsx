import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export function VersionControls() {
  // Access temporal state from zundo
  const undo = useSceneBuilderStore.temporal.getState().undo;
  const redo = useSceneBuilderStore.temporal.getState().redo;
  const pastStates = useSceneBuilderStore.temporal.getState().pastStates;
  const futureStates = useSceneBuilderStore.temporal.getState().futureStates;

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const handleUndo = () => undo();
  const handleRedo = () => redo();

  return (
    <div className="version-controls">
      <button
        onClick={handleUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="undo-button"
      >
        Undo
      </button>

      <button
        onClick={handleRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className="redo-button"
      >
        Redo
      </button>
    </div>
  );
}
