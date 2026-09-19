/**
 * HTML 渲染器：输出自包含（内联样式）的可打印文稿。
 *
 * 分页模式把 paginateDocument 的结果渲染为 .page 区块
 * （page-break-after: always）；时间标记同时用 CSS
 * （white-space: nowrap + inline-block）保护，浏览器自身的
 * 打印分页也不会截断它。
 */

import type { AudioCard, ComposedDocument, DocNode } from './model.js';
import {
  paginateDocument,
  type Page,
  type PageItem,
  type PaginationOptions,
} from './paginate.js';
import { TIME_MARKER_REGEX } from './time.js';
import { tokenize, wrapTokens, type WrappedLine } from './text.js';

export interface HtmlRenderOptions extends PaginationOptions {
  /** 是否按页渲染（默认 true）；false 时输出连续流式文档 */
  paginate?: boolean;
  /** 注入生成时间，便于测试与复现 */
  generatedAt?: Date;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f3f4f6; color: #1f2933;
  font-family: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif; }
.doc-header, .page, .flow, .doc-footer { max-width: 720px; margin: 0 auto; }
.doc-header { padding: 48px 40px 4px; }
.doc-header h1 { margin: 0 0 8px; font-size: 28px; }
.doc-meta { margin: 0 0 8px; color: #6b7280; font-size: 13px; }
.doc-notice { margin: 0 0 8px; padding: 8px 12px; border: 1px solid #f59e0b55;
  border-radius: 6px; background: #fef3c7; font-size: 13px; }
.page { margin-top: 16px; padding: 40px; background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); page-break-after: always; }
.flow { margin-top: 16px; padding: 8px 40px 40px; background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
h2, h3, h4 { margin: 20px 0 10px; line-height: 1.5; }
p { margin: 0 0 12px; line-height: 1.9; text-align: justify; }
p.continued { text-indent: 2em; }
blockquote { margin: 0 0 12px; padding: 4px 16px; border-left: 3px solid #d1d5db;
  color: #374151; line-height: 1.9; }
hr { margin: 20px auto; width: 48px; border: 0; border-top: 1px solid #d1d5db; }
.time-marker { display: inline-block; white-space: nowrap; padding: 0 4px;
  border-radius: 4px; background: #eef2ff; font-size: 0.92em;
  font-variant-numeric: tabular-nums; }
.audio-ref { margin: 0 0 16px; padding: 12px 16px; border: 1px solid #e5e7eb;
  border-left: 3px solid #d97706; border-radius: 6px; background: #fffbeb; }
.audio-ref figcaption { margin-bottom: 6px; font-weight: 600; }
.audio-ref .recording { color: #6b7280; font-size: 13px; font-weight: 400; }
.audio-ref p { margin: 6px 0 0; }
.audio-ref.part { border-left-style: dashed; }
.missing-audio { margin: 0 0 16px; padding: 10px 16px; border: 1px dashed #d1d5db;
  border-radius: 6px; background: #f9fafb; color: #6b7280; font-size: 14px; }
.doc-footer { padding: 24px 40px 48px; color: #9ca3af; font-size: 12px; text-align: center; }
@media print {
  body { background: #fff; }
  .page, .flow { margin: 0; box-shadow: none; }
}
`.trim();

/** 把行内 token 渲染为 HTML，原子 token（时间标记）包上保护 span。 */
function tokensToHtml(lines: WrappedLine[]): string {
  let html = '';
  let first = true;
  for (const line of lines) {
    for (const token of line.tokens) {
      if (!first) html += escapeHtml(token.prefix);
      first = false;
      const text = escapeHtml(token.text);
      html += token.atomic ? `<span class="time-marker">${text}</span>` : text;
    }
  }
  return html;
}

/** 连续流式渲染用：转义后把时间标记替换为保护 span。 */
function textWithMarkersHtml(text: string): string {
  return escapeHtml(text).replace(
    TIME_MARKER_REGEX,
    (marker) => `<span class="time-marker">${marker}</span>`,
  );
}

function renderAudioFigure(card: AudioCard): string {
  const recording = card.recordingTitle
    ? ` <span class="recording">（录音：${escapeHtml(card.recordingTitle)}）</span>`
    : '';
  const summary = card.summary
    ? `<p class="summary">${textWithMarkersHtml(card.summary)}</p>`
    : '';
  const transcript = card.transcript
    ? `<p class="transcript">${textWithMarkersHtml(card.transcript)}</p>`
    : '';
  return (
    `<figure class="audio-ref" data-clip-id="${escapeHtml(card.clipId)}" ` +
    `data-start-ms="${card.startMs}" data-end-ms="${card.endMs}">` +
    `<figcaption><span class="play" aria-hidden="true">▶</span> ` +
    `<span class="time-marker">${escapeHtml(card.marker)}</span> ` +
    `<span class="clip-title">${escapeHtml(card.title)}</span>${recording}</figcaption>` +
    `${summary}${transcript}</figure>`
  );
}

function renderMissingAudio(node: Extract<DocNode, { kind: 'missing-audio' }>): string {
  const clipId = node.clipId ? ` data-clip-id="${escapeHtml(node.clipId)}"` : '';
  return `<aside class="missing-audio" role="note"${clipId}>${escapeHtml(node.note)}</aside>`;
}

/** 分页模式：渲染一个页面条目（可能是跨页节点的一部分）。 */
function renderPageItem(item: PageItem): string {
  const { node } = item;
  switch (node.kind) {
    case 'heading': {
      const tag = `h${node.level}`;
      return `<${tag}>${tokensToHtml(item.lines)}</${tag}>`;
    }
    case 'paragraph':
      return `<p${item.continued ? ' class="continued"' : ''}>${tokensToHtml(item.lines)}</p>`;
    case 'quote':
      return `<blockquote>${tokensToHtml(item.lines)}</blockquote>`;
    case 'divider':
      return '<hr>';
    case 'missing-audio':
      return renderMissingAudio(node);
    case 'audio': {
      const unsplit = !item.continued && item.lines.length === item.totalLines;
      if (unsplit) return renderAudioFigure(node.card);
      const header = item.lines.slice(0, item.headerLines);
      const body = item.lines.slice(item.headerLines);
      const caption = header.length
        ? `<figcaption>${tokensToHtml(header)}</figcaption>`
        : '';
      const bodyHtml = body
        .map((line) => `<p>${tokensToHtml([line])}</p>`)
        .join('');
      return (
        `<figure class="audio-ref part" data-clip-id="${escapeHtml(node.card.clipId)}">` +
        `${caption}${bodyHtml}</figure>`
      );
    }
  }
}

/** 连续流式渲染：直接渲染完整节点。 */
function renderFlowNode(node: DocNode): string {
  switch (node.kind) {
    case 'heading': {
      const tag = `h${node.level}`;
      return `<${tag}>${textWithMarkersHtml(node.text)}</${tag}>`;
    }
    case 'paragraph':
      return `<p>${textWithMarkersHtml(node.text)}</p>`;
    case 'quote': {
      const cite = node.cite ? `<footer>—— ${escapeHtml(node.cite)}</footer>` : '';
      return `<blockquote><p>${textWithMarkersHtml(node.text)}</p>${cite}</blockquote>`;
    }
    case 'divider':
      return '<hr>';
    case 'missing-audio':
      return renderMissingAudio(node);
    case 'audio':
      return renderAudioFigure(node.card);
  }
}

function renderPage(page: Page): string {
  const items = page.items.map(renderPageItem).join('\n');
  return `<section class="page" data-page="${page.index}">\n${items}\n</section>`;
}

export function renderHtmlDocument(
  doc: ComposedDocument,
  options: HtmlRenderOptions = {},
): string {
  const { paginate = true, pageLines, lineWidth, generatedAt = new Date() } = options;

  const body = paginate
    ? paginateDocument(doc, { pageLines, lineWidth }).map(renderPage).join('\n')
    : `<main class="flow">\n${doc.nodes.map(renderFlowNode).join('\n')}\n</main>`;

  const notice = doc.warnings.length
    ? `<p class="doc-notice">⚠ ${doc.warnings.length} 处音频引用不可用，已在文中以占位块标注，其余内容不受影响。</p>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · 章节导出</title>
<style>
${STYLES}
</style>
</head>
<body>
<header class="doc-header">
<h1>${escapeHtml(doc.title)}</h1>
<p class="doc-meta">内容块 ${doc.stats.blockCount} · 音频引用 ${doc.stats.audioRefCount} · 引用降级 ${doc.stats.degradedCount} · 生成于 ${generatedAt.toISOString()}</p>
${notice}
</header>
${body}
<footer class="doc-footer">口述家史编辑器 · 章节导出</footer>
</body>
</html>
`;
}

// 供测试与调试使用
export const __internals = { tokensToHtml, tokenize, wrapTokens };
