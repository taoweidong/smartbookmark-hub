import type { ReactNode } from 'react';

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange(value: boolean): void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] text-text-dim">{label}</span>
        {hint && <span className="block text-[11px] text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-[20px] w-[36px] shrink-0 rounded-full border transition-colors duration-150"
        style={{
          background: checked ? 'var(--accent)' : 'var(--surface-3)',
          borderColor: checked ? 'var(--accent)' : 'var(--line-strong)',
        }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all duration-150"
          style={{
            left: checked ? 18 : 2,
            background: checked ? 'var(--accent-ink)' : 'var(--text-faint)',
          }}
        />
      </button>
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  label: string;
  format?(value: number): string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-text-dim">{label}</span>
        <span className="mono text-[12px] font-bold text-accent">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sbh-range w-full"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange(value: T): void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-[6px] border border-line-strong bg-bg p-[2px]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-[3px] text-[12px] font-semibold transition-colors duration-150"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-ink)' : 'var(--text-faint)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        {hint && <span className="text-[11px] text-text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}