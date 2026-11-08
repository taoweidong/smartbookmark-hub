import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const profile = await mkdtemp(resolve(tmpdir(), 'sbh-probe-'));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: process.argv[2] || undefined,
  channel: process.argv[2] ? undefined : 'chrome',
  headless: false,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
});
await new Promise((r) => setTimeout(r, 4000));
console.log('workers:', ctx.serviceWorkers().map((w) => w.url()));
const page = await ctx.newPage();
await page.goto('chrome://extensions/');
await new Promise((r) => setTimeout(r, 1500));
const text = await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr?.shadowRoot?.querySelector('extensions-item-list');
  const items = list?.shadowRoot?.querySelectorAll('extensions-item') ?? [];
  return Array.from(items).map((i) => i.shadowRoot?.textContent?.replace(/\s+/g, ' ').slice(0, 500));
});
console.log(JSON.stringify(text, null, 2));
console.log('version:', ctx.browser()?.version());
await ctx.close();