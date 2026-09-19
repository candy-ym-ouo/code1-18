export type {
  AudioCard,
  ComposedDocument,
  ComposeStats,
  DegradationWarning,
  DegradeReason,
  DocNode,
  ExportBlock,
  ExportChapterInput,
  ExportClipRef,
} from './model.js';

export {
  TIME_MARKER_REGEX,
  formatTime,
  formatTimeMarker,
} from './time.js';

export {
  displayWidth,
  linesToText,
  lineToString,
  tokenize,
  wrapTokens,
  type TextToken,
  type WrappedLine,
} from './text.js';

export { composeChapter, type ComposeOptions } from './compose.js';

export {
  layoutNode,
  paginateDocument,
  type Page,
  type PageItem,
  type PaginationOptions,
} from './paginate.js';

export {
  escapeHtml,
  renderHtmlDocument,
  type HtmlRenderOptions,
} from './render-html.js';

export {
  renderMarkdownDocument,
  type MarkdownRenderOptions,
} from './render-markdown.js';
