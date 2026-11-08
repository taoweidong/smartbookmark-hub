import { useEffect, useState } from 'react';
import { cache } from '@/core/cache';
import { useApp } from '@/core/store';

export const BACKGROUND_ASSET_KEY = 'asset:background';

export async function storeBackgroundImage(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('背景图片请小于 8MB');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

  // PNG 透明图转 JPEG 会变黑底，直接保留原 dataURL
  if (file.type.includes('png')) {
    await cache.set(BACKGROUND_ASSET_KEY, dataUrl);
    return;
  }

  const compact = await new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        // 超大图压缩失败（如内存不足）时保留原图，绝不让 Promise 悬挂
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

  await cache.set(BACKGROUND_ASSET_KEY, compact);
}

export function BackgroundLayer() {
  const background = useApp((state) => state.settings.dashboard.background);
  const [image, setImage] = useState<string>('');

  useEffect(() => {
    if (background.type !== 'image') {
      setImage('');
      return;
    }
    let alive = true;
    void cache.get<string>(BACKGROUND_ASSET_KEY).then((value) => {
      if (alive) setImage(value ?? '');
    });
    return () => {
      alive = false;
    };
  }, [background.type, background.value]);

  return (
    <>
      {background.type === 'aurora' && <div className="aurora-layer" aria-hidden="true" />}
      {background.type === 'solid' && background.value && (
        <div className="fixed inset-0 z-0" style={{ background: background.value }} aria-hidden="true" />
      )}
      {background.type === 'image' && image && (
        <div className="fixed inset-0 z-0" aria-hidden="true">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${image}")` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--bg) 82%, transparent) 0%, color-mix(in srgb, var(--bg) 62%, transparent) 40%, color-mix(in srgb, var(--bg) 90%, transparent) 100%)',
            }}
          />
        </div>
      )}
      <div className="grid-layer" aria-hidden="true" />
      <div className="grain-layer" aria-hidden="true" />
    </>
  );
}