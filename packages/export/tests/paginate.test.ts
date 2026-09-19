import { describe, expect, it } from 'vitest';
import {
  composeChapter,
  displayWidth,
  lineToString,
  paginateDocument,
  tokenize,
  wrapTokens,
} from '../src/index.js';

const pageLinesOf = (pages: ReturnType<typeof paginateDocument>) =>
  pages.map((page) => page.items.flatMap((item) => item.lines).map(lineToString));

describe('tokenize', () => {
  it('treats time markers as atomic tokens', () => {
    const tokens = tokenize('正文 [00:01:02.500] 继续 [01:02.500 – 02:10.000] 结束');
    const markerTokens = tokens.filter((token) => token.atomic);
    expect(markerTokens.map((token) => token.text)).toEqual([
      '[00:01:02.500]',
      '[01:02.500 – 02:10.000]',
    ]);
  });

  it('does not treat a lone bracket as a marker', () => {
    const tokens = tokenize('这不是[标记]的内容');
    expect(tokens.every((token) => !token.atomic)).toBe(true);
  });

  it('measures wide characters as two units', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('中文')).toBe(4);
    expect(displayWidth('[01:02.500]')).toBe(11);
  });
});

describe('wrapTokens', () => {
  it('never breaks a line inside a time marker', () => {
    const tokens = tokenize('前面的文字 [00:01:02.500] 后面的文字继续延伸');
    const lines = wrapTokens(tokens, 12).map(lineToString);
    for (const line of lines) {
      expect(line).not.toMatch(/\[[\d:.–— ]*$/);
      expect(line).not.toMatch(/^[\d:.–— ]*\]/);
    }
    expect(lines.join('')).toContain('[00:01:02.500]');
  });

  it('keeps an over-wide marker intact on its own line instead of truncating it', () => {
    const marker = '[01:02:03.456 – 02:03:04.567]';
    const lines = wrapTokens(tokenize(`前文 ${marker} 后文`), 8).map(lineToString);
    expect(lines).toContain(marker);
  });
});

describe('paginateDocument', () => {
  it('never truncates time markers across pages', () => {
    const markers = [
      '[00:01:02.500]',
      '[01:12:03.250 – 01:12:09.900]',
      '[05:30.000]',
    ];
    const text = Array.from(
      { length: 40 },
      (_, index) => `第${index}段${markers[index % 3]}补充说明文字`,
    ).join('，');
    const doc = composeChapter({
      title: 't',
      blocks: [{ id: 'b1', type: 'paragraph', content: { text } }],
    });

    const pages = paginateDocument(doc, { pageLines: 6, lineWidth: 24 });
    expect(pages.length).toBeGreaterThan(1);

    const pageTexts = pageLinesOf(pages).map((lines) => lines.join('\n'));
    for (const marker of markers) {
      // 每个标记出现的总次数与源文本一致：没有丢失，也没有被拆成碎片
      const expected = text.split(marker).length - 1;
      const actual = pageTexts.reduce(
        (count, pageText) => count + pageText.split(marker).length - 1,
        0,
      );
      expect(actual).toBe(expected);
    }
    for (const pageText of pageTexts) {
      for (const line of pageText.split('\n')) {
        // 不存在被截断的标记左半部分或右半部分
        expect(line).not.toMatch(/\[[\d:.–— ]*$/);
        expect(line).not.toMatch(/^[\d:.–— ]*\]/);
      }
    }
  });

  it('preserves all content while paginating', () => {
    const text = '家史排版需要保证内容完整，'.repeat(50);
    const doc = composeChapter({
      title: 't',
      blocks: [{ id: 'b1', type: 'paragraph', content: { text } }],
    });
    const pages = paginateDocument(doc, { pageLines: 7, lineWidth: 30 });
    const joined = pageLinesOf(pages).flat().join('');
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('keeps the audio card header (time marker) with its first body line', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'p1', type: 'paragraph', content: { text: '铺垫'.repeat(40) } },
        {
          id: 'a1',
          type: 'audio',
          clipId: 'clip-1',
          clip: {
            id: 'clip-1',
            title: '片段标题',
            startMs: 0,
            endMs: 1500,
            summary: '摘要内容摘要内容摘要内容',
            transcript: '转写内容转写内容转写内容转写内容',
            recordingStatus: 'READY',
          },
        },
      ],
    });

    // 页面剩余空间放不下「标记行 + 首行正文」：卡片必须整体后移
    const pages = paginateDocument(doc, { pageLines: 6, lineWidth: 40 });
    expect(pages.length).toBeGreaterThan(1);
    const firstPageText = pageLinesOf(pages)[0].join('\n');
    expect(firstPageText).not.toContain('[00:00.000 – 00:01.500]');

    const cardItem = pages
      .flatMap((page) => page.items)
      .find((item) => item.node.kind === 'audio');
    expect(cardItem).toBeDefined();
    const cardLines = cardItem!.lines.map(lineToString);
    expect(cardLines[0]).toContain('[00:00.000 – 00:01.500]');
    expect(cardLines.length).toBeGreaterThan(1);
  });

  it('splits very long audio cards at line boundaries, never inside the marker', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        {
          id: 'a1',
          type: 'audio',
          clipId: 'clip-1',
          clip: {
            id: 'clip-1',
            title: '长转写',
            startMs: 1000,
            endMs: 2000,
            transcript: '转写文字。'.repeat(60),
            recordingStatus: 'READY',
          },
        },
      ],
    });

    const pages = paginateDocument(doc, { pageLines: 5, lineWidth: 40 });
    expect(pages.length).toBeGreaterThan(1);
    const allLines = pageLinesOf(pages).flat();
    expect(allLines[0]).toContain('[00:01.000 – 00:02.000]');
    for (const line of allLines) {
      expect(line).not.toMatch(/\[[\d:.–— ]*$/);
      expect(line).not.toMatch(/^[\d:.–— ]*\]/);
    }
    // 转写内容完整
    expect(allLines.join('').replace(/\s+/g, '')).toContain('转写文字。'.repeat(60));
  });

  it('does not strand a heading at the bottom of a page', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'p1', type: 'paragraph', content: { text: '前文'.repeat(30) } },
        { id: 'h1', type: 'heading', content: { text: '小节标题' } },
        { id: 'p2', type: 'paragraph', content: { text: '正文内容。' } },
      ],
    });

    const pages = paginateDocument(doc, { pageLines: 6, lineWidth: 20 });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const last = page.items[page.items.length - 1];
      expect(last.node.kind).not.toBe('heading');
    }
  });

  it('keeps atomic placeholder blocks on a single page', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'p1', type: 'paragraph', content: { text: '铺垫'.repeat(40) } },
        { id: 'broken', type: 'paragraph', content: { text: '段落。' }, clipId: 'gone', clip: null },
      ],
    });

    const pages = paginateDocument(doc, { pageLines: 6, lineWidth: 20 });
    const placeholderPages = pages.filter((page) =>
      page.items.some((item) => item.node.kind === 'missing-audio'),
    );
    expect(placeholderPages).toHaveLength(1);
    const item = placeholderPages[0].items.find(
      (entry) => entry.node.kind === 'missing-audio',
    );
    expect(item!.lines).toHaveLength(item!.totalLines);
  });
});
