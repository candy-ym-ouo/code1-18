/**
 * 章节排版渲染模块的数据模型。
 *
 * 输入（Export*）由调用方从数据库解析后传入；输出（ComposedDocument）
 * 是与渲染目标无关的文稿结构，可分别渲染为 HTML / Markdown / JSON。
 */

export interface ExportClipRef {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  summary?: string;
  transcript?: string;
  recordingTitle?: string | null;
  /** 所属录音状态；非 READY 时该引用按不可用做局部降级 */
  recordingStatus?: string | null;
}

export interface ExportBlock {
  id: string;
  type: string;
  /** 块内容（contentJson），段落类块约定为 { text: string } */
  content?: unknown;
  /** 原始音频引用 ID；clipId 存在而 clip 缺失时触发局部降级 */
  clipId?: string | null;
  clip?: ExportClipRef | null;
}

export interface ExportChapterInput {
  title: string;
  intro?: string;
  /** 调用方需按 position 升序传入 */
  blocks: ExportBlock[];
}

export type DegradeReason = 'CLIP_MISSING' | 'CLIP_NOT_READY';

export interface DegradationWarning {
  blockId: string;
  clipId: string | null;
  reason: DegradeReason;
  message: string;
}

export interface AudioCard {
  clipId: string;
  title: string;
  startMs: number;
  endMs: number;
  /** 形如 [00:01:02.500 – 00:02:10.000] 的时间标记，换行与分页中保持原子 */
  marker: string;
  summary: string;
  transcript: string;
  recordingTitle: string | null;
}

export type DocNode =
  | { kind: 'heading'; id: string; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; id: string; text: string }
  | { kind: 'quote'; id: string; text: string; cite: string | null }
  | { kind: 'divider'; id: string }
  | { kind: 'audio'; id: string; card: AudioCard }
  | {
      kind: 'missing-audio';
      id: string;
      clipId: string | null;
      reason: DegradeReason;
      note: string;
    };

export interface ComposeStats {
  blockCount: number;
  audioRefCount: number;
  degradedCount: number;
}

export interface ComposedDocument {
  title: string;
  intro: string;
  nodes: DocNode[];
  warnings: DegradationWarning[];
  stats: ComposeStats;
}
