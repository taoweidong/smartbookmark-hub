import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Rows3, RotateCcw, ImagePlus, BarChart3 } from 'lucide-react';
import { store, useApp } from '@/core/store';
import type { Settings } from '@/core/types';
import { Segmented } from '@/ui/components/Controls';
import { ACCENTS } from '@/ui/folderHue';
import { BACKGROUND_ASSET_KEY, storeBackgroundImage } from './BackgroundLayer';
import { cache } from '@/core/cache';

const SORTS: { value: Settings['dashboard']['sort']; label: string }[] = [
  { value: 'default', label: '原始顺序' },
  { value: 'recent', label: '最近添加' },
  { value: 'title', label: '标题 A→Z' },
  { value: 'host', label: '按站点' },
];

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10.5px] font-semibold text-text-faint">{label}</span>
      {children}
    </div>
  );
}

export function DisplayControls() {
  const dashboard = useApp((state) => state.settings.dashboard);
  const accent = useApp((state) => state.settings.accent);
  const fileRef = useRef<HTMLInputElement>(null);

  // 拖动/选色过程本地回显，停顿 300ms 才写设置（v2 R6e）
  const [perFolderDraft, setPerFolderDraft] = useState(dashboard.perFolder);
  const perFolderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setPerFolderDraft(dashboard.perFolder), [dashboard.perFolder]);
  const [colorDraft, setColorDraft] = useState(dashboard.background.value || '#101731');
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setColorDraft(dashboard.background.value || '#101731'), [dashboard.background.value]);

  const patch = (value: Partial<Settings['dashboard']>) =>
    void store.getState().updateSettings({ dashboard: value });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await storeBackgroundImage(file);
      await patch({ background: { type: 'image', value: BACKGROUND_ASSET_KEY, revision: Date.now() } });
      store.getState().pushToast({ message: '背景图已更新，仅保存在本机', tone: 'success' });
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '背景图设置失败',
        tone: 'danger',
      });
    }
  };

  return (
    <div
      id="sbh-view-bar"
      role="group"
      aria-label="视图设置"
      className="view-bar-in flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line px-4 py-1.5 lg:px-6"
    >
      <ToolGroup label="布局">
        <Segmented
          label="卡片布局"
          value={dashboard.layout}
          onChange={(value) => patch({ layout: value })}
          options={[
            { value: 'grid', label: <LayoutGrid size={12} aria-hidden="true" />, title: '网格' },
            { value: 'list', label: <Rows3 size={12} aria-hidden="true" />, title: '列表' },
          ]}
        />
      </ToolGroup>

      <ToolGroup label="卡片">
        <Segmented
          label="卡片尺寸"
          value={dashboard.cardSize}
          onChange={(value) => patch({ cardSize: value })}
          options={[
            { value: 'sm', label: 'S', title: '紧凑' },
            { value: 'md', label: 'M', title: '标准' },
            { value: 'lg', label: 'L', title: '宽松' },
          ]}
        />
      </ToolGroup>

      <ToolGroup label="排序">
        <select
          className="input w-auto py-[3px] pr-6 text-[12px]"
          aria-label="文件夹内排序"
          value={dashboard.sort}
          onChange={(event) => patch({ sort: event.target.value as Settings['dashboard']['sort'] })}
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </ToolGroup>

      <ToolGroup label="每组">
        <input
          type="range"
          className="sbh-range w-[86px]"
          min={4}
          max={24}
          step={2}
          aria-label="每个文件夹显示的书签数"
          value={perFolderDraft}
          style={{ ['--pct' as string]: `${((perFolderDraft - 4) / 20) * 100}%` }}
          onChange={(event) => {
            const next = Number(event.target.value);
            setPerFolderDraft(next);
            if (perFolderTimer.current) clearTimeout(perFolderTimer.current);
            perFolderTimer.current = setTimeout(() => patch({ perFolder: next }), 300);
          }}
        />
        <span className="mono w-[18px] text-[11.5px] font-bold text-accent">{dashboard.perFolder}</span>
      </ToolGroup>

      <ToolGroup label="背景">
        <select
          className="input w-auto py-[3px] pr-6 text-[12px]"
          aria-label="背景样式"
          value={dashboard.background.type}
          onChange={(event) => {
            const type = event.target.value as Settings['dashboard']['background']['type'];
            if (type === 'image') {
              void cache.get<string>(BACKGROUND_ASSET_KEY).then((value) => {
                if (value) void patch({ background: { type, value: BACKGROUND_ASSET_KEY } });
                else fileRef.current?.click();
              });
              return;
            }
            // 首次切到纯色即生效：写入默认色而非空值（v2 R6）
            void patch({ background: { type, value: dashboard.background.value || '#101731' } });
          }}
        >
          <option value="aurora">极光</option>
          <option value="solid">纯色</option>
          <option value="image">自定义图片</option>
        </select>
        {dashboard.background.type === 'image' && (
          <button type="button" className="icon-btn h-6 w-6" aria-label="更换背景图片" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={13} aria-hidden="true" />
          </button>
        )}
        {dashboard.background.type === 'solid' && (
          <input
            type="color"
            className="h-6 w-8 cursor-pointer border border-line-strong bg-bg"
            aria-label="背景颜色"
            value={colorDraft}
            onChange={(event) => {
              const next = event.target.value;
              setColorDraft(next);
              if (colorTimer.current) clearTimeout(colorTimer.current);
              colorTimer.current = setTimeout(() => patch({ background: { type: 'solid', value: next } }), 300);
            }}
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="选择背景图片"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </ToolGroup>

      <ToolGroup label="主色">
        <div className="flex items-center gap-1">
          {ACCENTS.map((item) => (
            <button
              key={item.name}
              type="button"
              title={item.label}
              aria-label={`主色 ${item.label}`}
              aria-pressed={accent === item.name}
              onClick={() => void store.getState().updateSettings({ accent: item.name })}
              className="h-[16px] w-[16px] rounded-full border-2 transition-transform duration-150 hover:scale-110"
              style={{
                background: item.swatch,
                borderColor: accent === item.name ? 'var(--text)' : 'transparent',
              }}
            />
          ))}
        </div>
      </ToolGroup>

      <button
        type="button"
        className="btn btn-sm"
        aria-pressed={dashboard.showStats}
        onClick={() => patch({ showStats: !dashboard.showStats })}
        style={dashboard.showStats ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
      >
        <BarChart3 size={12} aria-hidden="true" />
        统计
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-sm"
          title="恢复默认显示设置"
          onClick={() =>
            patch({
              layout: 'grid',
              cardSize: 'md',
              sort: 'default',
              perFolder: 8,
              showStats: true,
              background: { type: 'aurora', value: '' },
            })
          }
        >
          <RotateCcw size={12} aria-hidden="true" />
          重置视图
        </button>
      </div>
    </div>
  );
}