import { composeChapter } from './compose.js';
import { paginate } from './paginate.js';
import { renderHtml } from './render-html.js';
import { renderText } from './render-text.js';
import type {
  ExportChapterInput,
  LayoutOptions,
  PagedDocument,
} from './types.js';

export * from './types.js';
export { MISSING_MARKER, composeChapter } from './compose.js';
export { isWideCodePoint, measureCells } from './measure.js';
export { paginate } from './paginate.js';
export { escapeHtml, renderHtml } from './render-html.js';
export { renderText } from './render-text.js';
export { formatTimeMarker, formatTimeRange } from './time.js';

export type ExportFormat = 'html' | 'text' | 'json';

export interface ExportOptions extends LayoutOptions {
  format?: ExportFormat;
}

/**
 * 一步导出章节：编排内容块与音频引用 → 分页 → 渲染。
 * 缺引用的块局部降级为占位标注，时间标记不会被分页截断。
 */
export function exportChapter(
  chapter: ExportChapterInput,
  options: ExportOptions = {},
): string | PagedDocument {
  const { format = 'html', ...layout } = options;
  const document = paginate(composeChapter(chapter), layout);
  if (format === 'json') return document;
  if (format === 'text') return renderText(document);
  return renderHtml(document);
}
