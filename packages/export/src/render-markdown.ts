/**
 * Markdown 渲染器：输出纯文本源格式（不分页），
 * 时间标记用行内代码保护，降级引用用警示块标注。
 */

import type { ComposedDocument } from './model.js';

export interface MarkdownRenderOptions {
  /** 注入生成时间，便于测试与复现 */
  generatedAt?: Date;
}

export function renderMarkdownDocument(
  doc: ComposedDocument,
  options: MarkdownRenderOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const parts: string[] = [];

  parts.push(`# ${doc.title}`);
  parts.push(
    `> 导出时间：${generatedAt.toISOString()} ｜ 内容块 ${doc.stats.blockCount} ｜ ` +
      `音频引用 ${doc.stats.audioRefCount} ｜ 引用降级 ${doc.stats.degradedCount}`,
  );

  for (const node of doc.nodes) {
    switch (node.kind) {
      case 'heading':
        parts.push(`${'#'.repeat(node.level)} ${node.text}`);
        break;
      case 'paragraph':
        parts.push(node.text);
        break;
      case 'quote':
        parts.push(node.cite ? `> ${node.text}\n>\n> —— ${node.cite}` : `> ${node.text}`);
        break;
      case 'divider':
        parts.push('---');
        break;
      case 'audio': {
        const card = node.card;
        const head =
          `▶ \`${card.marker}\` **${card.title}**` +
          (card.recordingTitle ? `（录音：${card.recordingTitle}）` : '');
        parts.push(
          [head, card.summary, card.transcript].filter(Boolean).join('\n\n'),
        );
        break;
      }
      case 'missing-audio':
        parts.push(`> [!WARNING]\n> ${node.note}`);
        break;
    }
  }

  return `${parts.join('\n\n')}\n`;
}
