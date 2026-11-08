import { store, useApp } from '@/core/store';
import { Undo2, X, CheckCircle2, AlertTriangle, OctagonAlert, Info } from 'lucide-react';

const TONE = {
  success: { color: 'var(--ok)', Icon: CheckCircle2 },
  warning: { color: 'var(--warn)', Icon: AlertTriangle },
  danger: { color: 'var(--danger)', Icon: OctagonAlert },
  info: { color: 'var(--info)', Icon: Info },
} as const;

export function Toasts({ compact = false }: { compact?: boolean }) {
  const toasts = useApp((state) => state.toasts);
  if (!toasts.length) return null;

  return (
    <div
      className={`pointer-events-none fixed z-[80] flex flex-col gap-2 ${
        compact ? 'inset-x-3 bottom-3' : 'bottom-5 right-5 w-[340px] max-w-[calc(100vw-24px)]'
      }`}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { color, Icon } = TONE[toast.tone];
        return (
          <div
            key={toast.id}
            className="toast-in panel-raised pointer-events-auto flex items-start gap-2.5 px-3 py-2.5"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <Icon size={15} style={{ color }} className="mt-[2px] shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-text-dim">{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                className="btn btn-sm shrink-0"
                style={{ borderColor: color, color }}
                onClick={() => {
                  toast.undo?.();
                  store.getState().dismissToast(toast.id);
                }}
              >
                <Undo2 size={12} aria-hidden="true" />
                撤销
              </button>
            )}
            <button
              type="button"
              className="icon-btn h-6 w-6 shrink-0"
              aria-label="关闭提示"
              onClick={() => store.getState().dismissToast(toast.id)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}