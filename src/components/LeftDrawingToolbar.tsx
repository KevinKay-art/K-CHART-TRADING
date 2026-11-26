import React, { useEffect, useRef, useState } from 'react';
import {
  AlignJustify,
  ArrowUpRight,
  ChevronRight,
  Circle,
  Compass,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Minus,
  MousePointer,
  PenTool,
  Pin,
  Ruler,
  Shapes,
  Smile,
  TrendingDown,
  TrendingUp,
  Trash2,
  Type,
  Unlock,
  ZoomIn,
} from 'lucide-react';
import { DRAWING_TOOLS, DrawingToolMeta } from '../drawings/toolMeta';
import { useTerminalStore } from '../store/useTerminalStore';
import { DrawingToolId } from '../types/chart';

interface ToolGroupDef {
  id: DrawingToolMeta['group'];
  label: string;
  icon: React.ReactNode;
  defaultTool: DrawingToolId;
}

const TOOL_GROUPS: ToolGroupDef[] = [
  { id: 'cursor', label: 'Cursors', icon: <Crosshair className="w-4 h-4" />, defaultTool: 'cross' },
  { id: 'line', label: 'Trend Lines & Channels', icon: <Minus className="w-4 h-4 -rotate-45" />, defaultTool: 'trendLine' },
  { id: 'fib', label: 'Fibonacci Tools', icon: <AlignJustify className="w-4 h-4" />, defaultTool: 'fibRetracement' },
  { id: 'shape', label: 'Geometric Shapes', icon: <Shapes className="w-4 h-4" />, defaultTool: 'rectangle' },
  { id: 'position', label: 'Long & Short Position', icon: <TrendingUp className="w-4 h-4" />, defaultTool: 'longPosition' },
  { id: 'measure', label: 'Measurement', icon: <Ruler className="w-4 h-4" />, defaultTool: 'datePriceRange' },
  { id: 'annotation', label: 'Annotations & Labels', icon: <Type className="w-4 h-4" />, defaultTool: 'text' },
  { id: 'gann', label: 'Pitchfork, Gann & VWAP', icon: <Compass className="w-4 h-4" />, defaultTool: 'andrewsPitchfork' },
];

function getToolIcon(tool: DrawingToolId): React.ReactNode {
  switch (tool) {
    case 'cross':
      return <Crosshair className="w-4 h-4" />;
    case 'dot':
      return <Circle className="w-3.5 h-3.5" />;
    case 'arrowCursor':
      return <MousePointer className="w-4 h-4" />;
    case 'eraser':
      return <Eraser className="w-4 h-4" />;
    case 'zoomIn':
      return <ZoomIn className="w-4 h-4" />;
    case 'arrow':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'brush':
    case 'polyline':
      return <PenTool className="w-4 h-4" />;
    case 'longPosition':
      return <TrendingUp className="w-4 h-4 text-[#26A69A]" />;
    case 'shortPosition':
      return <TrendingDown className="w-4 h-4 text-[#EF5350]" />;
    case 'emoji':
      return <Smile className="w-4 h-4" />;
    default:
      return null;
  }
}

export const LeftDrawingToolbar: React.FC = () => {
  const activeTool = useTerminalStore((s) => s.activeTool);
  const magnetMode = useTerminalStore((s) => s.magnetMode);
  const stayInDrawing = useTerminalStore((s) => s.stayInDrawing);
  const lockAllDrawings = useTerminalStore((s) => s.lockAllDrawings);
  const hideAllDrawings = useTerminalStore((s) => s.hideAllDrawings);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const leftToolbarCollapsed = useTerminalStore((s) => s.leftToolbarCollapsed);

  const setActiveTool = useTerminalStore((s) => s.setActiveTool);
  const setMagnetMode = useTerminalStore((s) => s.setMagnetMode);
  const setStayInDrawing = useTerminalStore((s) => s.setStayInDrawing);
  const setLockAllDrawings = useTerminalStore((s) => s.setLockAllDrawings);
  const setHideAllDrawings = useTerminalStore((s) => s.setHideAllDrawings);
  const removeAllDrawings = useTerminalStore((s) => s.removeAllDrawings);

  const [openGroup, setOpenGroup] = useState<DrawingToolMeta['group'] | null>(null);
  const [groupSelection, setGroupSelection] = useState<Record<string, DrawingToolId>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  if (leftToolbarCollapsed) return null;

  const cycleMagnet = () => {
    const next = magnetMode === 'off' ? 'weak' : magnetMode === 'weak' ? 'strong' : 'off';
    setMagnetMode(next);
  };

  return (
    <aside
      ref={rootRef}
      className="w-11 shrink-0 h-full flex flex-col items-center justify-between py-2 bg-white dark:bg-[#1E222D] border-r border-slate-200 dark:border-[#2A2E39] z-20 select-none"
    >
      {/* Top Tool Groups */}
      <div className="flex flex-col items-center gap-1 w-full px-1">
        {TOOL_GROUPS.map((grp) => {
          const groupTools = DRAWING_TOOLS.filter((t) => t.group === grp.id);
          const selectedInGroup = groupSelection[grp.id] || grp.defaultTool;
          const isGroupActive = groupTools.some((t) => t.id === activeTool);
          const displayTool = isGroupActive ? activeTool : selectedInGroup;
          const customIcon = getToolIcon(displayTool);

          return (
            <div key={grp.id} className="relative w-full flex items-center justify-center">
              <button
                type="button"
                onClick={() => setActiveTool(displayTool)}
                title={DRAWING_TOOLS.find((t) => t.id === displayTool)?.label || grp.label}
                className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                  isGroupActive
                    ? 'bg-[#2962FF]/20 text-[#2962FF]'
                    : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
                }`}
              >
                {customIcon || grp.icon}
              </button>

              {/* Flyout trigger chevron */}
              <button
                type="button"
                aria-label={`${grp.label} menu`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenGroup(openGroup === grp.id ? null : grp.id);
                }}
                className="absolute right-0 bottom-0.5 w-3 h-3 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <ChevronRight className="w-2.5 h-2.5" />
              </button>

              {/* Flyout Menu */}
              {openGroup === grp.id && (
                <div className="absolute left-full top-0 ml-1.5 w-56 max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl py-1 z-50">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-[#2A2E39]">
                    {grp.label}
                  </div>
                  {groupTools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        setActiveTool(tool.id);
                        setGroupSelection((prev) => ({ ...prev, [grp.id]: tool.id }));
                        setOpenGroup(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-[#2A2E39] ${
                        activeTool === tool.id
                          ? 'text-[#2962FF] font-semibold bg-[#2962FF]/10'
                          : 'text-slate-700 dark:text-[#D1D4DC]'
                      }`}
                    >
                      <span className="truncate">{tool.label}</span>
                      {tool.shortcut && (
                        <span className="text-[10px] text-slate-400 font-mono-num ml-2">
                          {tool.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="w-6 h-px bg-slate-200 dark:bg-[#2A2E39] my-1" />

        {/* Zoom-in Box Tool */}
        <button
          type="button"
          onClick={() => setActiveTool(activeTool === 'zoomIn' ? 'cross' : 'zoomIn')}
          title="Zoom In (Drag Box)"
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
            activeTool === 'zoomIn'
              ? 'bg-[#2962FF]/20 text-[#2962FF]'
              : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
          }`}
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Magnet Mode */}
        <button
          type="button"
          onClick={cycleMagnet}
          title={`Magnet Mode: ${magnetMode.toUpperCase()} (Snap to OHLC)`}
          className={`relative w-8 h-8 rounded flex items-center justify-center transition-colors ${
            magnetMode !== 'off'
              ? 'bg-[#2962FF]/20 text-[#2962FF]'
              : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
          }`}
        >
          <Magnet className="w-4 h-4" />
          {magnetMode === 'strong' && (
            <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold px-1 rounded bg-[#2962FF] text-white">
              S
            </span>
          )}
        </button>

        {/* Stay in Drawing Mode */}
        <button
          type="button"
          onClick={() => setStayInDrawing(!stayInDrawing)}
          title="Stay in Drawing Mode"
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
            stayInDrawing
              ? 'bg-[#2962FF]/20 text-[#2962FF]'
              : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
          }`}
        >
          <Pin className="w-4 h-4" />
        </button>

        {/* Lock All Drawings */}
        <button
          type="button"
          onClick={() => setLockAllDrawings(!lockAllDrawings)}
          title={lockAllDrawings ? 'Unlock All Drawings' : 'Lock All Drawings'}
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
            lockAllDrawings
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
          }`}
        >
          {lockAllDrawings ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>

        {/* Hide All Drawings */}
        <button
          type="button"
          onClick={() => setHideAllDrawings(!hideAllDrawings)}
          title={hideAllDrawings ? 'Show All Drawings' : 'Hide All Drawings'}
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
            hideAllDrawings
              ? 'bg-[#2962FF]/20 text-[#2962FF]'
              : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
          }`}
        >
          {hideAllDrawings ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Remove All */}
      <div className="flex flex-col items-center gap-1 w-full px-1">
        <button
          type="button"
          onClick={() => removeAllDrawings(activePane.symbol.symbol)}
          title="Remove All Drawings on Symbol"
          className="w-8 h-8 rounded flex items-center justify-center text-slate-500 hover:text-[#EF5350] hover:bg-slate-100 dark:hover:bg-[#2A2E39] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
