import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export function DeltaDisplay() {
  const { deltaAnalysis } = useSceneBuilderStore();

  if (!deltaAnalysis) return null;

  return (
    <div className="delta-display">
      <h3>Proposed Changes</h3>

      <div className="delta-summary">
        <p><strong>Summary:</strong> {deltaAnalysis.summary}</p>
        <span className={`remix-type ${deltaAnalysis.remix_type}`}>
          {deltaAnalysis.remix_type.replace('_', ' ')}
        </span>
      </div>

      {deltaAnalysis.changes.length > 0 && (
        <div className="delta-changes">
          <h4>Changes:</h4>
          <ul>
            {deltaAnalysis.changes.map((change, i) => (
              <li key={i} className={`change-item ${change.type}`}>
                <span className="change-category">{change.category}:</span>
                <span className="change-description">{change.description}</span>
                {!change.continuity_safe && (
                  <span className="warning-badge">⚠️ May affect continuity</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {deltaAnalysis.preserved.length > 0 && (
        <div className="delta-preserved">
          <h4>Preserved:</h4>
          <p>{deltaAnalysis.preserved.join(', ')}</p>
        </div>
      )}

      {deltaAnalysis.warnings && deltaAnalysis.warnings.length > 0 && (
        <div className="delta-warnings">
          <h4>⚠️ Warnings:</h4>
          <ul>
            {deltaAnalysis.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
