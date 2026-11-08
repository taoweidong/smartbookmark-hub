import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { isTopLayer, popLayer, pushLayer } from '../popupStack';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, title, subtitle, onClose, children, footer, width = 520 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const layerId = pushLayer();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopLayer(layerId)) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-close])',
    );
    focusable?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      popLayer(layerId);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise-in panel-raised flex max-h-[86vh] w-full flex-col"
        style={{ maxWidth: width }}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="display text-[16px] text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-text-faint">{subtitle}</p>}
          </div>
          <button type="button" data-close className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  items?: { title: string; detail?: string; tone?: 'danger' | 'warn' | 'info' }[];
  confirmLabel?: string;
  danger?: boolean;
  onConfirm(): void | Promise<void>;
}

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose(): void;
}) {
  if (!request) return null;
  const toneColor = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--info)' } as const;

  return (
    <Modal
      open
      title={request.title}
      subtitle={request.description}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              void request.onConfirm();
              onClose();
            }}
          >
            {request.confirmLabel ?? '确认'}
          </button>
        </>
      }
    >
      {request.items?.length ? (
        <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
          {request.items.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="flex items-baseline gap-2.5 rounded-[5px] border border-line bg-bg px-2.5 py-1.5"
            >
              <span
                className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: toneColor[item.tone ?? 'danger'] }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-[12.5px] text-text-dim">{item.title}</span>
                {item.detail && (
                  <span className="mono clamp-1 block text-[11px] text-text-faint">{item.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-text-dim">此操作会立即生效。</p>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-text-faint">
        <span className="h-[5px] w-[5px] rounded-full bg-ok" aria-hidden="true" />
        删除的内容会进入回收站，可随时恢复。
      </p>
    </Modal>
  );
}