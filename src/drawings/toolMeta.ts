import { DrawingObject, DrawingStyle, DrawingToolId, FibLevel } from '../types/chart';

export interface DrawingToolMeta {
  id: DrawingToolId;
  label: string;
  group: 'cursor' | 'line' | 'fib' | 'shape' | 'position' | 'measure' | 'annotation' | 'gann';
  anchors: number; // -1 means multi-point (polyline/brush)
  shortcut?: string;
}

export const DRAWING_TOOLS: DrawingToolMeta[] = [
  // Cursors
  { id: 'cross', label: 'Crosshair', group: 'cursor', anchors: 0, shortcut: 'Esc' },
  { id: 'dot', label: 'Dot Cursor', group: 'cursor', anchors: 0 },
  { id: 'arrowCursor', label: 'Arrow Cursor', group: 'cursor', anchors: 0 },
  { id: 'eraser', label: 'Eraser', group: 'cursor', anchors: 0 },
  { id: 'zoomIn', label: 'Zoom In Box', group: 'cursor', anchors: 2 },

  // Lines
  { id: 'trendLine', label: 'Trend Line', group: 'line', anchors: 2, shortcut: 'Alt+T' },
  { id: 'ray', label: 'Ray', group: 'line', anchors: 2 },
  { id: 'extendedLine', label: 'Extended Line', group: 'line', anchors: 2 },
  { id: 'horizontalLine', label: 'Horizontal Line', group: 'line', anchors: 1, shortcut: 'Alt+H' },
  { id: 'horizontalRay', label: 'Horizontal Ray', group: 'line', anchors: 1 },
  { id: 'verticalLine', label: 'Vertical Line', group: 'line', anchors: 1, shortcut: 'Alt+V' },
  { id: 'crossLine', label: 'Cross Line', group: 'line', anchors: 1 },
  { id: 'parallelChannel', label: 'Parallel Channel', group: 'line', anchors: 3 },
  { id: 'infoLine', label: 'Info Line', group: 'line', anchors: 2 },

  // Fibonacci
  { id: 'fibRetracement', label: 'Fib Retracement', group: 'fib', anchors: 2, shortcut: 'Alt+F' },
  { id: 'fibExtension', label: 'Trend-Based Fib Extension', group: 'fib', anchors: 3 },
  { id: 'fibChannel', label: 'Fib Channel', group: 'fib', anchors: 3 },
  { id: 'fibTimeZones', label: 'Fib Time Zones', group: 'fib', anchors: 2 },

  // Shapes
  { id: 'rectangle', label: 'Rectangle', group: 'shape', anchors: 2 },
  { id: 'rotatedRectangle', label: 'Rotated Rectangle', group: 'shape', anchors: 3 },
  { id: 'circle', label: 'Circle', group: 'shape', anchors: 2 },
  { id: 'ellipse', label: 'Ellipse', group: 'shape', anchors: 3 },
  { id: 'triangle', label: 'Triangle', group: 'shape', anchors: 3 },
  { id: 'polyline', label: 'Polyline / Path', group: 'shape', anchors: -1 },
  { id: 'brush', label: 'Brush', group: 'shape', anchors: -1 },
  { id: 'arrow', label: 'Arrow', group: 'shape', anchors: 2 },
  { id: 'arc', label: 'Arc', group: 'shape', anchors: 3 },

  // Position
  { id: 'longPosition', label: 'Long Position', group: 'position', anchors: 1 },
  { id: 'shortPosition', label: 'Short Position', group: 'position', anchors: 1 },

  // Measurement
  { id: 'priceRange', label: 'Price Range', group: 'measure', anchors: 2 },
  { id: 'dateRange', label: 'Date Range', group: 'measure', anchors: 2 },
  { id: 'datePriceRange', label: 'Date & Price Range', group: 'measure', anchors: 2 },

  // Annotations
  { id: 'text', label: 'Text', group: 'annotation', anchors: 1 },
  { id: 'note', label: 'Note', group: 'annotation', anchors: 1 },
  { id: 'callout', label: 'Callout', group: 'annotation', anchors: 2 },
  { id: 'priceLabel', label: 'Price Label', group: 'annotation', anchors: 1 },
  { id: 'flag', label: 'Flag', group: 'annotation', anchors: 1 },
  { id: 'emoji', label: 'Emoji / Icon', group: 'annotation', anchors: 1 },

  // Gann & Pitchfork / VWAP
  { id: 'pitchfork', label: 'Pitchfork (Schiff)', group: 'gann', anchors: 3 },
  { id: 'andrewsPitchfork', label: "Andrews' Pitchfork", group: 'gann', anchors: 3 },
  { id: 'gannFan', label: 'Gann Fan', group: 'gann', anchors: 2 },
  { id: 'anchoredVwap', label: 'Anchored VWAP', group: 'gann', anchors: 1 },
];

export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { ratio: 0, color: '#787B86', visible: true },
  { ratio: 0.236, color: '#F44336', visible: true },
  { ratio: 0.382, color: '#FF9800', visible: true },
  { ratio: 0.5, color: '#4CAF50', visible: true },
  { ratio: 0.618, color: '#26A69A', visible: true },
  { ratio: 0.786, color: '#29B6F6', visible: true },
  { ratio: 1, color: '#787B86', visible: true },
  { ratio: 1.272, color: '#AB47BC', visible: true },
  { ratio: 1.618, color: '#2962FF', visible: true },
  { ratio: 2.618, color: '#EC407A', visible: true },
];

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#2962FF',
  fillColor: '#2962FF',
  fillOpacity: 0.14,
  opacity: 1,
  lineWidth: 2,
  lineStyle: 'solid',
  extendLeft: false,
  extendRight: false,
  showLabels: true,
  fontSize: 12,
};

export function createDefaultDrawingObject(
  tool: DrawingToolId,
  symbol: string,
  anchors: Array<{ time: number; price: number }>,
  zIndex: number,
  extra?: Partial<DrawingObject>
): DrawingObject {
  const isFib =
    tool === 'fibRetracement' || tool === 'fibExtension' || tool === 'fibChannel';
  const isPos = tool === 'longPosition' || tool === 'shortPosition';

  return {
    id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tool,
    symbol,
    anchors,
    style: {
      ...DEFAULT_DRAWING_STYLE,
      color:
        tool === 'longPosition'
          ? '#26A69A'
          : tool === 'shortPosition'
          ? '#EF5350'
          : tool === 'anchoredVwap'
          ? '#FF9800'
          : '#2962FF',
      fillColor:
        tool === 'longPosition'
          ? '#26A69A'
          : tool === 'shortPosition'
          ? '#EF5350'
          : '#2962FF',
    },
    locked: false,
    visible: true,
    zIndex,
    text:
      tool === 'text'
        ? 'Text'
        : tool === 'note'
        ? 'Trading Note'
        : tool === 'callout'
        ? 'Callout'
        : tool === 'flag'
        ? 'Flag'
        : undefined,
    emoji: tool === 'emoji' ? '🎯' : undefined,
    fibLevels: isFib ? DEFAULT_FIB_LEVELS.map((l) => ({ ...l })) : undefined,
    positionConfig: isPos ? { accountSize: 10000, riskPercent: 1 } : undefined,
    createdAt: Date.now(),
    ...extra,
  };
}

export function getToolMeta(tool: DrawingToolId): DrawingToolMeta {
  return DRAWING_TOOLS.find((t) => t.id === tool) || DRAWING_TOOLS[0];
}
