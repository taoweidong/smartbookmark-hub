import { useState } from 'react';
import { faviconUrl, letterAvatar } from '@/core/url';

interface FaviconProps {
  url: string;
  title: string;
  size?: number;
  radius?: number;
}

export function Favicon({ url, title, size = 20, radius = 5 }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(url, size >= 40 ? 64 : 32);
  const avatar = letterAvatar(title || url);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="mono inline-flex shrink-0 items-center justify-center font-bold"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          fontSize: Math.max(9, Math.round(size * 0.46)),
          background: `hsl(${avatar.hue} 62% 22%)`,
          color: `hsl(${avatar.hue} 88% 74%)`,
          border: `1px solid hsl(${avatar.hue} 55% 34%)`,
        }}
      >
        {avatar.letter}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface-3)' }}
    />
  );
}