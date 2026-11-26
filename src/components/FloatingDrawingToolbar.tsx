import React, { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bell,
  BookmarkPlus,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Sliders,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import { LineStyleType } from '../types/chart';

const COLORS = [
  '#2962FF',
  '#26A69A',
  '#EF5350',
  '#FF9800',
  '#AB47BC',
  '#29B6F6',
  '#EC407A',
  '#D1D4DC',
];

export const FloatingDrawingToolbar: React.FC = () => {
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const selectedDrawingId = useTerminalStore((s) => s.selectedDrawingId);
  const drawingsBySymbol = useTerminalStore((s) => s.drawingsBySymbol);
  const drawingTemplates = useTerminalStore((s) => s.drawingTemplates);

  const updateDrawing = useTerminalStore((s) => s.updateDrawing);
  const removeDrawing = useTerminalStore((s) => s.removeDrawing);
  const cloneDrawing = useTerminalStore((s) => s.cloneDrawing);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const sendToBack = useTerminalStore((s) => s.sendToBack);
  const saveDrawingTemplate = useTerminalStore((s) => s.saveDrawingTemplate);
  const applyDrawingTemplate = useTerminalStore((s) => s.applyDrawingTemplate);
  const setAlertsModalOpen = useTerminalStore((s) => s.setAlertsModalOpen);
  const setEditingDrawingTextId = useTerminalStore((s) => s.setEditingDrawingTextId);
  const pushToast = useTerminalStore((s) => s.pushToast);

  const [detailsOpen, setDetailsOpen] = useState(false);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const symbol = activePane.symbol.symbol;
  const drawings = drawingsBySymbol[symbol] || [];
  const selected = drawings.find((d) => d.id === selectedDrawingId);

  if (!selected) return null;

  const isFib =
    selected.tool === 'fibRetracement' ||
    selected.tool === 'fibExtension' ||
    selected.tool === 'fibChannel';
  const isPosition =
    selected.tool === 'longPosition' || selected.tool === 'shortPosition';
  const isTextTool =
    selected.tool === 'text' ||
    selected.tool === 'note' ||
    selected.tool === 'callout' ||
    selected.tool === 'flag' ||
    selected.tool === 'emoji';
  const canAlert =
    selected.tool === 'horizontalLine' ||
    selected.tool === 'horizontalRay' ||
    selected.tool === 'trendLine';

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white/95 dark:bg-[#1E222D]/95 backdrop-blur-sm shadow-2xl text-xs">
        {/* Color Swatches */}
        <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 dark:border-[#2A2E39]">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                updateDrawing(symbol, selected.id, {
                  style: { ...selected.style, color: c, fillColor: c },
                })
              }
              style={{ backgroundColor: c }}
              className={`w-4 h-4 rounded-sm transition-transform ${
                selected.style.color === c ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
              }`}
              title={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={selected.style.color}
            onChange={(e) =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, color: e.target.value, fillColor: e.target.value },
              })
            }
            className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
            title="Custom Color"
          />
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-1 px-1.5 border-r border-slate-200 dark:border-[#2A2E39]">
          <span className="text-[10px] text-slate-400">Op</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={selected.style.opacity}
            onChange={(e) =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, opacity: Number(e.target.value) },
              })
            }
            className="w-14 accent-[#2962FF]"
          />
        </div>

        {/* Line Width */}
        <div className="flex items-center gap-0.5 px-1 border-r border-slate-200 dark:border-[#2A2E39]">
          {[1, 2, 3, 4].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() =>
                updateDrawing(symbol, selected.id, {
                  style: { ...selected.style, lineWidth: w },
                })
              }
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono-num ${
                selected.style.lineWidth === w
                  ? 'bg-[#2962FF] text-white'
                  : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        {/* Line Style */}
        <div className="flex items-center gap-0.5 px-1 border-r border-slate-200 dark:border-[#2A2E39]">
          {(['solid', 'dashed', 'dotted'] as LineStyleType[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() =>
                updateDrawing(symbol, selected.id, {
                  style: { ...selected.style, lineStyle: st },
                })
              }
              className={`px-1.5 py-0.5 rounded text-[11px] capitalize ${
                selected.style.lineStyle === st
                  ? 'bg-[#2962FF] text-white'
                  : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Extend Left / Right */}
        <div className="flex items-center gap-0.5 px-1 border-r border-slate-200 dark:border-[#2A2E39]">
          <button
            type="button"
            title="Extend Left"
            onClick={() =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, extendLeft: !selected.style.extendLeft },
              })
            }
            className={`px-1.5 py-0.5 rounded text-[11px] ${
              selected.style.extendLeft
                ? 'bg-[#2962FF] text-white'
                : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            ←Ext
          </button>
          <button
            type="button"
            title="Extend Right"
            onClick={() =>
              updateDrawing(symbol, selected.id, {
                style: { ...selected.style, extendRight: !selected.style.extendRight },
              })
            }
            className={`px-1.5 py-0.5 rounded text-[11px] ${
              selected.style.extendRight
                ? 'bg-[#2962FF] text-white'
                : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            Ext→
          </button>
        </div>

        {/* Special Editor (Text / Fib / Position / Templates) */}
        {isTextTool && (
          <button
            type="button"
            onClick={() => setEditingDrawingTextId(selected.id)}
            title="Edit Label / Emoji"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}

        {(isFib || isPosition || drawingTemplates.length > 0) && (
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            title="Tool Parameters & Templates"
            className={`p-1 rounded ${
              detailsOpen
                ? 'bg-[#2962FF] text-white'
                : 'hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}

        {canAlert && (
          <button
            type="button"
            onClick={() =>
              setAlertsModalOpen(true, selected.anchors[0]?.price || null, selected.id)
            }
            title="Add Alert on Drawing"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-amber-400"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => updateDrawing(symbol, selected.id, { locked: !selected.locked })}
          title={selected.locked ? 'Unlock' : 'Lock'}
          className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] ${
            selected.locked ? 'text-amber-400' : 'text-slate-600 dark:text-[#D1D4DC]'
          }`}
        >
          {selected.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => updateDrawing(symbol, selected.id, { visible: !selected.visible })}
          title={selected.visible ? 'Hide' : 'Show'}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          {selected.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => cloneDrawing(symbol, selected.id)}
          title="Clone Drawing"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => bringToFront(symbol, selected.id)}
          title="Bring to Front"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          <ArrowUpToLine className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => sendToBack(symbol, selected.id)}
          title="Send to Back"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            saveDrawingTemplate(`${selected.tool} preset`, selected);
            pushToast({ title: 'Template Saved', message: 'Drawing style preset saved.', tone: 'success' });
          }}
          title="Save Style Template"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => removeDrawing(symbol, selected.id)}
          title="Delete (Del)"
          className="p-1 rounded hover:bg-[#EF5350]/20 text-[#EF5350]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expandable Popover for Fib Levels / Position Account & Risk / Templates */}
      {detailsOpen && (
        <div className="w-80 rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl p-3 text-xs text-slate-800 dark:text-[#D1D4DC]">
          {isFib && selected.fibLevels && (
            <div className="space-y-2">
              <div className="font-semibold text-[11px] uppercase tracking-wider text-slate-400">
                Fibonacci Levels
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {selected.fibLevels.map((lvl, idx) => (
                  <label
                    key={`${lvl.ratio}-${idx}`}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-slate-50 dark:bg-[#131722]"
                  >
                    <input
                      type="checkbox"
                      checked={lvl.visible}
                      onChange={(e) => {
                        const next = selected.fibLevels!.map((l, i) =>
                          i === idx ? { ...l, visible: e.target.checked } : l
                        );
                        updateDrawing(symbol, selected.id, { fibLevels: next });
                      }}
                      className="accent-[#2962FF]"
                    />
                    <input
                      type="color"
                      value={lvl.color}
                      onChange={(e) => {
                        const next = selected.fibLevels!.map((l, i) =>
                          i === idx ? { ...l, color: e.target.value } : l
                        );
                        updateDrawing(symbol, selected.id, { fibLevels: next });
                      }}
                      className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer"
                    />
                    <input
                      type="number"
                      step="0.001"
                      value={lvl.ratio}
                      onChange={(e) => {
                        const next = selected.fibLevels!.map((l, i) =>
                          i === idx ? { ...l, ratio: Number(e.target.value) } : l
                        );
                        updateDrawing(symbol, selected.id, { fibLevels: next });
                      }}
                      className="w-16 bg-transparent font-mono-num focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {isPosition && selected.positionConfig && (
            <div className="space-y-2">
              <div className="font-semibold text-[11px] uppercase tracking-wider text-slate-400">
                Position Risk Calculator
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Account Size ($)</span>
                  <input
                    type="number"
                    value={selected.positionConfig.accountSize}
                    onChange={(e) =>
                      updateDrawing(symbol, selected.id, {
                        positionConfig: {
                          ...selected.positionConfig!,
                          accountSize: Math.max(1, Number(e.target.value) || 10000),
                        },
                      })
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400">Risk (%)</span>
                  <input
                    type="number"
                    step="0.25"
                    value={selected.positionConfig.riskPercent}
                    onChange={(e) =>
                      updateDrawing(symbol, selected.id, {
                        positionConfig: {
                          ...selected.positionConfig!,
                          riskPercent: Math.max(0.05, Number(e.target.value) || 1),
                        },
                      })
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num"
                  />
                </label>
              </div>
            </div>
          )}

          {drawingTemplates.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#2A2E39]">
              <div className="text-[10px] uppercase text-slate-400 mb-1">Apply Style Template</div>
              <div className="flex flex-wrap gap-1">
                {drawingTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyDrawingTemplate(symbol, selected.id, tpl)}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#131722] hover:bg-[#2962FF]/20 text-[11px]"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
