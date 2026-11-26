import { useEffect } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput) return;

      const store = useTerminalStore.getState();
      const activePane = store.panes.find((p) => p.id === store.activePaneId) || store.panes[0];
      const symbol = activePane.symbol.symbol;
      const mod = e.ctrlKey || e.metaKey;

      // Drawing tool shortcuts (Alt + T / H / V / F)
      if (e.altKey && !mod) {
        const k = e.key.toLowerCase();
        if (k === 't') {
          e.preventDefault();
          store.setActiveTool('trendLine');
          return;
        }
        if (k === 'h') {
          e.preventDefault();
          store.setActiveTool('horizontalLine');
          return;
        }
        if (k === 'v') {
          e.preventDefault();
          store.setActiveTool('verticalLine');
          return;
        }
        if (k === 'f') {
          e.preventDefault();
          store.setActiveTool('fibRetracement');
          return;
        }
      }

      // Undo / Redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redoDrawing(symbol);
        } else {
          store.undoDrawing(symbol);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redoDrawing(symbol);
        return;
      }

      // Copy / Paste drawing
      if (mod && e.key.toLowerCase() === 'c' && store.selectedDrawingId) {
        e.preventDefault();
        store.copySelectedDrawing();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && store.copiedDrawing) {
        e.preventDefault();
        store.pasteCopiedDrawing(symbol);
        return;
      }

      // Quick symbol search
      if ((mod && e.key.toLowerCase() === 'k') || e.key === '/') {
        e.preventDefault();
        store.setSymbolSearchOpen(true);
        return;
      }

      // Delete selected drawing
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedDrawingId) {
        e.preventDefault();
        store.removeDrawing(symbol, store.selectedDrawingId);
        return;
      }

      // Escape: cancel active tool, replay selection, or modals
      if (e.key === 'Escape') {
        if (store.symbolSearchOpen) store.setSymbolSearchOpen(false);
        else if (store.indicatorsModalOpen) store.setIndicatorsModalOpen(false);
        else if (store.settingsModalOpen) store.setSettingsModalOpen(false);
        else if (store.alertsModalOpen) store.setAlertsModalOpen(false);
        else if (store.layoutsModalOpen) store.setLayoutsModalOpen(false);
        else if (store.editingIndicatorId) store.setEditingIndicatorId(null);
        else if (store.editingDrawingTextId) store.setEditingDrawingTextId(null);
        else if (store.replay.selectingStart) store.exitReplay();
        else if (store.activeTool !== 'cross') store.setActiveTool('cross');
        else if (store.selectedDrawingId) store.setSelectedDrawingId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
