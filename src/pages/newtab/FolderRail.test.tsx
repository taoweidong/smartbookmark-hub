import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FolderInfo } from '@/core/bookmarks';
import { folderHue } from '@/ui/folderHue';
import { FolderRail } from './FolderRail';

function makeFolder(id: string, title: string, over: Partial<FolderInfo> = {}): FolderInfo {
  return {
    id,
    title,
    parentId: '1',
    depth: 1,
    path: ['书签栏', title],
    directCount: 2,
    totalCount: 2,
    special: false,
    ...over,
  };
}

const FOLDERS = [makeFolder('f1', '工作'), makeFolder('f2', '学习', { totalCount: 5, directCount: 3 })];

describe('FolderRail', () => {
  it('渲染带 aria-label 的导航与每个文件夹按钮', () => {
    render(<FolderRail folders={FOLDERS} activeId="" total={7} onJump={() => {}} />);

    expect(screen.getByRole('navigation', { name: '页签内的文件夹' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /工作/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /学习/ })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('点击文件夹把对应 id 传给 onJump', () => {
    const onJump = vi.fn();
    render(<FolderRail folders={FOLDERS} activeId="" total={7} onJump={onJump} />);

    fireEvent.click(screen.getByRole('button', { name: /学习/ }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith('f2');
  });

  it('只有 activeId 对应的项标记 data-active', () => {
    render(<FolderRail folders={FOLDERS} activeId="f1" total={7} onJump={() => {}} />);

    expect(screen.getByRole('button', { name: /工作/ })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: /学习/ })).toHaveAttribute('data-active', 'false');
  });

  it('activeId 不在列表里时所有项都不高亮', () => {
    render(<FolderRail folders={FOLDERS} activeId="f-missing" total={7} onJump={() => {}} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('data-active', 'false');
    }
  });

  it('空列表态保留标题、总数 0 与说明文案', () => {
    const onJump = vi.fn();
    render(<FolderRail folders={[]} activeId="" total={0} onJump={onJump} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/这里只展示你勾选的浏览器文件夹/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('navigation', { name: '页签内的文件夹' }));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('按钮 title 是完整路径，并展示各自的书签总数', () => {
    render(<FolderRail folders={FOLDERS} activeId="" total={7} onJump={() => {}} />);

    const work = screen.getByRole('button', { name: /工作/ });
    expect(work).toHaveAttribute('title', '书签栏 / 工作');
    expect(work).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /学习/ })).toHaveTextContent('5');
  });

  it('按文件夹 id 计算色相并写入 CSS 变量', () => {
    render(<FolderRail folders={FOLDERS} activeId="" total={7} onJump={() => {}} />);

    const work = screen.getByRole('button', { name: /工作/ }) as HTMLElement;
    expect(work.style.getPropertyValue('--folder-hue')).toBe(folderHue('f1'));
  });
});