import { useSceneBuilderStore } from '../../stores/sceneBuilderStore';

export const PlannerToggle = () => {
  const { plannerEnabled, togglePlanner } = useSceneBuilderStore();

  return (
    <div className="planner-toggle">
      <label>
        <input type="checkbox" checked={plannerEnabled} onChange={togglePlanner} />
        Enable Planner Mode
      </label>
      {plannerEnabled && (
        <p className="planner-toggle__hint">Planner will generate multi-segment prompts automatically</p>
      )}
    </div>
  );
};
