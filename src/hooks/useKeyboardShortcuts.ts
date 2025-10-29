import { useEffect } from 'react';
import { useSceneBuilderStore } from '../stores/sceneBuilderStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl+Z
      if (ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        const { undo } = useSceneBuilderStore.temporal.getState();
        undo();
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      else if (
        (ctrlKey && e.shiftKey && e.key === 'z') ||
        (ctrlKey && e.key === 'y')
      ) {
        e.preventDefault();
        const { redo } = useSceneBuilderStore.temporal.getState();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
