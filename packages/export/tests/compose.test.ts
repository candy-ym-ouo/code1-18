import { describe, expect, it } from 'vitest';
import { composeChapter, formatTime, formatTimeMarker } from '../src/index.js';
import type { ExportClipRef } from '../src/index.js';

const clip = (overrides: Partial<ExportClipRef> = {}): ExportClipRef => ({
  id: 'clip-1',
  title: '外婆的回忆',
  startMs: 62_500,
  endMs: 130_000,
  summary: '关于老宅的夏天',
  transcript: '',
  recordingTitle: '第一次访谈',
  recordingStatus: 'READY',
  ...overrides,
});

describe('formatTime / formatTimeMarker', () => {
  it('formats milliseconds like the web player', () => {
    expect(formatTime(0)).toBe('00:00.000');
    expect(formatTime(62_500)).toBe('01:02.500');
    expect(formatTime(3_661_500)).toBe('01:01:01.500');
    expect(formatTime(Number.NaN)).toBe('00:00.000');
  });

  it('builds a range marker', () => {
    expect(formatTimeMarker(62_500, 130_000)).toBe('[01:02.500 – 02:10.000]');
  });
});

describe('composeChapter', () => {
  it('composes blocks in order into document nodes', () => {
    const doc = composeChapter({
      title: '第一章',
      intro: '这一章记录外婆的讲述。',
      blocks: [
        { id: 'b1', type: 'heading', content: { text: '老宅', level: 2 } },
        { id: 'b2', type: 'paragraph', content: { text: '正文第一段。' } },
        { id: 'b3', type: 'quote', content: { text: '那时候天很蓝。', cite: '外婆' } },
        { id: 'b4', type: 'divider' },
        { id: 'b5', type: 'audio', clipId: 'clip-1', clip: clip() },
      ],
    });

    expect(doc.nodes.map((node) => node.kind)).toEqual([
      'paragraph', // intro
      'heading',
      'paragraph',
      'quote',
      'divider',
      'audio',
    ]);
    const audio = doc.nodes[5];
    expect(audio.kind).toBe('audio');
    if (audio.kind === 'audio') {
      expect(audio.card.marker).toBe('[01:02.500 – 02:10.000]');
      expect(audio.card.recordingTitle).toBe('第一次访谈');
    }
    expect(doc.warnings).toEqual([]);
    expect(doc.stats).toEqual({ blockCount: 5, audioRefCount: 1, degradedCount: 0 });
  });

  it('clamps heading levels to 2..4', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'h1', type: 'heading', content: { text: 'a', level: 1 } },
        { id: 'h2', type: 'heading', content: { text: 'b', level: 9 } },
      ],
    });
    expect(doc.nodes[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(doc.nodes[1]).toMatchObject({ kind: 'heading', level: 4 });
  });

  it('degrades locally when a clip reference is missing', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'ok', type: 'paragraph', content: { text: '保留的正文。' } },
        { id: 'broken', type: 'paragraph', content: { text: '带引用的段落。' }, clipId: 'clip-gone', clip: null },
        { id: 'tail', type: 'paragraph', content: { text: '后续内容不受影响。' } },
      ],
    });

    const kinds = doc.nodes.map((node) => node.kind);
    expect(kinds).toEqual(['paragraph', 'paragraph', 'missing-audio', 'paragraph']);
    expect(doc.warnings).toHaveLength(1);
    expect(doc.warnings[0]).toMatchObject({
      blockId: 'broken',
      clipId: 'clip-gone',
      reason: 'CLIP_MISSING',
    });
    expect(doc.stats.degradedCount).toBe(1);
    // 其余内容完整保留
    const texts = doc.nodes.map((node) => ('text' in node ? node.text : '')).join('');
    expect(texts).toContain('保留的正文。');
    expect(texts).toContain('后续内容不受影响。');
  });

  it('degrades when the recording is not ready', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        {
          id: 'b1',
          type: 'audio',
          clipId: 'clip-1',
          clip: clip({ recordingStatus: 'PROCESSING' }),
        },
      ],
    });

    expect(doc.nodes[0].kind).toBe('missing-audio');
    expect(doc.warnings[0].reason).toBe('CLIP_NOT_READY');
  });

  it('degrades an audio-typed block without any clip reference', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [{ id: 'b1', type: 'audio', content: {} }],
    });

    expect(doc.nodes[0].kind).toBe('missing-audio');
    expect(doc.warnings[0]).toMatchObject({ clipId: null, reason: 'CLIP_MISSING' });
  });

  it('falls back to paragraph for unknown block types and splits blank lines', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'b1', type: 'rich-text', content: { text: '第一段。\n\n第二段。' } },
      ],
    });

    expect(doc.nodes.map((node) => node.kind)).toEqual(['paragraph', 'paragraph']);
    expect(doc.nodes[1]).toMatchObject({ id: 'b1#1', text: '第二段。' });
  });

  it('skips empty paragraphs and headings', () => {
    const doc = composeChapter({
      title: 't',
      blocks: [
        { id: 'b1', type: 'paragraph', content: { text: '   ' } },
        { id: 'b2', type: 'heading', content: { text: '' } },
      ],
    });

    expect(doc.nodes).toEqual([]);
  });
});
