import { describe, expect, it } from 'vitest';
import {
  composeChapter,
  paginate,
  type ExportChapterInput,
  type PagedDocument,
} from '../src/index.js';

const MARKER = '〔01:01.500–01:15.000〕'; // 23 格

const clip = {
  id: 'clip-1',
  title: '渡江',
  startMs: 61_500,
  endMs: 75_000,
  transcript: '我们坐船过了江。',
  recording: { id: 'rec-1', title: '访谈一', status: 'READY' },
};

function layout(chapter: ExportChapterInput, lineCells: number, pageLines: number) {
  return paginate(composeChapter(chapter), { lineCells, pageLines });
}

function paragraph(id: string, position: string, text: string) {
  return { id, type: 'paragraph', position, content: { text } };
}

/** 全文所有出现 '〔' 的行都必须包含完整的时间标记。 */
function expectMarkersIntact(document: PagedDocument) {
  for (const page of document.pages) {
    for (const line of page.lines) {
      if (line.text.includes('〔')) {
        expect(line.text).toContain(MARKER);
      }
    }
  }
}

describe('paginate wrapping', () => {
  it('wraps CJK text by cell width', () => {
    const document = layout(
      { title: '章', blocks: [paragraph('b1', 'a', '一二三四五六七八')] },
      10,
      36,
    );
    const body = document.pages[0].lines.filter(
      (line) => line.role === 'paragraph',
    );

    expect(body.map((line) => line.text)).toEqual(['一二三四五', '六七八']);
  });

  it('moves a time marker that does not fit wholly onto the next line', () => {
    const document = layout(
      {
        title: '章',
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            position: 'a',
            content: { text: '现场' },
            clipId: clip.id,
            clip,
          },
        ],
      },
      20,
      36,
    );
    const body = document.pages[0].lines.filter(
      (line) => line.role === 'paragraph',
    );

    expect(body).toHaveLength(2);
    expect(body[0].text).toBe('现场');
    expect(body[1].text).toBe(MARKER);
    expectMarkersIntact(document);
  });

  it('never splits a marker that is wider than a whole line', () => {
    const document = layout(
      {
        title: '章',
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            position: 'a',
            content: { text: '旁白' },
            clipId: clip.id,
            clip,
          },
        ],
      },
      10,
      36,
    );

    expectMarkersIntact(document);
    const markerLine = document.pages
      .flatMap((page) => page.lines)
      .find((line) => line.text.includes('〔'));
    expect(markerLine?.text).toBe(MARKER);
  });
});

describe('paginate page breaks', () => {
  it('never truncates a time marker at a page boundary', () => {
    // 14 个全角字（每行 5 字）+ 时间标记（23 格，独占一行）= 4 行；
    // 每页 3 行，标记恰好落在页边界上。
    const document = layout(
      {
        title: '章',
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            position: 'a',
            content: { text: '一二三四五六七八九十甲乙丙丁' },
            clipId: clip.id,
            clip,
          },
        ],
      },
      10,
      5,
    );

    // 标题块：标题 1 行 + 空行；正文 4 行 → 共 6 行，两页
    expect(document.pages).toHaveLength(2);
    const [first, second] = document.pages;
    expect(first.lines.map((line) => line.text).join('')).not.toContain('〔');
    expect(second.lines.some((line) => line.text === MARKER)).toBe(true);
    expectMarkersIntact(document);
  });

  it('keeps every marker intact across a long multi-page document', () => {
    const blocks = Array.from({ length: 12 }, (_, index) => ({
      id: `b${index}`,
      type: 'clip',
      position: String(index).padStart(2, '0'),
      clipId: clip.id,
      clip,
    }));
    const document = layout({ title: '长章', blocks }, 40, 9);

    expect(document.pages.length).toBeGreaterThan(1);
    expectMarkersIntact(document);
    // 每个引文块的时间标记行都与正文同页
    for (const page of document.pages) {
      page.lines.forEach((line, index) => {
        if (line.text.includes(MARKER)) {
          const rest = page.lines.slice(index + 1);
          expect(rest.some((next) => next.role === 'citation')).toBe(true);
        }
      });
    }
  });

  it('moves a heading at the page bottom together with its content', () => {
    const document = layout(
      {
        title: '章',
        blocks: [
          paragraph('b1', 'a', '第一段'),
          { id: 'b2', type: 'heading', position: 'b', content: { text: '渡口' } },
          paragraph('b3', 'c', '第二段'),
        ],
      },
      40,
      2,
    );

    const headingPage = document.pages.find((page) =>
      page.lines.some((line) => line.text === '渡口'),
    );
    expect(headingPage).toBeDefined();
    expect(headingPage!.lines.map((line) => line.text)).toContain('第二段');
    // 标题不是任何一页的最后一行
    for (const page of document.pages) {
      const last = page.lines.at(-1);
      expect(last?.role).not.toBe('heading');
    }
  });

  it('does not start a page with a blank separator line', () => {
    const blocks = Array.from({ length: 8 }, (_, index) =>
      paragraph(`b${index}`, String(index).padStart(2, '0'), `第${index}段`),
    );
    const document = layout({ title: '章', blocks }, 40, 3);

    expect(document.pages.length).toBeGreaterThan(1);
    for (const page of document.pages) {
      expect(page.lines[0]?.role).not.toBe('blank');
    }
  });
});
