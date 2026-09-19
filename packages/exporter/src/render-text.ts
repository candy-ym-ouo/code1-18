import type { PagedDocument } from './types.js';

/** 渲染为纯文本文稿，页与页之间用分页标记隔开。 */
export function renderText(document: PagedDocument): string {
  const out: string[] = [];
  document.pages.forEach((page, index) => {
    for (const line of page.lines) out.push(line.text);
    out.push('');
    out.push(`—— 第 ${page.number} 页 / 共 ${document.pages.length} 页 ——`);
    if (index < document.pages.length - 1) out.push('');
  });
  return `${out.join('\n')}\n`;
}
