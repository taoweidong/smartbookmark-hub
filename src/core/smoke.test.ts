import { describe, expect, it } from 'vitest';
import { APP_NAME, OMNIBOX_KEYWORD } from './constants';

describe('工程常量', () => {
  it('暴露产品名称与 omnibox 关键字', () => {
    expect(APP_NAME).toBe('SmartBookmark Hub');
    expect(OMNIBOX_KEYWORD).toBe('bm');
  });
});