import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
const sizes = [16, 32, 48, 128];

function markSvg(size) {
  const detail = size >= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="gilt" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#ffd07a"/>
      <stop offset="55%" stop-color="#f2b33d"/>
      <stop offset="100%" stop-color="#b8791a"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b2748"/>
      <stop offset="100%" stop-color="#070b18"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#ink)" stroke="#2a3868" stroke-width="1.5"/>
  <path d="M17 9h14a3 3 0 0 1 3 3v27l-10-7.2L14 39V12a3 3 0 0 1 3-3z" fill="url(#gilt)"/>
  ${detail ? '<path d="M20 17.5h8M20 22.5h5.5" stroke="#2a1c00" stroke-width="2" stroke-linecap="round" opacity="0.5"/>' : ''}
  ${detail ? '<circle cx="37.5" cy="11.5" r="3.5" fill="#4cc3ff"/><circle cx="37.5" cy="11.5" r="6.5" fill="none" stroke="#4cc3ff" stroke-width="1" opacity="0.35"/>' : '<circle cx="37" cy="12" r="4.5" fill="#4cc3ff"/>'}
</svg>`;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'chrome' });
  }
}

await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${markSvg(size)}</body></html>`,
    );
    const buffer = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await writeFile(resolve(outDir, `icon${size}.png`), buffer);
    await page.close();
    process.stdout.write(`icon${size}.png ${buffer.length} bytes\n`);
  }
  await writeFile(resolve(outDir, 'mark.svg'), markSvg(128));
} finally {
  await browser.close();
}
process.stdout.write(`icons written to ${outDir}\n`);