import { describe, expect, it } from 'vitest';
import type { BookmarkNode } from '../types';
import { findEmptyFolders } from './emptyFolders';

function tree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          parentId: '0',
          children: [
            {
              id: '10',
              title: '空父',
              parentId: '1',
              children: [{ id: '11', title: '空子', parentId: '10', children: [] }],
            },
            {
              id: '12',
              title: '有内容',
              parentId: '1',
              children: [
                { id: '13', title: '站点', url: 'https://a.com/', parentId: '12' },
                { id: '14', title: '内层空', parentId: '12', children: [] },
              ],
            },
          ],
        },
        { id: '2', title: '其他书签', parentId: '0', children: [] },
        { id: '3', title: '移动版书签', parentId: '0', children: [] },
      ],
    },
  ];
}

describe('findEmptyFolders', () => {
  it('嵌套空文件夹只报告最外层', () => {
    const result = findEmptyFolders(tree());
    expect(result.map((folder) => folder.id)).toEqual(['10', '14']);
    expect(result[0].path).toEqual(['书签栏', '空父']);
  });

  it('排除根节点与 Chrome 特殊文件夹', () => {
    const ids = findEmptyFolders(tree()).map((folder) => folder.id);
    expect(ids).not.toContain('0');
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('2');
    expect(ids).not.toContain('3');
  });

  it('含书签的文件夹不报告', () => {
    expect(findEmptyFolders(tree()).some((folder) => folder.id === '12')).toBe(false);
  });

  it('空树返回空数组', () => {
    expect(findEmptyFolders([])).toEqual([]);
  });

  it('全部为空时报告每个顶层空文件夹', () => {
    const result = findEmptyFolders([
      {
        id: '0',
        title: '',
        children: [
          { id: '1', title: '书签栏', parentId: '0', children: [{ id: '20', title: '甲', parentId: '1', children: [] }] },
          { id: '2', title: '其他书签', parentId: '0', children: [{ id: '21', title: '乙', parentId: '2', children: [] }] },
        ],
      },
    ]);
    expect(result.map((folder) => folder.id).sort()).toEqual(['20', '21']);
  });
});