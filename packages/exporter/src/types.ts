/** 导出的录音信息（片段所属音频）。 */
export interface ExportRecordingInput {
  id: string;
  title: string;
  status: string;
}

/** 导出的音频片段引用。 */
export interface ExportClipInput {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  summary?: string | null;
  transcript?: string | null;
  speakerName?: string | null;
  deletedAt?: string | Date | null;
  recording?: ExportRecordingInput | null;
}

/** 导出的章节内容块。 */
export interface ExportBlockInput {
  id: string;
  type: string;
  position?: string;
  content?: unknown;
  clipId?: string | null;
  clip?: ExportClipInput | null;
}

/** 导出的章节。 */
export interface ExportChapterInput {
  id?: string;
  title: string;
  intro?: string | null;
  blocks: ExportBlockInput[];
}

/** 引用降级原因。 */
export type DegradeReason =
  | 'no-reference'
  | 'clip-missing'
  | 'recording-missing'
  | 'recording-not-ready';

export interface DegradeInfo {
  reason: DegradeReason;
  message: string;
}

/**
 * 行内片段。atomic 为 true 时是原子单元（例如时间标记），
 * 换行与分页都不得把它拆开。
 */
export interface InlinePart {
  text: string;
  atomic?: boolean;
}

export type BlockRole =
  | 'title'
  | 'intro'
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'divider'
  | 'citation'
  | 'missing';

/** 排版后的内容块：若干段落，每段由若干行内片段组成。 */
export interface ComposedBlock {
  id: string;
  role: BlockRole;
  paragraphs: InlinePart[][];
  degraded?: DegradeInfo;
}

/** 编排完成、等待分页的章节文稿。 */
export interface ComposedChapter {
  title: string;
  blocks: ComposedBlock[];
  blockCount: number;
  degradedCount: number;
}

export type LineRole = BlockRole | 'blank';

export interface PageLine {
  text: string;
  parts: InlinePart[];
  role: LineRole;
  blockId: string;
  /** 与下一行保持在同一页（标题、引文行不孤行）。 */
  keepWithNext: boolean;
  degraded?: boolean;
}

export interface Page {
  number: number;
  lines: PageLine[];
}

/** 分页完成的可导出文稿。 */
export interface PagedDocument {
  title: string;
  pages: Page[];
  lineCells: number;
  pageLines: number;
  blockCount: number;
  degradedCount: number;
}

export interface LayoutOptions {
  /** 每行可容纳的字符格数（全角字符占两格）。 */
  lineCells?: number;
  /** 每页行数。 */
  pageLines?: number;
}
