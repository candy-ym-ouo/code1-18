import { describe, expect, it } from 'vitest';
import {
  composeChapter,
  paginateDocument,
  renderHtmlDocument,
  renderMarkdownDocument,
} from '../src/index.js';

const GENERATED_AT = new Date('2026-09-18T08:00:00.000Z');

const sampleDoc = () =>
  composeChapter({
    title: '第一章 老宅',
    intro: '这一章记录外婆的讲述。',
    blocks: [
      { id: 'h1', type: 'heading', content: { text: '夏天', level: 2 } },
      { id: 'p1', type: 'paragraph', content: { text: '院子里的梧桐树。' } },
      {
        id: 'a1',
        type: 'audio',
        clipId: 'clip-1',
        clip: {
          id: 'clip-1',
          title: '外婆的回忆',
          startMs: 62_500,
          endMs: 130_000,
          summary: '关于老宅的夏天',
          recordingTitle: '第一次访谈',
          recordingStatus: 'READY',
        },
      },
      { id: 'broken', type: 'paragraph', content: { text: '引用已丢失。' }, clipId: 'clip-gone', clip: null },
    ],
  });

describe('renderHtmlDocument', () => {
  it('renders a self-contained printable document', () => {
    const html = renderHtmlDocument(sampleDoc(), { generatedAt: GENERATED_AT });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<h1>第一章 老宅</h1>');
    expect(html).toContain('class="time-marker"');
    expect(html).toContain('[01:02.500 – 02:10.000]');
    expect(html).toContain('data-clip-id="clip-1"');
    expect(html).toContain('class="missing-audio"');
    expect(html).toContain('doc-notice');
    expect(html).toContain('2026-09-18T08:00:00.000Z');
  });

  it('escapes user content', () => {
    const doc = composeChapter({
      title: '<script>alert(1)</script>',
      blocks: [
        { id: 'b1', type: 'paragraph', content: { text: '<img src=x onerror=alert(1)>' } },
      ],
    });
    const html = renderHtmlDocument(doc, { generatedAt: GENERATED_AT });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
  });

  it('renders one .page section per computed page', () => {
    const doc = sampleDoc();
    const pages = paginateDocument(doc, { pageLines: 8, lineWidth: 24 });
    const html = renderHtmlDocument(doc, {
      pageLines: 8,
      lineWidth: 24,
      generatedAt: GENERATED_AT,
    });
    const sectionCount = html.split('<section class="page"').length - 1;
    expect(sectionCount).toBe(pages.length);
  });

  it('keeps every time marker intact inside its span across pages', () => {
    const markers = ['[00:01:02.500]', '[01:12:03.250 – 01:12:09.900]'];
    const text = Array.from(
      { length: 60 },
      (_, index) => `第${index}段${markers[index % 2]}补充文字`,
    ).join('，');
    const doc = composeChapter({
      title: 't',
      blocks: [{ id: 'b1', type: 'paragraph', content: { text } }],
    });
    const html = renderHtmlDocument(doc, {
      pageLines: 5,
      lineWidth: 20,
      generatedAt: GENERATED_AT,
    });

    expect(html.split('<section class="page"').length - 1).toBeGreaterThan(1);
    // 每个 time-marker span 内都是完整标记，且各标记总数与源文本一致
    const spans = [...html.matchAll(/<span class="time-marker">([^<]*)<\/span>/g)].map(
      (match) => match[1],
    );
    for (const content of spans) {
      expect(content).toMatch(
        /^\[(?:\d{1,3}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?(?:\s*[–—-]\s*(?:\d{1,3}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)?\]$/,
      );
    }
    for (const marker of markers) {
      expect(spans.filter((content) => content === marker)).toHaveLength(
        text.split(marker).length - 1,
      );
    }
  });

  it('renders a continuous flow when pagination is disabled', () => {
    const html = renderHtmlDocument(sampleDoc(), {
      paginate: false,
      generatedAt: GENERATED_AT,
    });
    expect(html).toContain('<main class="flow">');
    expect(html).not.toContain('<section class="page"');
  });
});

describe('renderMarkdownDocument', () => {
  it('renders headings, audio cards and degraded placeholders', () => {
    const markdown = renderMarkdownDocument(sampleDoc(), { generatedAt: GENERATED_AT });

    expect(markdown).toContain('# 第一章 老宅');
    expect(markdown).toContain('## 夏天');
    expect(markdown).toContain('▶ `[01:02.500 – 02:10.000]` **外婆的回忆**（录音：第一次访谈）');
    expect(markdown).toContain('> [!WARNING]');
    expect(markdown).toContain('clip-gone');
    expect(markdown.endsWith('\n')).toBe(true);
  });
});
