import { describe, expect, it } from 'vitest';
import {
  composeChapter,
  exportChapter,
  paginate,
  renderHtml,
  renderText,
  type ExportChapterInput,
  type PagedDocument,
} from '../src/index.js';

const clip = {
  id: 'clip-1',
  title: '渡江',
  startMs: 61_500,
  endMs: 75_000,
  transcript: '我们坐船过了江。',
  recording: { id: 'rec-1', title: '访谈一', status: 'READY' },
};

const chapter: ExportChapterInput = {
  title: '第一章 <童年>',
  intro: '引言',
  blocks: [
    {
      id: 'b1',
      type: 'paragraph',
      position: 'a',
      content: { text: '祖父出生在江边的小镇。' },
    },
    { id: 'b2', type: 'clip', position: 'b', clipId: clip.id, clip },
    { id: 'b3', type: 'clip', position: 'c', clipId: 'gone', clip: null },
  ],
};

function document(): PagedDocument {
  return paginate(composeChapter(chapter), { lineCells: 40, pageLines: 6 });
}

describe('renderHtml', () => {
  it('renders a standalone document with pages and escaped content', () => {
    const html = renderHtml(document());

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('<title>第一章 &lt;童年&gt;</title>');
    expect(html).not.toContain('<童年>');
    expect(html.match(/<section class="page"/g)).toHaveLength(
      document().pages.length,
    );
  });

  it('wraps time markers in an unbreakable span', () => {
    const html = renderHtml(document());

    expect(html).toContain(
      '<span class="marker">〔01:01.500–01:15.000〕</span>',
    );
    expect(html).toContain('white-space: nowrap');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('marks degraded blocks and summarizes them for the reader', () => {
    const html = renderHtml(document());

    expect(html).toContain('line--missing');
    expect(html).toContain('〔音频引用缺失〕');
    expect(html).toContain('1 处音频引用缺失');
  });
});

describe('renderText', () => {
  it('renders pages with separators and intact markers', () => {
    const text = renderText(document());
    const pages = document().pages.length;

    expect(text).toContain(`—— 第 1 页 / 共 ${pages} 页 ——`);
    expect(text).toContain(`—— 第 ${pages} 页 / 共 ${pages} 页 ——`);
    expect(text).toContain('〔01:01.500–01:15.000〕');
    expect(text).toContain('〔音频引用缺失〕');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('exportChapter', () => {
  it('returns the paged document for json format', () => {
    const result = exportChapter(chapter, { format: 'json', pageLines: 6 });

    expect(typeof result).toBe('object');
    expect((result as PagedDocument).pages.length).toBeGreaterThan(0);
    expect((result as PagedDocument).degradedCount).toBe(1);
  });

  it('renders html by default and text on demand', () => {
    expect(exportChapter(chapter)).toContain('<!doctype html>');
    expect(exportChapter(chapter, { format: 'text' })).toContain('第 1 页');
  });
});
