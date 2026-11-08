import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

describe('downloadText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('文件名与 MIME 透传，blob 携带原文与 charset', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unit-test');
    const appendChild = vi.spyOn(document.body, 'appendChild');

    downloadText('书签备份.html', '<html>内容</html>', 'text/html');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/html;charset=utf-8');
    await expect(blob.text()).resolves.toBe('<html>内容</html>');

    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe('A');
    expect(anchor.download).toBe('书签备份.html');
    expect(anchor.getAttribute('href')).toBe('blob:unit-test');
  });

  it('JSON 导出使用 application/json 类型', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json');
    downloadText('backup.json', '{"a":1}', 'application/json');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    await expect(blob.text()).resolves.toBe('{"a":1}');
  });

  it('anchor 触发点击后即从 body 移除', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remove');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const appendChild = vi.spyOn(document.body, 'appendChild');

    downloadText('x.txt', 'text', 'text/plain');

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(document.body.contains(anchor)).toBe(false);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revoke 延迟 4000ms 执行且只执行一次', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:revoke');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

    downloadText('x.txt', 'text', 'text/plain');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3999);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:revoke');

    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('多次下载各自独立计时 revoke', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

    downloadText('a.txt', 'A', 'text/plain');
    vi.advanceTimersByTime(2000);
    downloadText('b.txt', 'B', 'text/plain');

    vi.advanceTimersByTime(2000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:first');

    vi.advanceTimersByTime(2000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:second');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});