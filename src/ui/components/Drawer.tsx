import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex justify-end"
      style={{ background: 'var(--scrim)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-in flex h-full w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface"
        style={{ boxShadow: '-24px 0 60px -30px rgba(0,0,0,0.9)' }}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="display clamp-2 text-[15px] leading-snug text-text">{title}</h2>
            {subtitle && <div className="mt-1 text-[11.5px] text-text-faint">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn" aria-label="关闭详情" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">{footer}</footer>
        )}
      </aside>
    </div>
  );
}