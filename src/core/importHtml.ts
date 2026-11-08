import { bookmarkService } from './bookmarks';
import { isHttpUrl } from './url';
import type { BookmarkNode } from './types';

export interface ParsedImport {
  folders: number;
  bookmarks: number;
  tree: BookmarkNode[];
}

let seq = 0;
function tempId(): string {
  seq += 1;
  return `import-${seq}`;
}

export function parseNetscapeHtml(html: string): ParsedImport {
  seq = 0;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let folders = 0;
  let bookmarks = 0;

  const parseDl = (dl: Element): BookmarkNode[] => {
    const out: BookmarkNode[] = [];
    for (const dt of Array.from(dl.children).filter((child) => child.tagName === 'DT')) {
      const heading = dt.querySelector(':scope > H3');
      const anchor = dt.querySelector(':scope > A');
      const nested = dt.querySelector(':scope > DL');

      if (heading) {
        folders += 1;
        const children = nested ? parseDl(nested) : [];
        out.push({
          id: tempId(),
          title: heading.textContent?.trim() || '未命名文件夹',
          dateAdded: Number(heading.getAttribute('ADD_DATE') ?? 0) * 1000 || Date.now(),
          children: children.map((child, index) => ({ ...child, index })),
        });
        continue;
      }

      if (anchor) {
        const href = anchor.getAttribute('HREF') ?? '';
        if (!isHttpUrl(href)) continue;
        bookmarks += 1;
        out.push({
          id: tempId(),
          title: anchor.textContent?.trim() || href,
          url: href,
          dateAdded: Number(anchor.getAttribute('ADD_DATE') ?? 0) * 1000 || Date.now(),
        });
      }
    }
    return out;
  };

  const rootDl = doc.querySelector('DL');
  const tree = rootDl ? parseDl(rootDl) : [];
  return { folders, bookmarks, tree };
}

export async function importHtml(
  html: string,
  rootName: string,
  parentId = '1',
): Promise<{ created: number; folders: number }> {
  const parsed = parseNetscapeHtml(html);
  if (!parsed.bookmarks && !parsed.folders) {
    throw new Error('文件中没有可导入的书签（仅接受 http/https 链接）');
  }

  const root = await bookmarkService.create({ parentId, title: rootName });
  let created = 1;

  const createChildren = async (nodes: BookmarkNode[], targetId: string) => {
    for (const node of nodes) {
      const createdNode = await bookmarkService.create({
        parentId: targetId,
        title: node.title,
        url: node.url,
      });
      created += 1;
      if (node.children?.length) await createChildren(node.children, createdNode.id);
    }
  };

  await createChildren(parsed.tree, root.id);
  return { created, folders: parsed.folders };
}

export function parseJsonBackup(text: string): { tree: BookmarkNode[]; tags: Record<string, string[]> } {
  const data = JSON.parse(text) as { format?: string; tree?: BookmarkNode[]; tags?: unknown };
  if (data.format !== 'smartbookmark-hub' || !Array.isArray(data.tree)) {
    throw new Error('不是 SmartBookmark Hub 的 JSON 备份文件');
  }
  // 逐节点校验形状与 scheme：任何损坏节点都在解析阶段整体拒绝，
  // 不会走到「创建到一半失败留下部分导入」的路径
  const validateNode = (node: unknown): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('备份文件节点数据损坏');
    }
    const candidate = node as { title?: unknown; url?: unknown; children?: unknown };
    if (typeof candidate.title !== 'string') throw new Error('备份文件节点数据损坏');
    if (candidate.url !== undefined) {
      if (typeof candidate.url !== 'string' || !isHttpUrl(candidate.url)) {
        throw new Error('备份文件节点数据损坏');
      }
    }
    if (candidate.children !== undefined) {
      if (!Array.isArray(candidate.children)) throw new Error('备份文件节点数据损坏');
      for (const child of candidate.children) validateNode(child);
    }
  };
  for (const node of data.tree) validateNode(node);

  // 标签必须严格是 string[]：损坏/手改的备份直接丢弃非法项
  const tags: Record<string, string[]> = {};
  if (data.tags && typeof data.tags === 'object') {
    for (const [key, value] of Object.entries(data.tags as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 0 && value.every((tag) => typeof tag === 'string')) {
        tags[key] = value;
      }
    }
  }
  return { tree: data.tree, tags };
}