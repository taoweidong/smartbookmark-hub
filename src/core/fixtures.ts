import type { BookmarkNode, HistoryItem } from './types';

const DAY = 86_400_000;
const now = Date.now();

let seq = 100;
function nextId(): string {
  seq += 1;
  return String(seq);
}

function site(title: string, url: string, daysAgo: number): BookmarkNode {
  return { id: nextId(), title, url, dateAdded: now - daysAgo * DAY, index: 0 };
}

function folder(title: string, children: BookmarkNode[], daysAgo = 200): BookmarkNode {
  const id = nextId();
  return {
    id,
    title,
    dateAdded: now - daysAgo * DAY,
    dateGroupModified: now - Math.max(1, daysAgo - 30) * DAY,
    children: children.map((child, index) => ({ ...child, parentId: id, index })),
  };
}

export function createFixtureTree(): BookmarkNode[] {
  seq = 100;

  const work = folder('工作', [
    site('飞书文档 - 季度规划', 'https://bytedance.feishu.cn/docs/quarterly-plan', 12),
    site('Jira - 项目看板', 'https://jira.atlassian.com/secure/RapidBoard.jspa?projectKey=SBH', 45),
    site('Confluence - 架构设计文档', 'https://confluence.atlassian.com/doc/architecture-design', 90),
    site('GitHub - Hello-Chrome-Extension', 'https://github.com/taoweidong/Hello-Chrome-Extension', 3),
    site('GitHub - Hello-Chrome-Extension', 'https://github.com/taoweidong/Hello-Chrome-Extension?utm_source=wechat', 60),
    site('Figma - 设计系统组件库', 'https://www.figma.com/design/design-system', 22),
    site('Notion - 团队知识库', 'https://www.notion.so/team-wiki', 8),
    site('Linear - 迭代任务', 'https://linear.app/team/issue/SBH-128', 5),
    site('公司内网 - VPN 门户', 'https://vpn.example-corp.com/portal', 300),
    folder('会议记录', [
      site('2026 Q4 路线图评审', 'https://bytedance.feishu.cn/docs/q4-roadmap-review', 15),
      site('周会纪要模板', 'https://bytedance.feishu.cn/docs/weekly-template', 120),
    ], 150),
    folder('归档', [], 400),
  ], 500);

  const study = folder('学习', [
    site('MDN Web Docs - JavaScript 指南', 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide', 30),
    site('Chrome 扩展开发文档 - Manifest V3', 'https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3', 6),
    site('React 官方中文文档', 'https://zh-hans.react.dev/learn', 18),
    site('TypeScript 手册', 'https://www.typescriptlang.org/docs/handbook/intro.html', 75),
    site('Vite 官方文档', 'https://vite.dev/guide/', 10),
    site('Tailwind CSS 文档', 'https://tailwindcss.com/docs/installation', 10),
    site('Rust 程序设计语言', 'https://course.rs/about-book.html', 210),
    site('Coursera - 机器学习专项课程', 'https://www.coursera.org/specializations/machine-learning-introduction', 160),
    site('LeetCode - 热题 100', 'https://leetcode.cn/studyplan/top-100-liked/', 2),
    site('掘金 - 前端性能优化专栏', 'https://juejin.cn/column/frontend-performance', 4),
    site('知乎 - 如何评价 Manifest V3', 'https://www.zhihu.com/question/manifest-v3', 7),
    site('知乎 - 收藏夹管理方法论', 'https://www.zhihu.com/question/bookmark-management', 40),
    folder('论文', [
      site('Attention Is All You Need', 'https://arxiv.org/abs/1706.03762', 240),
      site('Denoising Diffusion Probabilistic Models', 'https://arxiv.org/abs/2006.11239', 240),
    ], 260),
  ], 600);

  const tools = folder('工具', [
    site('Excalidraw - 手绘白板', 'https://excalidraw.com/', 1),
    site('Carbon - 代码截图', 'https://carbon.now.sh/', 35),
    site('Regex101 - 正则调试', 'https://regex101.com/', 14),
    site('JSON Crack - 可视化编辑器', 'https://jsoncrack.com/editor', 20),
    site('TinyPNG - 图片压缩', 'https://tinypng.com/', 55),
    site('Squoosh - 图片压缩', 'https://squoosh.app/', 55),
    site('Can I use - 兼容性查询', 'https://caniuse.com/?search=container%20queries', 9),
    site('DevDocs - 离线文档聚合', 'https://devdocs.io/', 26),
    site('Hoppscotch - API 调试', 'https://hoppscotch.io/', 11),
    site('临时失效页面', 'https://dead-link.example.org/removed-page', 180),
    site('旧版工具站（已下线）', 'https://old-tool.example.net/legacy', 500),
    folder('旧项目', [folder('素材', [], 700)], 700),
  ], 450);

  const reading = folder('阅读', [
    site('少数派 - 数字生活指南', 'https://sspai.com/', 1),
    site('Hacker News', 'https://news.ycombinator.com/', 0),
    site('阮一峰的网络日志 - 科技爱好者周刊', 'https://www.ruanyifeng.com/blog/weekly/', 3),
    site('Paul Graham - Essays', 'https://www.paulgraham.com/articles.html', 130),
    site('Stratechery by Ben Thompson', 'https://stratechery.com/', 88),
    site('微信读书 - 书架', 'https://weread.qq.com/web/shelf', 2),
    site('豆瓣 - 想读的书', 'https://book.douban.com/mine?status=wish', 65),
    site('The Verge - Tech', 'https://www.theverge.com/tech', 1),
    site('Ars Technica', 'https://arstechnica.com/', 4),
    site('MIT Technology Review', 'https://www.technologyreview.com/', 42),
  ], 380);

  const fun = folder('娱乐', [
    site('哔哩哔哩 - 收藏夹', 'https://space.bilibili.com/123456/favlist', 1),
    site('YouTube - Watch Later', 'https://www.youtube.com/playlist?list=WL', 2),
    site('Spotify - 每周新发现', 'https://open.spotify.com/playlist/discover-weekly', 6),
    site('网易云音乐 - 我喜欢的音乐', 'https://music.163.com/#/playlist?id=liked', 13),
    site('Steam - 愿望单', 'https://store.steampowered.com/wishlist/', 21),
    site('豆瓣电影 - Top 250', 'https://movie.douban.com/top250', 100),
    site('小红书 - 旅行攻略收藏', 'https://www.xiaohongshu.com/user/profile/travel', 17),
    site('马蜂窝 - 京都行程规划', 'https://www.mafengwo.cn/gonglve/kyoto.html', 44),
  ], 320);

  const bar: BookmarkNode = {
    id: '1',
    parentId: '0',
    title: '书签栏',
    dateAdded: now - 900 * DAY,
    index: 0,
    children: [
      site('Google 翻译', 'https://translate.google.com/?sl=auto&tl=zh-CN', 200),
      site('高德地图', 'https://www.amap.com/', 150),
      site('GitHub', 'https://github.com/', 90),
      work,
      study,
      tools,
      reading,
      fun,
    ].map((child, index) => ({ ...child, parentId: '1', index })),
  };

  const other: BookmarkNode = {
    id: '2',
    parentId: '0',
    title: '其他书签',
    dateAdded: now - 900 * DAY,
    index: 1,
    children: [
      site('稍后读 - 扩展 CSP 详解', 'https://developer.chrome.com/docs/extensions/develop/migrate/content-security-policy', 5),
      site('稍后读 - IndexedDB 最佳实践', 'https://web.dev/articles/indexeddb-best-practices', 12),
      folder('待整理', [], 30),
    ].map((child, index) => ({ ...child, parentId: '2', index })),
  };

  const mobile: BookmarkNode = {
    id: '3',
    parentId: '0',
    title: '移动版书签',
    dateAdded: now - 400 * DAY,
    index: 2,
    children: [],
  };

  return [
    {
      id: '0',
      title: '',
      dateAdded: now - 900 * DAY,
      children: [bar, other, mobile],
    },
  ];
}

export function createFixtureHistory(): HistoryItem[] {
  const entries: [string, string, number][] = [
    ['chrome.bookmarks | API | Chrome for Developers', 'https://developer.chrome.com/docs/extensions/reference/api/bookmarks', 0.2],
    ['Manifest V3 迁移指南 - 掘金', 'https://juejin.cn/post/manifest-v3-migration', 0.5],
    ['React useSyncExternalStore 用法讨论 - 知乎', 'https://www.zhihu.com/question/use-sync-external-store', 1],
    ['Vite 8 发布说明', 'https://vite.dev/blog/announcing-vite8', 1.5],
    ['Playwright 加载 Chrome 扩展测试 - Stack Overflow', 'https://stackoverflow.com/questions/playwright-load-extension', 2],
    ['Tailwind CSS 4 @theme 指令详解', 'https://tailwindcss.com/docs/theme', 3],
    ['GitHub - taoweidong', 'https://github.com/taoweidong', 0.1],
    ['少数派 - 我的书签管理流', 'https://sspai.com/post/bookmark-workflow', 4],
    ['pinyin-pro 使用文档', 'https://pinyin-pro.cn/use/pinyin.html', 2.5],
    ['Netscape Bookmark File Format 说明', 'https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa753582(v=vs.85)', 6],
    ['Hacker News - 关于书签的讨论', 'https://news.ycombinator.com/item?id=bookmarks', 0.8],
    ['哔哩哔哩 - Chrome 扩展开发教程', 'https://www.bilibili.com/video/chrome-extension-tutorial', 5],
  ];
  return entries.map(([title, url, daysAgo]) => ({
    title,
    url,
    lastVisitTime: now - daysAgo * DAY,
  }));
}