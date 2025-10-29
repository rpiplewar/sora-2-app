import { useEffect } from 'react';
import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';
import { isVideoExpired } from '../../types';

export function PromptEditor() {
  const {
    scenes,
    currentSceneId,
    editedPrompt,
    deltaAnalysis,
    lastFramePreview,
    importedFrom,
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

  // Sync editedPrompt when scene changes (after extending to new scene)
  useEffect(() => {
    if (currentVersion && !editedPrompt) {
      // If editedPrompt is empty (after extending), sync with current version
      setEditedPrompt(currentVersion.prompt);
    }
  }, [currentSceneId, currentVersion?.id]);

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
  const isImportExpired = !!(importedFrom && isVideoExpired(importedFrom));

  return (
    <div className="prompt-editor">
      {!isLocked && <h3>Edit Prompt</h3>}
      {isLocked && (
        <div className="next-scene-header">
          <h3>Next Scene</h3>
          {lastFramePreview && (
            <div className="last-frame-preview">
              <img src={lastFramePreview} alt="Last frame" className="preview-image" />
            </div>
          )}
        </div>
      )}

      {isImportExpired && !isLocked && (
        <div className="expiration-notice">
          ⏰ This video is {">"} 24h old. Remix disabled, but you can extend it.
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
              disabled={!hasChanges || isAnalyzingDelta || isRemixing || isImportExpired}
              className="analyze-button"
              title={isImportExpired ? 'Remix disabled - video >24h old' : ''}
            >
              {isAnalyzingDelta ? 'Analyzing...' : 'Analyze Changes'}
            </button>

            <button
              onClick={handleRemix}
              disabled={!deltaAnalysis || isRemixing || isImportExpired}
              className="remix-button primary"
              title={isImportExpired ? 'Remix disabled - video >24h old' : ''}
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
    </div>
  );
}
