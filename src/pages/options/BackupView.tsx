import { useRef, useState } from 'react';
import { Download, Upload, FileCode2, FileJson2, FolderInput, CheckCircle2 } from 'lucide-react';
import { store, useApp } from '@/core/store';
import { formatDate } from '@/core/format';
import { downloadText } from '@/ui/download';
import { toJsonBackup, toNetscapeHtml } from '@/core/exportHtml';
import { importHtml, parseJsonBackup, parseNetscapeHtml, type ParsedImport } from '@/core/importHtml';
import { bookmarkService } from '@/core/bookmarks';
import { saveSettings } from '@/core/settings';
import type { BookmarkNode } from '@/core/types';
import type { ConfirmRequest } from '@/ui/components/Modal';
import { TrashPanel } from './TrashPanel';

export function BackupView({ requestConfirm }: { requestConfirm(request: ConfirmRequest): void }) {
  const tree = useApp((state) => state.tree);
  const tags = useApp((state) => state.settings.tags);
  const totalCount = useApp((state) => state.totalCount);
  const folders = useApp((state) => state.folders);

  const htmlRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const pendingText = useRef('');
  const [pending, setPending] = useState<{ name: string; parsed: ParsedImport } | null>(null);
  const [rootName, setRootName] = useState(`导入 ${formatDate(Date.now())}`);
  const [parentId, setParentId] = useState('1');
  const [busy, setBusy] = useState(false);

  const stamp = formatDate(Date.now());

  const exportHtml = () => {
    downloadText(`bookmarks-${stamp}.html`, toNetscapeHtml(tree, tags), 'text/html');
    store.getState().pushToast({ message: `已导出 ${totalCount} 条书签为标准 HTML`, tone: 'success' });
  };

  const exportJson = () => {
    downloadText(`smartbookmark-hub-${stamp}.json`, toJsonBackup(tree, tags), 'application/json');
    store.getState().pushToast({ message: '已导出含标签的 JSON 备份', tone: 'success' });
  };

  const pickHtml = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseNetscapeHtml(text);
      if (!parsed.bookmarks && !parsed.folders) {
        store.getState().pushToast({ message: '文件中没有可导入的书签（仅接受 http/https 链接）', tone: 'warning' });
        return;
      }
      pendingText.current = text;
      setRootName(file.name.replace(/\.html?$/i, '') || `导入 ${stamp}`);
      setPending({ name: file.name, parsed });
    } catch {
      store.getState().pushToast({ message: '无法读取该 HTML 文件', tone: 'danger' });
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const source = pending;
    const text = pendingText.current;
    const name = rootName.trim();
    setPending(null);
    requestConfirm({
      title: '导入书签',
      description: `将在「${folders.find((folder) => folder.id === parentId)?.title ?? '书签栏'}」下新建「${name}」，导入 ${source.parsed.bookmarks} 条书签与 ${source.parsed.folders} 个文件夹。`,
      confirmLabel: '开始导入',
      async onConfirm() {
        setBusy(true);
        await store.getState().mutate('导入完成', async () => {
          await importHtml(text, name, parentId);
        });
        pendingText.current = '';
        setBusy(false);
      },
    });
  };

  const pickJson = async (file: File) => {
    let backupTree: BookmarkNode[];
    let backupTags: Record<string, string[]>;
    try {
      const parsed = parseJsonBackup(await file.text());
      backupTree = parsed.tree;
      backupTags = parsed.tags;
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : 'JSON 备份无法解析',
        tone: 'danger',
      });
      return;
    }

    requestConfirm({
      title: '从 JSON 备份恢复',
      description: '会在目标文件夹下新建一个备份根文件夹，并把标签写回本机设置。现有书签不会被覆盖。',
      confirmLabel: '开始恢复',
      async onConfirm() {
        setBusy(true);
        await store.getState().mutate('JSON 备份已恢复', async () => {
          const root = await bookmarkService.create({ parentId, title: `备份恢复 ${stamp}` });
          const idMap = new Map<string, string>();
          const walk = async (nodes: BookmarkNode[], targetId: string) => {
            for (const node of nodes) {
              if (node.id === '0') {
                await walk(node.children ?? [], targetId);
                continue;
              }
              const created = await bookmarkService.create({ parentId: targetId, title: node.title, url: node.url });
              idMap.set(node.id, created.id);
              if (node.children?.length) await walk(node.children, created.id);
            }
          };
          await walk(backupTree, root.id);

          const merged = { ...store.getState().settings.tags };
          for (const [oldId, list] of Object.entries(backupTags)) {
            const newId = idMap.get(oldId);
            if (newId) merged[newId] = list;
          }
          store.setState({ settings: await saveSettings({ tags: merged }) });
        });
        setBusy(false);
      },
    });
  };

  return (
    <div className="grid h-full gap-3.5 overflow-y-auto p-3.5 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3.5">
        <section className="panel p-3.5">
          <div className="mb-1 flex items-center gap-2">
            <Download size={14} className="text-accent" aria-hidden="true" />
            <h2 className="display text-[14px] text-text">导出备份</h2>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-faint">
            HTML 使用 Chrome / Firefox / Edge 通用的 Netscape 书签格式，可直接在浏览器书签管理器里导入。JSON 额外保留标签。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-primary justify-start" disabled={!totalCount} onClick={exportHtml}>
              <FileCode2 size={14} aria-hidden="true" />
              导出 HTML（{totalCount} 条）
            </button>
            <button type="button" className="btn justify-start" disabled={!totalCount} onClick={exportJson}>
              <FileJson2 size={14} aria-hidden="true" />
              导出 JSON（含标签）
            </button>
          </div>
          <p className="mono mt-2 text-[10.5px] text-text-faint">
            文件名 bookmarks-{stamp}.html · 导出在本机完成，不经过任何服务器
          </p>
        </section>

        <section className="panel p-3.5">
          <div className="mb-1 flex items-center gap-2">
            <Upload size={14} className="text-info" aria-hidden="true" />
            <h2 className="display text-[14px] text-text">导入书签</h2>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-faint">
            支持浏览器导出的 HTML 书签文件，或本扩展的 JSON 备份。导入只会新增内容，不会覆盖现有书签。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn justify-start" disabled={busy} onClick={() => htmlRef.current?.click()}>
              <FileCode2 size={14} aria-hidden="true" />
              选择 HTML 文件
            </button>
            <button type="button" className="btn justify-start" disabled={busy} onClick={() => jsonRef.current?.click()}>
              <FileJson2 size={14} aria-hidden="true" />
              选择 JSON 备份
            </button>
          </div>
          <input
            ref={htmlRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            aria-label="选择 HTML 书签文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void pickHtml(file);
            }}
          />
          <input
            ref={jsonRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="选择 JSON 备份文件"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void pickJson(file);
            }}
          />

          {pending && (
            <div className="mt-3 rounded-[6px] border border-line bg-bg p-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] text-ok">
                <CheckCircle2 size={13} aria-hidden="true" />
                已解析 {pending.name}：{pending.parsed.bookmarks} 条书签、{pending.parsed.folders} 个文件夹
              </div>
              <label className="label mb-1 block" htmlFor="sbh-import-name">新建根文件夹名称</label>
              <input id="sbh-import-name" className="input mb-2" value={rootName} onChange={(event) => setRootName(event.target.value)} />
              <label className="label mb-1 block" htmlFor="sbh-import-target">导入到</label>
              <select id="sbh-import-target" className="input mb-2.5" value={parentId} onChange={(event) => setParentId(event.target.value)}>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {'　'.repeat(Math.min(folder.depth, 4))}
                    {folder.path.join(' / ')}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary" disabled={!rootName.trim() || busy} onClick={confirmImport}>
                  <FolderInput size={13} aria-hidden="true" />
                  预览并导入
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPending(null);
                    pendingText.current = '';
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <TrashPanel requestConfirm={requestConfirm} />
    </div>
  );
}