import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Save, Trash2, FolderInput, Link2, CalendarPlus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { getBackend } from '@/core/backend';
import { bookmarkService } from '@/core/bookmarks';
import { loadSettings, setTags } from '@/core/settings';
import { store, useApp } from '@/core/store';
import { formatDateTime } from '@/core/format';
import { canonicalUrl, displayUrl, isHttpUrl } from '@/core/url';
import type { FlatBookmark, LinkHealth } from '@/core/types';
import { Drawer } from './Drawer';
import { Field } from './Controls';
import { TagEditor } from './TagEditor';
import { Favicon } from './Favicon';

export type EditorTarget =
  | { mode: 'edit'; bookmark: FlatBookmark }
  | { mode: 'create'; parentId: string }
  | null;

const STATUS_TEXT: Record<string, { label: string; color: string }> = {
  ok: { label: '链接可访问', color: 'var(--ok)' },
  dead: { label: '链接失效', color: 'var(--danger)' },
  blocked: { label: '拒绝访问（可能需要登录）', color: 'var(--warn)' },
  error: { label: '检测异常', color: 'var(--warn)' },
  timeout: { label: '响应超时', color: 'var(--warn)' },
  skipped: { label: '未检测', color: 'var(--text-faint)' },
};

export function BookmarkEditor({
  target,
  onClose,
  onDelete,
  health,
}: {
  target: EditorTarget;
  onClose(): void;
  onDelete?(bookmark: FlatBookmark): void;
  health?: LinkHealth;
}) {
  const folders = useApp((state) => state.folders);
  const tagMap = useApp((state) => state.settings.tags);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [parentId, setParentId] = useState('1');
  const [tags, setLocalTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const editing = target?.mode === 'edit' ? target.bookmark : null;

  useEffect(() => {
    if (!target) return;
    if (target.mode === 'edit') {
      const node = target.bookmark;
      setTitle(node.title);
      setUrl(node.url);
      setParentId(node.parentId);
      setLocalTags(store.getState().settings.tags[node.id] ?? []);
    } else {
      setTitle('');
      setUrl('');
      setParentId(target.parentId);
      setLocalTags([]);
    }
  }, [target]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of Object.values(tagMap)) for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [tagMap]);

  if (!target) return null;

  const valid = title.trim().length > 0 && isHttpUrl(url.trim());
  const status = health ? STATUS_TEXT[health.status] : null;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const cleanUrl = url.trim();
    const ok = await store.getState().mutate(editing ? '已保存修改' : '已添加书签', async () => {
      if (editing) {
        if (editing.title !== title.trim() || editing.url !== cleanUrl) {
          await bookmarkService.update(editing.id, { title: title.trim(), url: cleanUrl });
        }
        if (editing.parentId !== parentId) await bookmarkService.move(editing.id, { parentId });
        await setTags(editing.id, tags);
        store.setState({ settings: await loadSettings() });
      } else {
        const created = await bookmarkService.create({ parentId, title: title.trim(), url: cleanUrl });
        if (tags.length) {
          const settings = await setTags(created.id, tags);
          store.setState({ settings });
        }
      }
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Drawer
      open
      title={editing ? editing.title : '新建书签'}
      subtitle={
        editing ? (
          <span className="mono flex items-center gap-1.5">
            <FolderInput size={11} aria-hidden="true" />
            {editing.folderPath.join(' / ') || '书签栏'}
          </span>
        ) : (
          '保存到浏览器原生收藏夹，立即同步'
        )
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary" disabled={!valid || saving} onClick={() => void save()}>
            <Save size={13} aria-hidden="true" />
            {saving ? '保存中…' : editing ? '保存修改' : '添加书签'}
          </button>
          {editing && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => void getBackend().openUrl(editing.url, 'newTab')}
              >
                <ExternalLink size={13} aria-hidden="true" />
                打开
              </button>
              {onDelete && (
                <button type="button" className="btn btn-danger ml-auto" onClick={() => onDelete(editing)}>
                  <Trash2 size={13} aria-hidden="true" />
                  删除
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {editing && (
        <div className="mb-3 flex items-center gap-2.5 rounded-[6px] border border-line bg-bg px-3 py-2.5">
          <Favicon url={editing.url} title={editing.title} size={30} radius={7} />
          <div className="min-w-0 flex-1">
            <div className="mono clamp-1 text-[11.5px] text-text-dim">{displayUrl(editing.url)}</div>
            {status && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: status.color }}>
                {health?.status === 'ok' ? <ShieldCheck size={11} aria-hidden="true" /> : <ShieldAlert size={11} aria-hidden="true" />}
                {status.label}
                {health?.httpStatus ? ` · HTTP ${health.httpStatus}` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      <Field label="标题">
        <input className="input" value={title} aria-label="书签标题" onChange={(event) => setTitle(event.target.value)} placeholder="例如：MDN Web Docs" />
      </Field>

      <Field label="网址" hint={url && !isHttpUrl(url.trim()) ? '仅支持 http / https' : undefined}>
        <input
          className="input mono"
          value={url}
          aria-label="书签网址"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
          spellCheck={false}
        />
      </Field>

      <Field label="所在文件夹">
        <select className="input" value={parentId} aria-label="所在文件夹" onChange={(event) => setParentId(event.target.value)}>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {'　'.repeat(Math.min(folder.depth, 4))}
              {folder.path.join(' / ')}（{folder.totalCount}）
            </option>
          ))}
        </select>
      </Field>

      <Field label="标签" hint="仅本机保存，可用于搜索">
        <TagEditor tags={tags} onChange={setLocalTags} suggestions={allTags} />
      </Field>

      {editing && (
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
          <div className="flex items-center gap-2">
            <dt className="flex w-[76px] shrink-0 items-center gap-1.5 text-text-faint">
              <CalendarPlus size={11} aria-hidden="true" />
              添加于
            </dt>
            <dd className="mono text-text-dim">{formatDateTime(editing.dateAdded)}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="flex w-[76px] shrink-0 items-center gap-1.5 text-text-faint">
              <Link2 size={11} aria-hidden="true" />
              规范化
            </dt>
            <dd className="mono min-w-0 flex-1 break-all text-text-faint">{canonicalUrl(editing.url)}</dd>
          </div>
        </dl>
      )}
    </Drawer>
  );
}