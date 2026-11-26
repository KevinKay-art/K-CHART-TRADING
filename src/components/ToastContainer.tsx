import React from 'react';
import { Bell, CheckCircle2, Info, X } from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';

export const ToastContainer: React.FC = () => {
  const toasts = useTerminalStore((s) => s.toasts);
  const dismissToast = useTerminalStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-11 right-14 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {toasts.map((t) => {
        const icon =
          t.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#26A69A] shrink-0" />
          ) : t.tone === 'warning' ? (
            <Bell className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#2962FF] shrink-0" />
          );
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl text-xs text-slate-800 dark:text-[#D1D4DC]"
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 dark:text-[#F8FAFC] truncate">
                {t.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#9CA3AF] break-words">
                {t.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
