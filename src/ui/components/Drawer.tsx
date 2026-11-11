import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { isTopLayer, popLayer, pushLayer } from '../popupStack';

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
  const panelRef = useRef<HTMLElement>(null);
  // 与 Modal 一致：用 ref 持有 onClose，父组件的内联回调每次渲染都是新引用，
  // 若进入 effect 依赖会导致弹层栈重排与焦点重抢（v2 R6 同类修复）
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const layerId = pushLayer();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopLayer(layerId)) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    // 打开时聚焦面板，键盘用户可直接 Tab 遍历抽屉内容；用 ref 避免全局选择器误选
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      popLayer(layerId);
    };
  }, [open]);

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="drawer-in flex h-full w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface outline-none"
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