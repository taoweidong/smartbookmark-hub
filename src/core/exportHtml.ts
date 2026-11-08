import { escapeHtml } from './format';
import type { BookmarkNode } from './types';

function seconds(ts?: number): string {
  const value = typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now();
  return String(Math.floor(value / 1000));
}

export function toNetscapeHtml(
  tree: BookmarkNode[],
  tags: Record<string, string[]> = {},
): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  const renderNode = (node: BookmarkNode, depth: number) => {
    const pad = '    '.repeat(depth);
    if (node.url) {
      const nodeTags = tags[node.id];
      const tagAttr = nodeTags?.length ? ` TAGS="${escapeHtml(nodeTags.join(','))}"` : '';
      lines.push(
        `${pad}<DT><A HREF="${escapeHtml(node.url)}" ADD_DATE="${seconds(node.dateAdded)}"${tagAttr}>${escapeHtml(node.title)}</A>`,
      );
      return;
    }
    if (node.id === '0') {
      for (const child of node.children ?? []) renderNode(child, depth);
      return;
    }
    const toolbar = node.id === '1' ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';
    lines.push(
      `${pad}<DT><H3 ADD_DATE="${seconds(node.dateAdded)}" LAST_MODIFIED="${seconds(node.dateGroupModified ?? node.dateAdded)}"${toolbar}>${escapeHtml(node.title || '未命名文件夹')}</H3>`,
    );
    lines.push(`${pad}<DL><p>`);
    for (const child of node.children ?? []) renderNode(child, depth + 1);
    lines.push(`${pad}</DL><p>`);
  };

  for (const node of tree) renderNode(node, 1);
  lines.push('</DL><p>');
  return lines.join('\n');
}

export function toJsonBackup(
  tree: BookmarkNode[],
  tags: Record<string, string[]> = {},
): string {
  return JSON.stringify({ format: 'smartbookmark-hub', version: 1, exportedAt: Date.now(), tree, tags }, null, 2);
}