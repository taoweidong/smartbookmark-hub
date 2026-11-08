import { describe, expect, it } from 'vitest';
import { hasCJK, normalizeTitle, toFullPinyin, toInitials } from './pinyin';

describe('拼音转换', () => {
  it('中文标题转首字母与全拼', () => {
    expect(toInitials('知乎')).toBe('zh');
    expect(toFullPinyin('知乎')).toBe('zhihu');
    expect(toInitials('掘金')).toBe('jj');
    expect(toFullPinyin('掘金')).toBe('juejin');
  });

  it('hasCJK 正确区分中英', () => {
    expect(hasCJK('GitHub')).toBe(false);
    expect(hasCJK('掘金')).toBe(true);
    expect(hasCJK('React 文档')).toBe(true);
  });

  it('多词英文标题取首字母缩写', () => {
    expect(toInitials('Visual Studio Code')).toBe('vsc');
    expect(toFullPinyin('Visual Studio Code')).toBe('visualstudiocode');
  });

  it('单词英文标题保持原样小写', () => {
    expect(toInitials('GitHub')).toBe('github');
    expect(toFullPinyin('GitHub')).toBe('github');
  });

  it('重复调用命中缓存且结果一致', () => {
    expect(toInitials('哔哩哔哩')).toBe(toInitials('哔哩哔哩'));
    expect(toInitials('哔哩哔哩')).toBe('blbl');
  });
});

describe('normalizeTitle', () => {
  it('全角转半角、去空白与标点、小写化', () => {
    expect(normalizeTitle('Ａ－Ｂ Test!')).toBe('abtest');
    expect(normalizeTitle('知乎 - 问题')).toBe('知乎问题');
    expect(normalizeTitle('  Hello   World  ')).toBe('helloworld');
  });
});