import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// 品牌版 Chrome 自 M137 起忽略 --load-extension，必须用 Playwright 自带的 Chromium。
function resolveChromium() {
  if (process.env.SBH_CHROME_PATH) return process.env.SBH_CHROME_PATH;
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  const registry =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? resolve(process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData/Local'), 'ms-playwright')
      : process.platform === 'darwin'
        ? resolve(homedir(), 'Library/Caches/ms-playwright')
        : resolve(homedir(), '.cache/ms-playwright'));
  const candidates = existsSync(registry)
    ? readdirSync(registry)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    : [];
  for (const name of candidates) {
    for (const rel of [
      'chrome-win64/chrome.exe',
      'chrome-win/chrome.exe',
      'chrome-linux/chrome',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    ]) {
      const candidate = resolve(registry, name, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('未找到可加载扩展的 Chromium，请先运行 npx playwright install chromium');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const shots = resolve(root, 'test-results');
await mkdir(shots, { recursive: true });

const failures = [];
const consoleErrors = [];
let passed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failures.push(name);
    process.stdout.write(`  FAIL  ${name} ${extra}\n`);
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const send = (status) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : `status ${status}`);
  };
  if (url.pathname === '/gone') return send(404);
  if (url.pathname === '/forbidden') return send(403);
  if (url.pathname === '/slow') return setTimeout(() => send(200), 6000);
  if (url.pathname === '/redirect') {
    res.writeHead(302, { Location: '/ok' });
    res.end();
    return;
  }
  return send(200);
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const fixtureHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">工作</H3>
    <DL><p>
        <DT><A HREF="${base}/ok" ADD_DATE="1700000001">项目看板</A>
        <DT><A HREF="${base}/gone" ADD_DATE="1700000002">已下线文档</A>
        <DT><A HREF="${base}/forbidden" ADD_DATE="1700000003">内网门禁</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">学习</H3>
    <DL><p>
        <DT><A HREF="${base}/ok" ADD_DATE="1700000004">课程主页</A>
        <DT><A HREF="${base}/slow" ADD_DATE="1700000005">慢速站点</A>
        <DT><A HREF="${base}/redirect" ADD_DATE="1700000006">跳转站点</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">工具</H3>
    <DL><p>
        <DT><A HREF="${base}/ok?utm_source=e2e" ADD_DATE="1700000007">项目看板</A>
        <DT><A HREF="${base}/ok" ADD_DATE="1700000008">在线工具</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">空目录</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1700000000">嵌套空</H3>
        <DL><p>
        </DL><p>
    </DL><p>
</DL><p>`;
const fixturePath = resolve(shots, 'fixture-bookmarks.html');
await writeFile(fixturePath, fixtureHtml, 'utf8');

const profile = await mkdtemp(resolve(tmpdir(), 'sbh-e2e-'));
const executablePath = resolveChromium();
process.stdout.write(`Chromium: ${executablePath}\n`);
const context = await chromium.launchPersistentContext(profile, {
  executablePath,
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run', '--no-default-browser-check'],
});

context.on('page', (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${page.url()} :: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${page.url()} :: ${error.message}`));
});

async function shot(page, name) {
  await page.screenshot({ path: resolve(shots, `${name}.png`), fullPage: false });
}

async function noOverflow(page, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name} 无横向溢出`, overflow <= 1, `overflow=${overflow}`);
}

try {
  process.stdout.write('等待扩展 service worker…\n');
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20000 }));
  const extensionId = new URL(sw.url()).host;
  const hub = `chrome-extension://${extensionId}/newtab.html`;
  const options = `chrome-extension://${extensionId}/options.html`;
  const popup = `chrome-extension://${extensionId}/popup.html`;
  process.stdout.write(`扩展 ID ${extensionId}\n`);

  // ---------- 导入夹具 ----------
  process.stdout.write('\n[1] 备份页导入 HTML 夹具\n');
  const page = await context.newPage();
  await page.goto(`${options}#backup`);
  await page.getByRole('button', { name: '选择 HTML 文件' }).waitFor();
  await page.locator('input[aria-label="选择 HTML 书签文件"]').setInputFiles(fixturePath);
  await page.getByText('已解析 fixture-bookmarks.html').waitFor();
  await page.getByRole('button', { name: '预览并导入' }).click();
  await page.getByRole('button', { name: '开始导入' }).click();
  await page.getByText('导入完成').waitFor({ timeout: 15000 });
  check('HTML 导入成功提示', true);

  // ---------- 导出 ----------
  process.stdout.write('\n[2] 导出标准 HTML\n');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出 HTML/ }).click();
  const download = await downloadPromise;
  const exportPath = resolve(shots, 'exported.html');
  await download.saveAs(exportPath);
  const exported = await readFile(exportPath, 'utf8');
  check('导出含 Netscape DOCTYPE', exported.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  check('导出含导入的书签', exported.includes('项目看板') && exported.includes(`${base}/gone`));
  check('导出含书签栏标记', exported.includes('PERSONAL_TOOLBAR_FOLDER="true"'));

  // ---------- 首页 ----------
  process.stdout.write('\n[3] 首页文件夹展示与页签\n');
  await page.goto(hub);
  await page.getByRole('heading', { name: /好|夜深了/ }).first().waitFor();
  await page.getByRole('button', { name: '选择文件夹' }).first().click();
  const dialog = page.getByRole('dialog', { name: /选择文件夹/ });
  await dialog.waitFor();
  for (const name of ['工作', '学习', '工具']) {
    await dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) }).first().click();
  }
  await dialog.getByRole('button', { name: '保存到页签' }).click();
  await page.getByRole('heading', { name: '工作', exact: true }).waitFor();
  check('首页展示勾选的工作文件夹', true);
  check('首页展示学习文件夹', await page.getByRole('heading', { name: '学习', exact: true }).isVisible());
  check('首页卡片渲染书签', await page.getByRole('button', { name: '打开 项目看板' }).first().isVisible());
  await noOverflow(page, '首页 1280');
  await shot(page, 'newtab-1280');

  await page.getByRole('button', { name: '新建页签' }).click();
  await page.getByRole('dialog', { name: '新建页签' }).getByLabel('页签名称').fill('娱乐');
  await page.getByRole('button', { name: '创建并选择文件夹' }).click();
  await page.getByRole('dialog', { name: /选择文件夹/ }).getByRole('button', { name: '取消' }).click();
  check('新页签创建并激活', await page.getByRole('tab', { name: /娱乐/ }).getAttribute('aria-selected') === 'true');
  check('空页签显示引导', await page.getByRole('heading', { name: '这个页签还没有选择文件夹' }).isVisible());
  await page.getByRole('tab', { name: /常用/ }).click();
  await page.getByRole('heading', { name: '工作', exact: true }).waitFor();

  await page.getByRole('button', { name: '列表', exact: true }).click();
  check('列表布局生效', await page.locator('.bookmark-card').first().evaluate((node) => getComputedStyle(node).flexDirection) === 'row');
  await page.getByRole('button', { name: '网格', exact: true }).click();
  await page.getByRole('button', { name: /当前主题/ }).click();
  check('浅色主题生效', await page.evaluate(() => document.documentElement.classList.contains('light')));
  await shot(page, 'newtab-light');
  await page.getByRole('button', { name: /当前主题/ }).click();
  await page.getByRole('button', { name: /当前主题/ }).click();

  // ---------- 搜索 ----------
  process.stdout.write('\n[4] 书签优先搜索与键盘\n');
  const searchInput = page.getByRole('combobox', { name: '全局搜索' });
  await searchInput.click();
  await searchInput.fill('项目');
  await page.getByRole('listbox', { name: '搜索结果' }).waitFor();
  const firstResult = page.getByRole('option').first();
  check('搜索命中书签', (await firstResult.textContent()).includes('项目看板'));
  await searchInput.press('ArrowDown');
  await searchInput.press('ArrowDown');
  const activeText = await page.locator('.result-row[data-active="true"]').textContent();
  check('方向键切换选中项', Boolean(activeText));
  await searchInput.press('Escape');
  check('Esc 关闭结果面板', !(await page.getByRole('listbox', { name: '搜索结果' }).isVisible().catch(() => false)));

  await searchInput.fill('xiangmu');
  await page.getByRole('listbox', { name: '搜索结果' }).waitFor();
  check('全拼匹配命中', (await page.getByRole('option').first().textContent()).includes('项目看板'));

  await searchInput.fill('kanban');
  await page.getByRole('listbox', { name: '搜索结果' }).waitFor();
  check('拼音首字母匹配命中', (await page.getByRole('option').first().textContent()).includes('项目看板'));

  await searchInput.fill('不存在的关键词zzz');
  await page.getByRole('listbox', { name: '搜索结果' }).waitFor();
  const resultTexts = await page.getByRole('option').allTextContents();
  check('无书签时兜底网页搜索', resultTexts.some((text) => text.includes('默认搜索引擎')));
  await shot(page, 'newtab-search');

  await searchInput.fill('项目');
  await page.getByRole('listbox', { name: '搜索结果' }).waitFor();
  const opened = context.waitForEvent('page');
  await searchInput.press('Control+Enter');
  const openedPage = await opened;
  await openedPage.waitForLoadState('domcontentloaded');
  check('Ctrl+Enter 新标签页打开书签', openedPage.url().startsWith(base));
  await openedPage.close();
  await searchInput.press('Escape');

  // ---------- 管理台 CRUD ----------
  process.stdout.write('\n[5] 管理台增删改与撤销\n');
  await page.goto(`${options}#bookmarks`);
  await page.getByRole('button', { name: '新建书签' }).first().click();
  const drawer = page.getByRole('dialog', { name: '新建书签' });
  await drawer.getByLabel('书签标题').fill('端到端新增');
  await drawer.getByLabel('书签网址').fill(`${base}/ok`);
  await drawer.getByRole('button', { name: '添加书签' }).click();
  await page.getByText('已添加书签').waitFor();
  check('新建书签落库', await page.getByRole('button', { name: '端到端新增', exact: false }).first().isVisible());

  await page.getByRole('button', { name: '编辑 端到端新增' }).click();
  const editDrawer = page.getByRole('dialog', { name: '端到端新增' });
  await editDrawer.getByLabel('书签标题').fill('端到端改名');
  await editDrawer.getByLabel('添加标签').fill('e2e');
  await editDrawer.getByLabel('添加标签').press('Enter');
  await editDrawer.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('已保存修改').waitFor();
  check('重命名生效', await page.getByRole('button', { name: '编辑 端到端改名' }).isVisible());

  await page.getByRole('button', { name: '删除 端到端改名' }).click();
  await page.getByRole('dialog', { name: '删除 1 项' }).getByRole('button', { name: '确认删除' }).click();
  await page.getByRole('button', { name: '撤销' }).waitFor();
  check('删除后出现撤销', true);
  check('删除后行消失', !(await page.getByRole('button', { name: '编辑 端到端改名' }).isVisible().catch(() => false)));
  await page.getByRole('button', { name: '撤销' }).click();
  await page.getByText(/已恢复 1 项/).waitFor();
  check('撤销恢复书签', await page.getByRole('button', { name: '编辑 端到端改名' }).isVisible());
  await shot(page, 'options-bookmarks');
  await noOverflow(page, '管理台 1280');

  // ---------- 智能清理 ----------
  process.stdout.write('\n[6] 智能清理真实 HTTP 检测\n');
  await page.goto(`${options}#cleaner`);
  await page.getByRole('slider', { name: '单条超时' }).fill('2000');
  await page.getByRole('slider', { name: '同域名间隔' }).fill('0');
  await page.getByRole('slider', { name: '并发请求数' }).fill('3');
  await page.getByRole('button', { name: '开始全面检测' }).first().click();
  await page.getByText(/检测完成：/).waitFor({ timeout: 60000 });
  await page.getByRole('tab', { name: /失效链接/ }).click();
  check('检出 404 失效链接', await page.getByText('已下线文档').first().isVisible());
  await page.getByRole('tab', { name: /访问受限/ }).click();
  check('检出 403 受限链接', await page.getByText('内网门禁').first().isVisible());
  await page.getByRole('tab', { name: /检测异常/ }).click();
  check('检出超时链接', await page.getByText('慢速站点').first().isVisible());
  await page.getByRole('tab', { name: /重复书签/ }).click();
  check('检出重复分组', await page.getByText('同一网址').first().isVisible());
  await page.getByRole('tab', { name: /空文件夹/ }).click();
  check('检出嵌套空文件夹', await page.getByText(/空目录/).first().isVisible());
  await shot(page, 'options-cleaner');

  await page.getByRole('tab', { name: /失效链接/ }).click();
  await page.getByRole('button', { name: /清理全部 1 条/ }).click();
  await page.getByRole('dialog', { name: '删除 1 项' }).getByRole('button', { name: '确认删除' }).click();
  await page.getByText('已删除 1 项，可在回收站恢复').waitFor();
  check('清理失效链接成功', true);

  await page.goto(`${options}#backup`);
  await page.getByRole('button', { name: '恢复', exact: true }).first().click();
  await page.getByText(/已恢复 1 项/).waitFor();
  check('回收站恢复成功', true);

  // ---------- 弹窗 ----------
  process.stdout.write('\n[7] 弹窗 360x560\n');
  const popupPage = await context.newPage();
  await popupPage.setViewportSize({ width: 360, height: 560 });
  await popupPage.goto(popup);
  await popupPage.getByRole('combobox', { name: '全局搜索' }).waitFor();
  await popupPage.getByRole('combobox', { name: '全局搜索' }).fill('项目');
  await popupPage.getByRole('listbox', { name: '搜索结果' }).waitFor();
  check('弹窗搜索命中', (await popupPage.getByRole('option').first().textContent()).includes('项目看板'));
  await noOverflow(popupPage, '弹窗 360');
  await shot(popupPage, 'popup-360');
  await popupPage.close();

  // ---------- 宽屏 ----------
  process.stdout.write('\n[8] 1920x1080 布局\n');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(hub);
  await page.getByRole('heading', { name: '工作', exact: true }).waitFor();
  await noOverflow(page, '首页 1920');
  await shot(page, 'newtab-1920');
  await page.goto(`${options}#bookmarks`);
  await page.getByRole('button', { name: '新建书签' }).first().waitFor();
  await noOverflow(page, '管理台 1920');
  await shot(page, 'options-1920');

  // ---------- 控制台 ----------
  process.stdout.write('\n[9] 控制台错误\n');
  const realErrors = consoleErrors.filter((line) => !/favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_ABORTED/.test(line));
  check('无运行时控制台错误', realErrors.length === 0, realErrors.slice(0, 6).join(' | '));
} catch (error) {
  failures.push(`脚本异常: ${error.message}`);
  process.stdout.write(`\n脚本异常: ${error.stack}\n`);
} finally {
  await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

process.stdout.write(`\n通过 ${passed} 项，失败 ${failures.length} 项\n`);
if (failures.length) {
  process.stdout.write(failures.map((item) => ` - ${item}`).join('\n') + '\n');
  process.exit(1);
}