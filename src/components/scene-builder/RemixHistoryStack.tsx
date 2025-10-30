import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export const RemixHistoryStack = () => {
  const { currentSceneId, scenes, selectVersion } = useSceneBuilderStore();

  const currentScene = scenes.find((s) => s.id === currentSceneId);
  if (!currentScene || currentScene.versions.length <= 1) return null;

  return (
    <div className="remix-history-stack">
      <h3>Remix History</h3>
      <div className="remix-history-stack__versions">
        {currentScene.versions.map((version, index) => (
          <div
            key={version.id}
            className={`remix-version ${
              index === currentScene.currentVersionIndex ? 'remix-version--active' : ''
            }`}
            onClick={() => selectVersion(currentSceneId!, index)}
          >
            {version.thumbnailUrl ? (
              <img
                src={version.thumbnailUrl}
                alt={`Version ${index + 1}`}
                className="remix-version__thumbnail"
              />
            ) : (
              <div className="remix-version__thumbnail remix-version__thumbnail--placeholder">
                <span>🎬</span>
              </div>
            )}
            <div className="remix-version__label">
              {index === 0 ? 'Original' : `Remix v${index}`}
            </div>
            <div className="remix-version__prompt">
              {version.prompt.substring(0, 50)}
              {version.prompt.length > 50 ? '...' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
