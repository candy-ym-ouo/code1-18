/**
 * 章节编排：把内容块与音频引用组合成文稿节点模型。
 *
 * 局部降级策略：某个块的音频引用缺失（clipId 存在但 clip 未解析到）
 * 或所属录音未就绪时，仅该块渲染为占位节点并记录 warning，
 * 其余块不受影响。
 */

import type {
  ComposedDocument,
  DegradationWarning,
  DegradeReason,
  DocNode,
  ExportChapterInput,
} from './model.js';
import { formatTimeMarker } from './time.js';

const AUDIO_BLOCK_TYPES = new Set(['audio', 'clip', 'audio-ref']);

export interface ComposeOptions {
  /** 录音非 READY 的引用是否降级为占位块（默认 true） */
  requireReadyRecording?: boolean;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const text = (content as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return '';
}

function clampHeadingLevel(level: unknown): 2 | 3 | 4 {
  const value = typeof level === 'number' ? level : Number(level);
  if (!Number.isInteger(value)) return 2;
  return Math.min(4, Math.max(2, value)) as 2 | 3 | 4;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function composeChapter(
  input: ExportChapterInput,
  options: ComposeOptions = {},
): ComposedDocument {
  const requireReady = options.requireReadyRecording ?? true;
  const nodes: DocNode[] = [];
  const warnings: DegradationWarning[] = [];
  let audioRefCount = 0;

  splitParagraphs(input.intro ?? '').forEach((paragraph, index) => {
    nodes.push({ kind: 'paragraph', id: `intro#${index}`, text: paragraph });
  });

  for (const block of input.blocks) {
    const type = (block.type || 'paragraph').trim().toLowerCase();
    const content =
      block.content && typeof block.content === 'object'
        ? (block.content as Record<string, unknown>)
        : {};
    const text = extractText(block.content);

    // 文本部分：未知类型按段落渲染（宽容降级）
    if (type === 'divider') {
      nodes.push({ kind: 'divider', id: block.id });
    } else if (type === 'heading') {
      if (text.trim()) {
        nodes.push({
          kind: 'heading',
          id: block.id,
          level: clampHeadingLevel(content.level),
          text: text.trim(),
        });
      }
    } else if (type === 'quote') {
      if (text.trim()) {
        nodes.push({
          kind: 'quote',
          id: block.id,
          text: text.trim(),
          cite: typeof content.cite === 'string' && content.cite.trim() ? content.cite.trim() : null,
        });
      }
    } else {
      splitParagraphs(text).forEach((paragraph, index) => {
        nodes.push({
          kind: 'paragraph',
          id: index === 0 ? block.id : `${block.id}#${index}`,
          text: paragraph,
        });
      });
    }

    // 音频引用部分
    const wantsAudio = AUDIO_BLOCK_TYPES.has(type) || Boolean(block.clipId);
    if (!wantsAudio) continue;

    const clip = block.clip ?? null;
    const notReady =
      requireReady &&
      clip !== null &&
      clip.recordingStatus != null &&
      clip.recordingStatus !== 'READY';

    if (clip && !notReady) {
      audioRefCount += 1;
      nodes.push({
        kind: 'audio',
        id: block.id,
        card: {
          clipId: clip.id,
          title: clip.title,
          startMs: clip.startMs,
          endMs: clip.endMs,
          marker: formatTimeMarker(clip.startMs, clip.endMs),
          summary: clip.summary ?? '',
          transcript: clip.transcript ?? '',
          recordingTitle: clip.recordingTitle ?? null,
        },
      });
      continue;
    }

    const reason: DegradeReason = clip ? 'CLIP_NOT_READY' : 'CLIP_MISSING';
    const clipId = block.clipId ?? clip?.id ?? null;
    const message = clip
      ? `音频尚未处理完成（片段 ${clipId ?? clip.id}），导出时已跳过该引用`
      : `音频引用缺失（片段 ${clipId ?? '未知'}），导出时已跳过该引用`;
    warnings.push({ blockId: block.id, clipId, reason, message });
    nodes.push({
      kind: 'missing-audio',
      id: block.id,
      clipId,
      reason,
      note: `⚠ ${message}。`,
    });
  }

  return {
    title: input.title,
    intro: input.intro ?? '',
    nodes,
    warnings,
    stats: {
      blockCount: input.blocks.length,
      audioRefCount,
      degradedCount: warnings.length,
    },
  };
}
