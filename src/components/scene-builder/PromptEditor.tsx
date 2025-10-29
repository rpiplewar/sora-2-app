import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export function PromptEditor() {
  const {
    scenes,
    currentSceneId,
    editedPrompt,
    deltaAnalysis,
    lastFramePreview,
    isAnalyzingDelta,
    isRemixing,
    setEditedPrompt,
    analyzeDelta,
    remixScene,
    approveVersion,
    extendToNextScene,
  } = useSceneBuilderStore();

  const currentScene = scenes.find(s => s.id === currentSceneId);
  const currentVersion = currentScene?.versions.find(
    v => v.id === currentScene.currentVersionId
  );

  const handleAnalyze = async () => {
    await analyzeDelta();
  };

  const handleRemix = async () => {
    await remixScene();
  };

  const handleApprove = async () => {
    await approveVersion();
  };

  const handleExtend = async () => {
    await extendToNextScene();
  };

  const hasChanges = editedPrompt !== currentVersion?.prompt;
  const isLocked = currentScene?.isLocked;

  return (
    <div className="prompt-editor">
      {!isLocked && <h3>Edit Prompt</h3>}
      {isLocked && (
        <div className="next-scene-header">
          <h3>Next Scene</h3>
          {lastFramePreview && (
            <div className="last-frame-preview">
              <p className="preview-label">Continuing from:</p>
              <img src={lastFramePreview} alt="Last frame" className="preview-image" />
            </div>
          )}
        </div>
      )}

      <textarea
        value={editedPrompt}
        onChange={(e) => setEditedPrompt(e.target.value)}
        placeholder={isLocked ? "Describe what happens next..." : "Modify your prompt..."}
        rows={8}
        className="prompt-textarea"
        disabled={isRemixing}
        autoFocus={isLocked}
      />

      <div className="action-buttons">
        {!isLocked && (
          <>
            <button
              onClick={handleAnalyze}
              disabled={!hasChanges || isAnalyzingDelta || isRemixing}
              className="analyze-button"
            >
              {isAnalyzingDelta ? 'Analyzing...' : 'Analyze Changes'}
            </button>

            <button
              onClick={handleRemix}
              disabled={!deltaAnalysis || isRemixing}
              className="remix-button primary"
            >
              {isRemixing ? 'Remixing...' : 'Remix Scene'}
            </button>

            <button
              onClick={handleApprove}
              disabled={isRemixing}
              className="approve-button success"
            >
              {isRemixing ? 'Approving...' : 'Approve & Continue →'}
            </button>
          </>
        )}

        {isLocked && (
          <button
            onClick={handleExtend}
            disabled={isRemixing || !editedPrompt.trim()}
            className="extend-button primary"
            title={!editedPrompt.trim() ? 'Enter a prompt for the next scene' : ''}
          >
            {isRemixing ? 'Generating...' : 'Generate Next Scene'}
          </button>
        )}
      </div>

      {isLocked && !isRemixing && (
        <div className="next-scene-notice">
          ✨ Scene approved! Describe what happens next to continue your story.
        </div>
      )}
    </div>
  );
}
