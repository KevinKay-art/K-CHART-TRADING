import React, { useEffect, useState } from 'react';
import { BottomBar } from './components/BottomBar';
import { ChartPane } from './components/ChartPane';
import { FloatingDrawingToolbar } from './components/FloatingDrawingToolbar';
import { LeftDrawingToolbar } from './components/LeftDrawingToolbar';
import { KChartLogo } from './components/Logo';
import {
  AlertModal,
  DrawingTextModal,
  IndicatorSettingsModal,
  IndicatorsModal,
  LayoutsModal,
  SettingsModal,
  SymbolSearchModal,
} from './components/Modals';
import { RightSidebar } from './components/RightSidebar';
import { ToastContainer } from './components/ToastContainer';
import { TopToolbar } from './components/TopToolbar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTerminalStore } from './store/useTerminalStore';
import { ChartLayoutId } from './types/chart';

function getGridClass(layoutId: ChartLayoutId): string {
  switch (layoutId) {
    case '2v':
      return 'grid-cols-2 grid-rows-1';
    case '2h':
      return 'grid-cols-1 grid-rows-2';
    case '3':
      return 'grid-cols-1 md:grid-cols-3 grid-rows-1';
    case '4':
      return 'grid-cols-1 md:grid-cols-2 grid-rows-2';
    case '6':
      return 'grid-cols-2 md:grid-cols-3 grid-rows-2';
    case '1':
    default:
      return 'grid-cols-1 grid-rows-1';
  }
}

export default function App() {
  useKeyboardShortcuts();

  const theme = useTerminalStore((s) => s.theme);
  const layoutId = useTerminalStore((s) => s.layoutId);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 380);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative h-screen w-screen flex flex-col overflow-hidden bg-[#F8FAFC] dark:bg-[#131722] text-[#0F172A] dark:text-[#D1D4DC]">
      {/* Branded K-CHART VIEW Initial Loading Splash */}
      {booting && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#131722] text-[#D1D4DC] gap-4">
          <KChartLogo className="scale-125" />
          <div className="w-40 h-1 bg-[#1E222D] rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-[#2962FF] animate-pulse rounded-full" />
          </div>
          <span className="text-[11px] text-[#787B86] tracking-wide">
            Initializing K-CHART VIEW Terminal…
          </span>
        </div>
      )}

      {/* Top Terminal Toolbar */}
      <TopToolbar />

      {/* Workspace Body: Left Drawing Toolbar + Center Chart Grid + Right Sidebar */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        <LeftDrawingToolbar />

        <main className="relative flex-1 min-w-0 min-h-0 h-full bg-[#F8FAFC] dark:bg-[#131722]">
          <FloatingDrawingToolbar />
          <div className={`grid w-full h-full gap-px bg-slate-200 dark:bg-[#2A2E39] ${getGridClass(layoutId)}`}>
            {panes.map((pane) => (
              <ChartPane
                key={pane.id}
                pane={pane}
                isActive={pane.id === activePaneId}
                totalPanes={panes.length}
              />
            ))}
          </div>
        </main>

        <RightSidebar />
      </div>

      {/* Bottom Time Range / Scale / Clock / Legal Footer */}
      <BottomBar />

      {/* Modals & Toasts */}
      <SymbolSearchModal />
      <IndicatorsModal />
      <IndicatorSettingsModal />
      <AlertModal />
      <SettingsModal />
      <LayoutsModal />
      <DrawingTextModal />
      <ToastContainer />
    </div>
  );
}
