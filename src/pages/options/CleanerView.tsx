import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Square,
  ShieldAlert,
  Trash2,
  Copy,
  FolderX,
  Link2Off,
  Lock,
  CircleAlert,
  History,
  ExternalLink,
  CheckCheck,
  RefreshCw,
} from 'lucide-react';
import { getBackend } from '@/core/backend';
import { store, useApp } from '@/core/store';
import { formatDateTime, timeAgo } from '@/core/format';
import { displayUrl } from '@/core/url';
import type { ScanReport, Settings } from '@/core/types';
import { clearReports, listReports, runScan } from '@/core/cleaner/scan';
import { openWithFeedback } from '@/ui/openWithFeedback';
import { DebouncedSlider, Switch } from '@/ui/components/Controls';
import { Progress, EmptyState, StatTile } from '@/ui/components/Feedback';
import { Favicon } from '@/ui/components/Favicon';
import type { ConfirmRequest } from '@/ui/components/Modal';
import { useSafeDelete } from '@/ui/hooks/useSafeDelete';
import { demoFetchFor } from './demoScan';

type ReportTab = 'dead' | 'duplicates' | 'empty' | 'blocked' | 'errors';

const TABS: { key: ReportTab; label: string; color: string; Icon: typeof Link2Off }[] = [
  { key: 'dead', label: '失效链接', color: 'var(--danger)', Icon: Link2Off },
  { key: 'duplicates', label: '重复书签', color: 'var(--warn)', Icon: Copy },
  { key: 'empty', label: '空文件夹', color: 'var(--info)', Icon: FolderX },
  { key: 'blocked', label: '访问受限', color: '#f06bd8', Icon: Lock },
  { key: 'errors', label: '检测异常', color: 'var(--text-faint)', Icon: CircleAlert },
];

export function CleanerView({
  requestConfirm,
  onHealthChanged,
}: {
  requestConfirm(request: ConfirmRequest): void;
  onHealthChanged(): void;
}) {
  const scanSettings = useApp((state) => state.settings.scan);
  const flat = useApp((state) => state.flat);
  const demo = useApp((state) => state.demo);

  // 确认框完成后修剪报告中已不存在的书签：清理动作立即反映到列表（v2 R6d）
  const requestConfirmPruning = useCallback(
    (request: ConfirmRequest) => {
      requestConfirm({
        ...request,
        onConfirm: async () => {
          await request.onConfirm();
          const { flat: currentFlat } = store.getState();
          const liveIds = new Set(currentFlat.map((item) => item.id));
          setReport((current) => {
            if (!current) return current;
            const deadLinks = current.deadLinks.filter((item) => liveIds.has(item.bookmark.id));
            const blocked = current.blocked.filter((item) => liveIds.has(item.bookmark.id));
            const errors = current.errors.filter((item) => liveIds.has(item.bookmark.id));
            const duplicates = current.duplicates
              .map((group) => ({ ...group, items: group.items.filter((item) => liveIds.has(item.id)) }))
              .filter((group) => group.items.length >= 2);
            return { ...current, deadLinks, blocked, errors, duplicates };
          });
        },
      });
    },
    [requestConfirm],
  );

  const safeDeleteWithPruning = useSafeDelete(requestConfirmPruning);
  const safeDelete = safeDeleteWithPruning;

  const [report, setReport] = useState<ScanReport | null>(null);
  const [reports, setReports] = useState<ScanReport[]>([]);
  const [scanning, setScanning] = useState(false);
  const [force, setForce] = useState(false);
  const [tab, setTab] = useState<ReportTab>('dead');
  const [granted, setGranted] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);

  const reloadReports = useCallback(async () => {
    setReports(await listReports());
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const ok = await getBackend().hasHostPermission();
        if (!alive) return;
        setGranted(ok);
        const all = await listReports();
        if (!alive) return;
        setReports(all);
        if (all[0]) setReport(all[0]);
      } catch {
        // 权限/报告读取失败：按未授予与空列表处理，不产生 unhandled rejection
        if (alive) setGranted(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = (value: Partial<Settings['scan']>) => void store.getState().updateSettings({ scan: value });

  const start = async (resume: boolean) => {
    // scanning 是异步 state，快速双击可能双开扫描；用同步 ref 兜底
    if (scanning || startingRef.current) return;
    startingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    try {
      const result = await runScan({
        ...scanSettings,
        force,
        reportId: resume ? report?.id : undefined,
        signal: controller.signal,
        onProgress: setReport,
        fetchImpl: demo ? demoFetchFor(flat) : undefined,
      });
      setReport(result);
      await reloadReports();
      onHealthChanged();
      store.getState().pushToast({
        message: result.cancelled
          ? `已暂停，完成 ${result.checked}/${result.total}，可随时继续`
          : `检测完成：${result.deadLinks.length} 条失效、${result.duplicates.length} 组重复、${result.emptyFolders.length} 个空文件夹`,
        tone: result.cancelled ? 'info' : 'success',
      });
    } catch (error) {
      store.getState().pushToast({
        message: error instanceof Error ? error.message : '检测失败',
        tone: 'danger',
      });
    } finally {
      setScanning(false);
      abortRef.current = null;
      startingRef.current = false;
    }
  };

  const counts = useMemo(
    () => ({
      dead: report?.deadLinks.length ?? 0,
      duplicates: report?.duplicates.length ?? 0,
      empty: report?.emptyFolders.length ?? 0,
      blocked: report?.blocked.length ?? 0,
      errors: report?.errors.length ?? 0,
    }),
    [report],
  );

  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];
  const resumable = Boolean(report && !report.finishedAt && report.checked < report.total);

  return (
    <div className="flex h-full gap-3.5 overflow-y-auto p-3.5">
      <aside className="flex w-[290px] shrink-0 flex-col gap-3">
        <section className="panel p-3">
          <h2 className="display mb-1 text-[14px] text-text">检测参数</h2>
          <p className="mb-2 text-[11.5px] leading-relaxed text-text-faint">
            并发与延迟越低越不容易被目标站点限流。默认值适合几千条书签。
          </p>
          <DebouncedSlider label="并发请求数" value={scanSettings.concurrency} min={1} max={10} onCommit={(value) => patch({ concurrency: value })} />
          <DebouncedSlider label="单条超时" value={scanSettings.timeoutMs} min={2000} max={20000} step={1000} onCommit={(value) => patch({ timeoutMs: value })} format={(value) => `${value / 1000}s`} />
          <DebouncedSlider label="同域名间隔" value={scanSettings.hostDelayMs} min={0} max={2000} step={50} onCommit={(value) => patch({ hostDelayMs: value })} format={(value) => `${value}ms`} />
          <DebouncedSlider label="结果缓存" value={scanSettings.cacheDays} min={1} max={30} onCommit={(value) => patch({ cacheDays: value })} format={(value) => `${value} 天`} />
          <DebouncedSlider label="标题相似度阈值" value={scanSettings.titleThreshold} min={0.5} max={1} step={0.01} onCommit={(value) => patch({ titleThreshold: value })} format={(value) => value.toFixed(2)} />
          <div className="mt-1 border-t border-line pt-1">
            <Switch label="忽略 www 前缀" hint="www.a.com 与 a.com 视为同一地址" checked={scanSettings.ignoreWww} onChange={(value) => patch({ ignoreWww: value })} />
            <Switch label="忽略缓存重新检测" hint="对每条链接都发起新请求" checked={force} onChange={setForce} />
          </div>
        </section>

        {!granted && (
          <section className="panel p-3" style={{ borderColor: 'var(--warn)' }}>
            <div className="mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--warn)' }}>
              <ShieldAlert size={14} aria-hidden="true" />
              <span className="text-[13px] font-semibold">需要网站访问权限</span>
            </div>
            <p className="mb-2 text-[11.5px] leading-relaxed text-text-faint">
              检测死链需要向书签里的网址发送 HEAD 请求。授权后只读取状态码，不上传任何书签数据。
            </p>
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => {
                void getBackend().requestHostPermission().then((ok) => {
                  setGranted(ok);
                  store.getState().pushToast({
                    message: ok ? '已授权，可以开始检测' : '未授权，重复检测与空文件夹清理仍可使用',
                    tone: ok ? 'success' : 'warning',
                  });
                });
              }}
            >
              授予访问权限
            </button>
          </section>
        )}

        <section className="panel p-3">
          {scanning && report ? (
            <>
              <Progress value={report.checked} max={report.total} label="正在检测" />
              <button type="button" className="btn btn-danger mt-2.5 w-full" onClick={() => abortRef.current?.abort()}>
                <Square size={13} aria-hidden="true" />
                暂停检测
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary w-full" disabled={!flat.length} onClick={() => void start(false)}>
                <Play size={13} aria-hidden="true" />
                开始全面检测
              </button>
              {resumable && (
                <button type="button" className="btn mt-1.5 w-full" onClick={() => void start(true)}>
                  <RefreshCw size={13} aria-hidden="true" />
                  继续上次（{report?.checked}/{report?.total}）
                </button>
              )}
            </>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
            检测在本页运行，进度实时保存。关闭页面后重新打开可继续。
          </p>
        </section>

        <section className="panel min-h-0 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <History size={12} className="text-text-faint" aria-hidden="true" />
            <span className="label">历史报告</span>
            <button
              type="button"
              className="icon-btn ml-auto h-5 w-5"
              aria-label="清空历史报告"
              disabled={!reports.length}
              onClick={() =>
                requestConfirm({
                  title: '清空历史报告',
                  description: '只删除检测记录，不影响书签和回收站。',
                  confirmLabel: '清空',
                  danger: true,
                  async onConfirm() {
                    await clearReports();
                    setReports([]);
                    setReport(null);
                  },
                })
              }
            >
              <Trash2 size={11} aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[210px] space-y-1 overflow-y-auto">
            {reports.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tree-row w-full"
                data-active={report?.id === item.id}
                onClick={() => setReport(item)}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="mono block text-[11px] text-text-dim">{formatDateTime(item.startedAt)}</span>
                  <span className="block text-[10.5px] text-text-faint">
                    {item.finishedAt ? `${item.total} 条 · ${item.deadLinks.length} 失效` : `未完成 ${item.checked}/${item.total}`}
                  </span>
                </span>
              </button>
            ))}
            {!reports.length && <p className="py-2 text-[11.5px] text-text-faint">还没有检测记录。</p>}
          </div>
        </section>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-3">
        {report ? (
          <>
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(132px,1fr))]">
              <StatTile label="已检测" value={`${report.checked}/${report.total}`} raw hint={report.finishedAt ? timeAgo(report.finishedAt) : '进行中或已暂停'} />
              <StatTile label="失效链接" value={counts.dead} color="var(--danger)" hint="HTTP 404 / 410 / 451" />
              <StatTile label="重复分组" value={counts.duplicates} color="var(--warn)" hint="URL 或标题相似" />
              <StatTile label="空文件夹" value={counts.empty} color="var(--info)" hint="含嵌套空文件夹" />
            </div>

            <div className="panel flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-1 border-b border-line px-2.5 py-2" role="tablist" aria-label="检测结果分类">
                {TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.key}
                    onClick={() => setTab(item.key)}
                    className="btn btn-sm"
                    style={tab === item.key ? { borderColor: item.color, color: item.color, background: `color-mix(in srgb, ${item.color} 12%, transparent)` } : undefined}
                  >
                    <item.Icon size={12} aria-hidden="true" />
                    {item.label}
                    <span className="mono">{counts[item.key]}</span>
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {tab === 'dead' && (
                  <LinkList
                    items={report.deadLinks}
                    emptyText="没有发现失效链接。"
                    action={
                      report.deadLinks.length ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() =>
                            safeDelete(
                              report.deadLinks.map((item) => item.bookmark.id),
                              report.deadLinks.slice(0, 60).map((item) => ({
                                title: item.bookmark.title,
                                detail: `${item.health.httpStatus ?? ''} ${displayUrl(item.bookmark.url)}`,
                              })),
                              '清理失效链接',
                            )
                          }
                        >
                          <Trash2 size={12} aria-hidden="true" />
                          清理全部 {report.deadLinks.length} 条
                        </button>
                      ) : null
                    }
                    onDelete={(item) =>
                      safeDelete([item.bookmark.id], [{ title: item.bookmark.title, detail: item.bookmark.url }], '清理失效链接')
                    }
                  />
                )}

                {tab === 'blocked' && (
                  <LinkList
                    items={report.blocked}
                    emptyText="没有被拒绝访问的链接。"
                    note="403 / 429 / 503 通常意味着需要登录或被限流，不代表链接真的失效，默认不建议删除。"
                  />
                )}

                {tab === 'errors' && (
                  <LinkList
                    items={report.errors}
                    emptyText="没有网络异常或超时。"
                    note="超时与网络错误可能是临时问题，可调整超时时间后重新检测。"
                    onDelete={(item) =>
                      safeDelete([item.bookmark.id], [{ title: item.bookmark.title, detail: item.bookmark.url }], '清理异常链接')
                    }
                  />
                )}

                {tab === 'duplicates' && (
                  <div className="space-y-2.5">
                    {report.duplicates.length === 0 && <EmptyState icon={<Copy size={20} aria-hidden="true" />} title="没有重复书签" description="URL 规范化与标题相似度都没有找到可合并的分组。" />}
                    {report.duplicates.map((group) => (
                      <article key={group.key} className="rounded-[6px] border border-line bg-bg p-2.5">
                        <header className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                            {group.reason === 'url' ? '同一网址' : '标题相似'}
                          </span>
                          <span className="mono text-[11px] text-text-faint">
                            相似度 {(group.similarity * 100).toFixed(0)}% · {group.items.length} 条
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger ml-auto"
                            onClick={() => {
                              const remove = group.items.filter((item) => item.id !== group.keepId);
                              const keep = group.items.find((item) => item.id === group.keepId);
                              safeDelete(
                                remove.map((item) => item.id),
                                [
                                  { title: `保留：${keep?.title ?? ''}`, detail: keep?.url, tone: 'info' },
                                  ...remove.map((item) => ({ title: item.title, detail: `${item.folderPath.join(' / ')} · ${displayUrl(item.url)}` })),
                                ],
                                '合并重复书签',
                              );
                            }}
                          >
                            <CheckCheck size={12} aria-hidden="true" />
                            保留最早，删除其余 {group.items.length - 1} 条
                          </button>
                        </header>
                        <ul className="space-y-1">
                          {group.items.map((item) => (
                            <li key={item.id} className="flex items-center gap-2">
                              <Favicon url={item.url} title={item.title} size={16} />
                              <span className="min-w-0 flex-1">
                                <span className="clamp-1 block text-[12px] text-text-dim">{item.title}</span>
                                <span className="mono clamp-1 block text-[10px] text-text-faint">
                                  {item.folderPath.join(' / ')} · {displayUrl(item.url)}
                                </span>
                              </span>
                              {item.id === group.keepId ? (
                                <span className="chip shrink-0" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>
                                  保留
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="icon-btn h-6 w-6 shrink-0"
                                  aria-label={`打开 ${item.title}`}
                                  onClick={() => void openWithFeedback(item.url)}
                                >
                                  <ExternalLink size={11} aria-hidden="true" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}

                {tab === 'empty' && (
                  <div>
                    {report.emptyFolders.length === 0 ? (
                      <EmptyState icon={<FolderX size={20} aria-hidden="true" />} title="没有空文件夹" description="所有文件夹里都还有内容，嵌套空文件夹也一并检查过了。" />
                    ) : (
                      <>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[12px] text-text-faint">共 {report.emptyFolders.length} 个，包含其嵌套子文件夹</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger ml-auto"
                            onClick={() =>
                              safeDelete(
                                report.emptyFolders.map((folder) => folder.id),
                                report.emptyFolders.map((folder) => ({ title: folder.path.join(' / '), detail: '空文件夹', tone: 'warn' as const })),
                                '清理空文件夹',
                              )
                            }
                          >
                            <Trash2 size={12} aria-hidden="true" />
                            一键清理
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {report.emptyFolders.map((folder) => (
                            <li key={folder.id} className="flex items-center gap-2 rounded-[5px] border border-line bg-bg px-2.5 py-1.5">
                              <FolderX size={13} className="shrink-0 text-info" aria-hidden="true" />
                              <span className="clamp-1 min-w-0 flex-1 text-[12px] text-text-dim">{folder.path.join(' / ')}</span>
                              <button
                                type="button"
                                className="icon-btn h-6 w-6 shrink-0 hover:!text-danger"
                                aria-label={`删除空文件夹 ${folder.title}`}
                                onClick={() => safeDelete([folder.id], [{ title: folder.path.join(' / '), detail: '空文件夹', tone: 'warn' }], '清理空文件夹')}
                              >
                                <Trash2 size={11} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

              <footer className="border-t border-line px-3 py-1.5 text-[10.5px] text-text-faint">
                {activeTab.label} · 所有删除都会先预览确认，并进入回收站
              </footer>
            </div>
          </>
        ) : (
          <div className="panel flex flex-1 items-center justify-center">
            <EmptyState
              icon={<ShieldAlert size={22} aria-hidden="true" />}
              title="还没有检测报告"
              description="设置好并发与延迟后开始检测。检测只读取 HTTP 状态码，不会上传书签，也不会自动删除任何内容。"
              action={
                <button type="button" className="btn btn-primary" disabled={!flat.length || scanning} onClick={() => void start(false)}>
                  <Play size={13} aria-hidden="true" />
                  开始全面检测
                </button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

function LinkList({
  items,
  emptyText,
  note,
  action,
  onDelete,
}: {
  items: ScanReport['deadLinks'];
  emptyText: string;
  note?: string;
  action?: React.ReactNode;
  onDelete?(item: ScanReport['deadLinks'][number]): void;
}) {
  if (!items.length) {
    return <EmptyState icon={<CheckCheck size={20} aria-hidden="true" />} title={emptyText} description="换个分类看看，或调整参数后重新检测。" />;
  }
  return (
    <div>
      {note && <p className="mb-2 rounded-[5px] border border-line bg-bg px-2.5 py-1.5 text-[11.5px] text-text-faint">{note}</p>}
      {action && <div className="mb-2 flex justify-end">{action}</div>}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.bookmark.id} className="flex items-center gap-2.5 rounded-[5px] border border-line bg-bg px-2.5 py-1.5">
            <Favicon url={item.bookmark.url} title={item.bookmark.title} size={17} />
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-[12.5px] text-text-dim">{item.bookmark.title}</span>
              <span className="mono clamp-1 block text-[10.5px] text-text-faint">
                {item.bookmark.folderPath.join(' / ')} · {displayUrl(item.bookmark.url)}
              </span>
            </span>
            <span className="mono shrink-0 text-[11px]" style={{ color: item.health.status === 'dead' ? 'var(--danger)' : 'var(--warn)' }}>
              {item.health.httpStatus ? `HTTP ${item.health.httpStatus}` : item.health.status === 'timeout' ? '超时' : '异常'}
            </span>
            <button
              type="button"
              className="icon-btn h-6 w-6 shrink-0"
              aria-label={`打开 ${item.bookmark.title}`}
              onClick={() => void openWithFeedback(item.bookmark.url)}
            >
              <ExternalLink size={11} aria-hidden="true" />
            </button>
            {onDelete && (
              <button
                type="button"
                className="icon-btn h-6 w-6 shrink-0 hover:!text-danger"
                aria-label={`删除 ${item.bookmark.title}`}
                onClick={() => onDelete(item)}
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}