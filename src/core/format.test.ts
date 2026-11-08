import { describe, expect, it } from 'vitest';
import {
  clamp,
  escapeHtml,
  escapeXml,
  formatCount,
  formatDate,
  greeting,
  timeAgo,
  truncate,
  uid,
  weekdayLabel,
} from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

describe('timeAgo', () => {
  it('各时段边界', () => {
    expect(timeAgo(0, NOW)).toBe('未知');
    expect(timeAgo(NOW, NOW)).toBe('刚刚');
    expect(timeAgo(NOW - 59 * 1000, NOW)).toBe('刚刚');
    expect(timeAgo(NOW - MINUTE, NOW)).toBe('1 分钟前');
    expect(timeAgo(NOW - 59 * MINUTE, NOW)).toBe('59 分钟前');
    expect(timeAgo(NOW - HOUR, NOW)).toBe('1 小时前');
    expect(timeAgo(NOW - 23 * HOUR, NOW)).toBe('23 小时前');
    expect(timeAgo(NOW - DAY, NOW)).toBe('1 天前');
    expect(timeAgo(NOW - 29 * DAY, NOW)).toBe('29 天前');
    expect(timeAgo(NOW - 30 * DAY, NOW)).toBe('1 个月前');
    expect(timeAgo(NOW - 365 * DAY, NOW)).toBe('1 年前');
  });

  it('未来时间不产生负数描述', () => {
    expect(timeAgo(NOW + 5 * MINUTE, NOW)).toBe('刚刚');
  });
});

describe('formatCount', () => {
  it('千以下原样，千与万缩写', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1.0k');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(9999)).toBe('10.0k');
    expect(formatCount(10_000)).toBe('1.0w');
    expect(formatCount(123_456)).toBe('12.3w');
  });
});

describe('greeting / weekdayLabel', () => {
  it('按小时分段', () => {
    const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);
    expect(greeting(at(3))).toBe('夜深了');
    expect(greeting(at(7))).toBe('早上好');
    expect(greeting(at(10))).toBe('上午好');
    expect(greeting(at(13))).toBe('中午好');
    expect(greeting(at(16))).toBe('下午好');
    expect(greeting(at(21))).toBe('晚上好');
    expect(greeting(at(23))).toBe('夜深了');
  });

  it('星期标签与 Date.getDay 对应', () => {
    expect(weekdayLabel(new Date(2026, 0, 4))).toBe('周日');
    expect(weekdayLabel(new Date(2026, 0, 5))).toBe('周一');
    expect(weekdayLabel(new Date(2026, 0, 10))).toBe('周六');
  });
});

describe('escapeHtml / escapeXml', () => {
  it('escapeHtml 转义全部危险字符', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('escapeXml 只转义 XML 必需字符', () => {
    expect(escapeXml(`<a & "b">`)).toBe('&lt;a &amp; "b"&gt;');
    expect(escapeXml(`it's`)).toBe(`it's`);
  });
});

describe('formatDate / truncate / clamp / uid', () => {
  it('formatDate 输出 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 10, 8).getTime())).toBe('2026-11-08');
  });

  it('truncate 按上限截断并加省略号', () => {
    expect(truncate('abcdef', 10)).toBe('abcdef');
    expect(truncate('abcdef', 4)).toBe('abcd…');
  });

  it('clamp 收敛到区间内', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('uid 带前缀且唯一', () => {
    const a = uid('tab');
    const b = uid('tab');
    expect(a).toMatch(/^tab_/);
    expect(a).not.toBe(b);
  });
});
