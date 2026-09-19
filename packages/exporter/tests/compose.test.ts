import { describe, expect, it } from 'vitest';
import {
  composeChapter,
  MISSING_MARKER,
  type ExportChapterInput,
} from '../src/index.js';

const readyClip = {
  id: 'clip-1',
  title: '渡江',
  startMs: 61_500,
  endMs: 75_000,
  transcript: '我们坐船过了江。',
  speakerName: '祖父',
  recording: { id: 'rec-1', title: '访谈一', status: 'READY' },
};

function chapter(blocks: ExportChapterInput['blocks']): ExportChapterInput {
  return { title: '第一章 童年', intro: '这一章记录祖父的童年。', blocks };
}

describe('composeChapter', () => {
  it('composes title, intro and text blocks in position order', () => {
    const composed = composeChapter(
      chapter([
        { id: 'b2', type: 'paragraph', position: 'b', content: { text: '第二段' } },
        { id: 'b1', type: 'heading', position: 'a', content: { text: '小镇' } },
      ]),
    );

    expect(composed.blocks.map((block) => block.role)).toEqual([
      'title',
      'intro',
      'heading',
      'paragraph',
    ]);
    expect(composed.blockCount).toBe(2);
    expect(composed.degradedCount).toBe(0);
  });

  it('builds a citation block with an atomic time marker and transcript body', () => {
    const composed = composeChapter(
      chapter([
        { id: 'b1', type: 'clip', position: 'a', clipId: readyClip.id, clip: readyClip },
      ]),
    );
    const citation = composed.blocks.find((block) => block.role === 'citation');

    expect(citation).toBeDefined();
    const markerPart = citation!.paragraphs[0].find((part) => part.atomic);
    expect(markerPart?.text).toBe('〔01:01.500–01:15.000〕');
    expect(citation!.paragraphs[0].map((part) => part.text).join('')).toContain(
      '《渡江》 · 讲述：祖父 · 录音《访谈一》',
    );
    expect(citation!.paragraphs[1]).toEqual([{ text: '我们坐船过了江。' }]);
    expect(composed.degradedCount).toBe(0);
  });

  it('degrades locally when the referenced clip is missing', () => {
    const composed = composeChapter(
      chapter([
        { id: 'b1', type: 'paragraph', position: 'a', content: { text: '前文。' } },
        { id: 'b2', type: 'clip', position: 'b', clipId: 'gone', clip: null },
        { id: 'b3', type: 'paragraph', position: 'c', content: { text: '后文。' } },
      ]),
    );

    const roles = composed.blocks.map((block) => block.role);
    expect(roles).toEqual(['title', 'intro', 'paragraph', 'missing', 'paragraph']);
    const missing = composed.blocks.find((block) => block.role === 'missing');
    expect(missing!.paragraphs[0].map((part) => part.text).join('')).toContain(
      MISSING_MARKER,
    );
    expect(missing!.degraded?.reason).toBe('clip-missing');
    expect(composed.degradedCount).toBe(1);
  });

  it('treats a soft-deleted clip as missing without leaking its content', () => {
    const composed = composeChapter(
      chapter([
        {
          id: 'b1',
          type: 'clip',
          position: 'a',
          clipId: readyClip.id,
          clip: { ...readyClip, deletedAt: new Date('2026-09-01') },
        },
      ]),
    );
    const missing = composed.blocks.find((block) => block.role === 'missing');

    expect(missing).toBeDefined();
    expect(JSON.stringify(missing)).not.toContain('渡江');
    expect(composed.degradedCount).toBe(1);
  });

  it('keeps the time marker but flags the block when the recording is not ready', () => {
    const composed = composeChapter(
      chapter([
        {
          id: 'b1',
          type: 'clip',
          position: 'a',
          clipId: readyClip.id,
          clip: {
            ...readyClip,
            recording: { id: 'rec-1', title: '访谈一', status: 'PROCESSING' },
          },
        },
      ]),
    );
    const citation = composed.blocks.find((block) => block.role === 'citation');

    expect(citation).toBeDefined();
    expect(citation!.degraded?.reason).toBe('recording-not-ready');
    const line = citation!.paragraphs[0].map((part) => part.text).join('');
    expect(line).toContain('〔01:01.500–01:15.000〕');
    expect(line).toContain('暂不可播放');
    expect(composed.degradedCount).toBe(1);
  });

  it('appends the time marker inline for text blocks that reference a clip', () => {
    const composed = composeChapter(
      chapter([
        {
          id: 'b1',
          type: 'paragraph',
          position: 'a',
          content: { text: '祖父回忆起渡江那天。' },
          clipId: readyClip.id,
          clip: readyClip,
        },
      ]),
    );
    const paragraph = composed.blocks.find((block) => block.role === 'paragraph');

    const last = paragraph!.paragraphs.at(-1)!;
    expect(last.at(-1)).toEqual({ text: '〔01:01.500–01:15.000〕', atomic: true });
    expect(composed.degradedCount).toBe(0);
  });

  it('marks text blocks whose clip reference is gone', () => {
    const composed = composeChapter(
      chapter([
        {
          id: 'b1',
          type: 'paragraph',
          position: 'a',
          content: { text: '这里原本有一段录音。' },
          clipId: 'gone',
          clip: null,
        },
      ]),
    );
    const paragraph = composed.blocks.find((block) => block.role === 'paragraph');

    expect(paragraph!.degraded?.reason).toBe('clip-missing');
    expect(paragraph!.paragraphs.at(-1)!.at(-1)).toEqual({
      text: MISSING_MARKER,
      atomic: true,
    });
    expect(composed.degradedCount).toBe(1);
  });

  it('degrades a clip block that has no reference at all', () => {
    const composed = composeChapter(
      chapter([{ id: 'b1', type: 'clip', position: 'a' }]),
    );
    const missing = composed.blocks.find((block) => block.role === 'missing');

    expect(missing!.degraded?.reason).toBe('no-reference');
    expect(composed.degradedCount).toBe(1);
  });

  it('skips empty text blocks and tolerates unusual content shapes', () => {
    const composed = composeChapter(
      chapter([
        { id: 'b1', type: 'paragraph', position: 'a', content: { text: '  ' } },
        { id: 'b2', type: 'paragraph', position: 'b', content: 42 },
        { id: 'b3', type: 'paragraph', position: 'c', content: { text: '有效段落' } },
      ]),
    );

    expect(composed.blocks.map((block) => block.role)).toEqual([
      'title',
      'intro',
      'paragraph',
    ]);
  });
});
