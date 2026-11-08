import { describe, expect, it } from 'vitest';
import { ACCENTS, folderHue } from './folderHue';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

describe('folderHue', () => {
  it('同一 id 恒定返回同一颜色（确定性）', () => {
    for (const id of ['1', '42', 'folder-abc', '中文文件夹']) {
      const first = folderHue(id);
      expect(folderHue(id)).toBe(first);
      expect(folderHue(id)).toBe(first);
    }
  });

  it('返回值是合法的 6 位十六进制 CSS 颜色', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(folderHue(String(i))).toMatch(HEX_COLOR);
    }
  });

  it('空 id 不抛错且返回合法颜色', () => {
    expect(() => folderHue('')).not.toThrow();
    expect(folderHue('')).toMatch(HEX_COLOR);
  });

  it('特殊字符、unicode 与超长 id 均不抛错', () => {
    const inputs = ['<script>&"\'', '🎉🚀✨', '\n\t\0', 'x'.repeat(10_000), 'a/b\\c?d#e'];
    for (const id of inputs) {
      expect(() => folderHue(id)).not.toThrow();
      expect(folderHue(id)).toMatch(HEX_COLOR);
    }
  });

  it('不同 id 能分散到多种颜色而非单色', () => {
    const colors = new Set(Array.from({ length: 200 }, (_, i) => folderHue(`folder-${i}`)));
    expect(colors.size).toBeGreaterThan(1);
    expect(colors.size).toBeLessThanOrEqual(8);
  });

  it('颜色可被浏览器 CSS 解析接受', () => {
    const probe = document.createElement('div');
    probe.style.color = folderHue('css-probe');
    expect(probe.style.color).not.toBe('');
  });
});

describe('ACCENTS 主色板', () => {
  it('包含四种主色且 name 唯一', () => {
    expect(ACCENTS).toHaveLength(4);
    const names = ACCENTS.map((accent) => accent.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(['azure', 'gilt', 'magenta', 'verdant']);
  });

  it('每项都有非空 label 与合法 hex swatch', () => {
    for (const accent of ACCENTS) {
      expect(accent.label.length).toBeGreaterThan(0);
      expect(accent.swatch).toMatch(HEX_COLOR);
    }
  });

  it('主色 swatch 与 folderHue 调色板同源（gilt/azure/verdant/magenta 可被命中）', () => {
    const palette = new Set(Array.from({ length: 2000 }, (_, i) => folderHue(`id-${i}`)));
    for (const accent of ACCENTS) {
      expect(palette.has(accent.swatch)).toBe(true);
    }
  });
});