import { describe, expect, it } from 'vitest';
import { canonicalUrl, displayUrl, hostOf, isHttpUrl, letterAvatar } from './url';

describe('canonicalUrl', () => {
  it('小写化协议与主机、去掉默认端口、hash 与跟踪参数并排序 query', () => {
    expect(
      canonicalUrl('https://Example.com:443/Path/?utm_source=x&b=2&a=1#frag'),
    ).toBe('https://example.com/Path?a=1&b=2');
  });

  it('保留非默认端口与路径大小写', () => {
    expect(canonicalUrl('https://example.com:8443/Case/Sensitive')).toBe(
      'https://example.com:8443/Case/Sensitive',
    );
  });

  it('去掉末尾斜杠但保留根路径', () => {
    expect(canonicalUrl('https://example.com/a/')).toBe('https://example.com/a');
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('ignoreWww 开关控制 www 归一化', () => {
    expect(canonicalUrl('https://www.example.com/a', { ignoreWww: true })).toBe(
      'https://example.com/a',
    );
    expect(canonicalUrl('https://www.example.com/a', { ignoreWww: false })).toBe(
      'https://www.example.com/a',
    );
  });

  it('剔除常见跟踪参数', () => {
    const url = 'https://site.com/p?fbclid=abc&spm=1.2&ref=home&id=7&gclid=x&share_token=y';
    expect(canonicalUrl(url)).toBe('https://site.com/p?id=7');
  });

  it('非 http(s) 协议原样小写返回', () => {
    expect(canonicalUrl('chrome://Settings/')).toBe('chrome://settings/');
    expect(canonicalUrl('file:///tmp/a.txt')).toBe('file:///tmp/a.txt');
  });

  it('非法 URL 不抛异常', () => {
    expect(canonicalUrl('not a url')).toBe('not a url');
  });

  it('同一文档的跟踪链接归一化后相等', () => {
    expect(canonicalUrl('https://github.com/a/b?utm_source=wechat')).toBe(
      canonicalUrl('https://github.com/a/b'),
    );
  });
});

describe('URL 辅助函数', () => {
  it('isHttpUrl 只接受 http/https', () => {
    expect(isHttpUrl('https://a.com')).toBe(true);
    expect(isHttpUrl('http://a.com')).toBe(true);
    expect(isHttpUrl('chrome://newtab')).toBe(false);
    expect(isHttpUrl('javascript:void(0)')).toBe(false);
  });

  it('hostOf 提取小写主机名', () => {
    expect(hostOf('https://WWW.Example.com/a')).toBe('www.example.com');
    expect(hostOf('bad')).toBe('');
  });

  it('displayUrl 去掉协议与 www 并截断长路径', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com');
    expect(displayUrl('https://example.com/a/b')).toBe('example.com/a/b');
    expect(displayUrl(`https://example.com/${'x'.repeat(60)}`)).toContain('…');
  });

  it('letterAvatar 给出稳定首字母与色相', () => {
    const a = letterAvatar('github.com');
    expect(a.letter).toBe('G');
    expect(letterAvatar('github.com').hue).toBe(a.hue);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
  });
});