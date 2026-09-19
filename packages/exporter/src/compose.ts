import { formatTimeRange } from './time.js';
import type {
  BlockRole,
  ComposedBlock,
  ComposedChapter,
  DegradeInfo,
  DegradeReason,
  ExportBlockInput,
  ExportChapterInput,
  ExportClipInput,
  InlinePart,
} from './types.js';

/** 引用缺失时在文稿中显示的占位标记（同样是原子单元）。 */
export const MISSING_MARKER = '〔音频引用缺失〕';

const DEGRADE_MESSAGES: Record<DegradeReason, string> = {
  'no-reference': '此内容块未关联音频片段',
  'clip-missing': '引用的音频片段不存在或已删除',
  'recording-missing': '片段所属的录音信息缺失',
  'recording-not-ready': '片段录音尚未处理完成，暂不可播放',
};

const CLIP_BLOCK_TYPES = new Set(['clip', 'audio', 'audio-clip', 'recording']);

type ClipResolution =
  | { state: 'none' }
  | { state: 'missing'; degrade: DegradeInfo }
  | {
      state: 'ok';
      clip: ExportClipInput;
      marker: string;
      note: string | null;
      degrade: DegradeInfo | null;
    };

function degrade(reason: DegradeReason): DegradeInfo {
  return { reason, message: DEGRADE_MESSAGES[reason] };
}

/**
 * 解析内容块的音频引用。引用缺失只影响所在块（局部降级），
 * 不影响整篇文稿的导出。
 */
function resolveClip(block: ExportBlockInput): ClipResolution {
  const clip = block.clip ?? null;
  const clipId = block.clipId ?? clip?.id ?? null;
  if (!clipId && !clip) return { state: 'none' };
  if (!clip || clip.deletedAt) {
    return { state: 'missing', degrade: degrade('clip-missing') };
  }

  const marker = formatTimeRange(clip.startMs, clip.endMs);
  if (!clip.recording) {
    return {
      state: 'ok',
      clip,
      marker,
      note: DEGRADE_MESSAGES['recording-missing'],
      degrade: degrade('recording-missing'),
    };
  }
  if (clip.recording.status !== 'READY') {
    return {
      state: 'ok',
      clip,
      marker,
      note: DEGRADE_MESSAGES['recording-not-ready'],
      degrade: degrade('recording-not-ready'),
    };
  }
  return { state: 'ok', clip, marker, note: null, degrade: null };
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && 'text' in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return '';
}

function contentField(content: unknown, key: string): string | null {
  if (content && typeof content === 'object' && key in content) {
    const value = (content as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function textParagraphs(text: string): InlinePart[][] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => [{ text: line }]);
}

/** 在段落末尾追加引用标记；引用缺失时追加占位标记。 */
function withReference(
  paragraph: InlinePart[],
  resolution: ClipResolution,
): InlinePart[] {
  if (resolution.state === 'ok') {
    return [
      ...paragraph,
      { text: ' ' },
      { text: resolution.marker, atomic: true },
    ];
  }
  if (resolution.state === 'missing') {
    return [...paragraph, { text: ' ' }, { text: MISSING_MARKER, atomic: true }];
  }
  return paragraph;
}

function missingBlock(id: string, info: DegradeInfo): ComposedBlock {
  return {
    id,
    role: 'missing',
    paragraphs: [
      [{ text: MISSING_MARKER, atomic: true }, { text: `：${info.message}` }],
    ],
    degraded: info,
  };
}

/** 音频引文块：时间标记行 + 转写/摘要正文。 */
function composeClipBlock(
  block: ExportBlockInput,
  resolution: ClipResolution,
): ComposedBlock {
  if (resolution.state !== 'ok') {
    return missingBlock(
      block.id,
      resolution.state === 'none'
        ? degrade('no-reference')
        : resolution.degrade,
    );
  }

  const { clip, marker, note } = resolution;
  const citation: InlinePart[] = [
    { text: '▸ 音频片段 ' },
    { text: marker, atomic: true },
  ];
  const title = clip.title.trim();
  if (title) citation.push({ text: ` 《${title}》` });
  const speaker = clip.speakerName?.trim();
  if (speaker) citation.push({ text: ` · 讲述：${speaker}` });
  const recordingTitle = clip.recording?.title?.trim();
  if (recordingTitle) citation.push({ text: ` · 录音《${recordingTitle}》` });
  if (note) citation.push({ text: ` （${note}）` });

  const bodyText = clip.transcript?.trim() || clip.summary?.trim() || '';
  const body = bodyText
    ? textParagraphs(bodyText)
    : [[{ text: '（暂无转写内容）' }]];

  return {
    id: block.id,
    role: 'citation',
    paragraphs: [citation, ...body],
    degraded: resolution.degrade ?? undefined,
  };
}

function composeTextBlock(
  block: ExportBlockInput,
  resolution: ClipResolution,
  role: BlockRole,
): ComposedBlock | null {
  const text = contentText(block.content);
  const paragraphs = textParagraphs(text);
  const degraded =
    resolution.state === 'missing' ? resolution.degrade : undefined;

  if (role === 'heading') {
    const heading = paragraphs.map((line) => line[0].text).join(' ');
    if (!heading) return null;
    return {
      id: block.id,
      role,
      paragraphs: [withReference([{ text: heading }], resolution)],
      degraded,
    };
  }

  if (role === 'quote') {
    if (!paragraphs.length) return null;
    const attribution = contentField(block.content, 'attribution');
    const body = paragraphs.map((line) => line);
    body[body.length - 1] = withReference(body[body.length - 1], resolution);
    if (attribution) body.push([{ text: `—— ${attribution}` }]);
    return { id: block.id, role, paragraphs: body, degraded };
  }

  // 普通段落
  if (!paragraphs.length) {
    // 空文本段落：只有挂了引用时才在文稿中留痕
    if (resolution.state === 'ok') {
      return {
        id: block.id,
        role,
        paragraphs: [[{ text: resolution.marker, atomic: true }]],
      };
    }
    if (resolution.state === 'missing') {
      return {
        id: block.id,
        role,
        paragraphs: [[{ text: MISSING_MARKER, atomic: true }]],
        degraded: resolution.degrade,
      };
    }
    return null;
  }

  paragraphs[paragraphs.length - 1] = withReference(
    paragraphs[paragraphs.length - 1],
    resolution,
  );
  return { id: block.id, role, paragraphs, degraded };
}

function composeBlock(block: ExportBlockInput): ComposedBlock | null {
  const resolution = resolveClip(block);
  const type = block.type.trim().toLowerCase() || 'paragraph';

  if (CLIP_BLOCK_TYPES.has(type)) return composeClipBlock(block, resolution);
  if (type === 'divider' || type === 'separator') {
    return { id: block.id, role: 'divider', paragraphs: [[{ text: '⸻' }]] };
  }
  if (type === 'heading' || type === 'title') {
    return composeTextBlock(block, resolution, 'heading');
  }
  if (type === 'quote' || type === 'blockquote') {
    return composeTextBlock(block, resolution, 'quote');
  }
  return composeTextBlock(block, resolution, 'paragraph');
}

/**
 * 把章节的内容块与音频引用编排成可分页的文稿模型。
 * 引用缺失的块降级为占位内容，其余块正常编排。
 */
export function composeChapter(chapter: ExportChapterInput): ComposedChapter {
  const sorted = [...chapter.blocks].sort((a, b) => {
    const pa = a.position ?? '';
    const pb = b.position ?? '';
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });

  const blocks: ComposedBlock[] = [
    {
      id: 'chapter-title',
      role: 'title',
      paragraphs: [[{ text: chapter.title.trim() || '未命名章节' }]],
    },
  ];

  const intro = chapter.intro?.trim() ?? '';
  if (intro) {
    blocks.push({
      id: 'chapter-intro',
      role: 'intro',
      paragraphs: textParagraphs(intro),
    });
  }

  let degradedCount = 0;
  for (const block of sorted) {
    const composed = composeBlock(block);
    if (!composed) continue;
    if (composed.degraded) degradedCount += 1;
    blocks.push(composed);
  }

  return {
    title: chapter.title.trim() || '未命名章节',
    blocks,
    blockCount: sorted.length,
    degradedCount,
  };
}
