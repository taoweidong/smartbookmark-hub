import { useEffect, useState } from 'react';
import {
  Palette,
  Search,
  Keyboard,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
  Monitor,
  Sun,
  Moon,
  Database,
  Trash2,
} from 'lucide-react';
import { getBackend } from '@/core/backend';
import { store, useApp } from '@/core/store';
import { resetSettings } from '@/core/settings';
import { cache, CACHE_PREFIX } from '@/core/cache';
import { APP_NAME, OMNIBOX_KEYWORD } from '@/core/constants';
import type { Settings, ThemeMode } from '@/core/types';
import { Segmented, Slider, Switch } from '@/ui/components/Controls';
import { ACCENTS } from '@/ui/folderHue';
import type { ConfirmRequest } from '@/ui/components/Modal';

function Block({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-accent" aria-hidden="true">{icon}</span>
        <h2 className="display text-[14px] text-text">{title}</h2>
      </div>
      {description && <p className="mb-2.5 text-[12px] leading-relaxed text-text-faint">{description}</p>}
      {children}
    </section>
  );
}

export function SettingsView({ requestConfirm }: { requestConfirm(request: ConfirmRequest): void }) {
  const settings = useApp((state) => state.settings);
  const demo = useApp((state) => state.demo);
  const totalCount = useApp((state) => state.totalCount);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    void getBackend().hasHostPermission().then(setGranted);
  }, []);

  const patchSearch = (value: Partial<Settings['search']>) => void store.getState().updateSettings({ search: value });

  return (
    <div className="grid h-full gap-3.5 overflow-y-auto p-3.5 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3.5">
        <Block icon={<Palette size={14} />} title="外观" description="主题与主色会同时应用到首页、弹窗和管理台。">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-dim">主题</span>
            <Segmented<ThemeMode>
              label="主题模式"
              value={settings.theme}
              onChange={(value) => void store.getState().updateSettings({ theme: value })}
              options={[
                { value: 'dark', label: <><Moon size={11} aria-hidden="true" />墨色</> },
                { value: 'light', label: <><Sun size={11} aria-hidden="true" />宣纸</> },
                { value: 'system', label: <><Monitor size={11} aria-hidden="true" />系统</> },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-dim">主色</span>
            <div className="flex items-center gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.name}
                  type="button"
                  aria-label={`主色 ${accent.label}`}
                  aria-pressed={settings.accent === accent.name}
                  onClick={() => void store.getState().updateSettings({ accent: accent.name })}
                  className="flex items-center gap-1.5 rounded-[5px] border px-2 py-1 text-[11.5px] transition-colors"
                  style={{
                    borderColor: settings.accent === accent.name ? accent.swatch : 'var(--line)',
                    color: settings.accent === accent.name ? accent.swatch : 'var(--text-faint)',
                  }}
                >
                  <span className="h-[10px] w-[10px] rounded-full" style={{ background: accent.swatch }} aria-hidden="true" />
                  {accent.label}
                </button>
              ))}
            </div>
          </div>
        </Block>

        <Block icon={<Search size={14} />} title="搜索" description="结果始终按「收藏夹 › 历史记录 › 网页搜索」的顺序分组排列。">
          <Switch
            label="包含历史记录"
            hint={`最近 ${settings.search.historyDays} 天，排在书签之后`}
            checked={settings.search.includeHistory}
            onChange={(value) => patchSearch({ includeHistory: value })}
          />
          <Slider label="历史范围" value={settings.search.historyDays} min={7} max={365} step={1} onChange={(value) => patchSearch({ historyDays: value })} format={(value) => `${value} 天`} />
          <Slider label="最多结果" value={settings.search.maxResults} min={10} max={60} step={5} onChange={(value) => patchSearch({ maxResults: value })} format={(value) => `${value} 条`} />
          <Slider label="输入防抖" value={settings.search.debounceMs} min={0} max={800} step={50} onChange={(value) => patchSearch({ debounceMs: value })} format={(value) => `${value}ms`} />
        </Block>

        <Block icon={<Keyboard size={14} />} title="快捷入口">
          <dl className="space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-dim">地址栏搜索书签</dt>
              <dd className="mono rounded-[4px] border border-line bg-bg px-2 py-0.5 text-[11.5px] text-accent">
                {OMNIBOX_KEYWORD} + 空格
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-dim">打开书签首页</dt>
              <dd className="mono rounded-[4px] border border-line bg-bg px-2 py-0.5 text-[11.5px] text-accent">Ctrl/⌘ + Shift + K</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-dim">唤起快捷搜索</dt>
              <dd className="mono rounded-[4px] border border-line bg-bg px-2 py-0.5 text-[11.5px] text-accent">Ctrl/⌘ + Shift + F</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-dim">页面内聚焦搜索框</dt>
              <dd className="mono rounded-[4px] border border-line bg-bg px-2 py-0.5 text-[11.5px] text-accent">Ctrl/⌘ + K</dd>
            </div>
          </dl>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-text-faint">
            快捷键可在 chrome://extensions/shortcuts 里重新绑定。新标签页接管由 manifest 声明，若要关闭，请在浏览器设置里把新标签页改回默认，或停用本扩展。
          </p>
        </Block>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <Block icon={<ShieldCheck size={14} />} title="隐私与数据" description="所有数据都留在本机，扩展没有任何服务器，也不会发送分析或遥测。">
          <ul className="space-y-1.5 text-[12px] text-text-dim">
            <li className="flex gap-2">
              <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-ok" aria-hidden="true" />
              设置、页签与标签保存在 chrome.storage.local。
            </li>
            <li className="flex gap-2">
              <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-ok" aria-hidden="true" />
              检测报告、回收站与背景图保存在本机 IndexedDB。
            </li>
            <li className="flex gap-2">
              <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-ok" aria-hidden="true" />
              书签读写全部通过 chrome.bookmarks，与原生书签栏实时同步。
            </li>
            <li className="flex gap-2">
              <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-warn" aria-hidden="true" />
              唯一的对外请求是死链检测：向你书签里的网址发送 HEAD/GET，只读取状态码。
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="mono text-[11.5px] text-text-faint">网站访问权限：{granted ? '已授予' : '未授予'}</span>
            {granted ? (
              <button
                type="button"
                className="btn btn-sm ml-auto"
                onClick={() => {
                  void getBackend().removeHostPermission().then((ok) => {
                    setGranted(!ok);
                    store.getState().pushToast({ message: ok ? '已撤销网站访问权限' : '撤销失败', tone: ok ? 'info' : 'danger' });
                  });
                }}
              >
                撤销权限
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm ml-auto"
                onClick={() => {
                  void getBackend().requestHostPermission().then((ok) => {
                    setGranted(ok);
                    store.getState().pushToast({ message: ok ? '已授予网站访问权限' : '未授予权限', tone: ok ? 'success' : 'warning' });
                  });
                }}
              >
                授予权限
              </button>
            )}
          </div>
        </Block>

        <Block icon={<Database size={14} />} title="本机数据" description={`${APP_NAME} 当前管理 ${totalCount} 条书签。`}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                requestConfirm({
                  title: '清除检测缓存',
                  description: '下次检测会重新请求所有链接，书签本身不受影响。',
                  confirmLabel: '清除缓存',
                  async onConfirm() {
                    await cache.clear(CACHE_PREFIX.health);
                    await cache.clear(CACHE_PREFIX.report);
                    store.getState().pushToast({ message: '检测缓存已清除', tone: 'info' });
                  },
                })
              }
            >
              <Trash2 size={12} aria-hidden="true" />
              清除检测缓存
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() =>
                requestConfirm({
                  title: '恢复默认设置',
                  description: '主题、页签、搜索与检测参数都会回到初始值。书签、标签和回收站保持不变。',
                  confirmLabel: '恢复默认',
                  danger: true,
                  async onConfirm() {
                    const next = await resetSettings();
                    store.setState({ settings: next });
                    await store.getState().refresh();
                    store.getState().pushToast({ message: '设置已恢复默认', tone: 'success' });
                  },
                })
              }
            >
              <RotateCcw size={12} aria-hidden="true" />
              恢复默认设置
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void getBackend().openOptions()}>
              <ExternalLink size={12} aria-hidden="true" />
              重新打开管理台
            </button>
          </div>
          {demo && (
            <p className="mt-2.5 rounded-[5px] border border-line bg-bg px-2.5 py-2 text-[11.5px] leading-relaxed text-text-faint">
              当前处于网页预览模式，使用的是示例书签与浏览器 localStorage。加载为 Chrome 扩展后会自动切换到真实的 chrome.bookmarks 与 chrome.storage.local。
            </p>
          )}
        </Block>
      </div>
    </div>
  );
}