import type { ReactNode } from 'react';
import { formatCount } from '@/core/format';

export function StatTile({
  label,
  value,
  hint,
  color = 'var(--accent)',
  icon,
  raw,
}: {
  label: string;
  value: number | string;
  hint?: string;
  color?: string;
  icon?: ReactNode;
  raw?: boolean;
}) {
  return (
    <div className="panel relative overflow-hidden px-3.5 py-2.5">
      <span
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
        aria-hidden="true"
      />
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-faint">
        {icon}
        {label}
      </div>
      <div className="mono mt-1 text-[26px] font-bold leading-none" style={{ color }}>
        {typeof value === 'number' && !raw ? formatCount(value) : value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-text-faint">{hint}</div>}
    </div>
  );
}

export function Progress({
  value,
  max,
  label,
  color = 'var(--accent)',
}: {
  value: number;
  max: number;
  label?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-text-dim">{label}</span>
          <span className="mono text-[12px] font-bold" style={{ color }}>
            {value} / {max} · {pct}%
          </span>
        </div>
      )}
      <div
        className="h-[6px] overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? '进度'}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 55%, #ffffff))` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-line-strong text-accent"
        style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <h3 className="display text-[16px] text-text">{title}</h3>
        <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-text-faint">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="panel flex items-center gap-2.5 p-3">
          <div className="skeleton h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton h-3 w-[70%]" />
            <div className="skeleton h-2.5 w-[45%]" />
          </div>
        </div>
      ))}
    </div>
  );
}