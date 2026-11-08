import { useId } from 'react';

interface BrandProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function BrandMark({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gilt`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffd07a" />
          <stop offset="55%" stopColor="#f2b33d" />
          <stop offset="100%" stopColor="#b8791a" />
        </linearGradient>
        <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16203f" />
          <stop offset="100%" stopColor="#070b18" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="12" fill={`url(#${id}-ink)`} stroke="#2a3868" strokeWidth="1.5" />
      <path
        d="M17 9h14a3 3 0 0 1 3 3v27l-10-7.2L14 39V12a3 3 0 0 1 3-3z"
        fill={`url(#${id}-gilt)`}
      />
      <path
        d="M20 17.5h8M20 22.5h5.5"
        stroke="#2a1c00"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="37.5" cy="11.5" r="3.5" fill="#4cc3ff" />
      <circle cx="37.5" cy="11.5" r="6.5" fill="none" stroke="#4cc3ff" strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

export function Brand({ size = 30, withWordmark = true, className = '' }: BrandProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      {withWordmark && (
        <div className="leading-none">
          <div className="display text-[15px] text-text">智能书签管家</div>
          <div className="mono mt-1 text-[9px] tracking-[0.18em] text-text-faint">SMARTBOOKMARK HUB</div>
        </div>
      )}
    </div>
  );
}