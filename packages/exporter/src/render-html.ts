import type { InlinePart, PageLine, PagedDocument } from './types.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderParts(parts: InlinePart[]): string {
  return parts
    .map((part) =>
      part.atomic
        ? `<span class="marker">${escapeHtml(part.text)}</span>`
        : escapeHtml(part.text),
    )
    .join('');
}

function renderLine(line: PageLine): string {
  if (line.role === 'blank') {
    return '      <div class="line line--blank" aria-hidden="true">&nbsp;</div>';
  }
  const classes = ['line', `line--${line.role}`];
  if (line.degraded) classes.push('line--degraded');
  return `      <p class="${classes.join(' ')}">${renderParts(line.parts)}</p>`;
}

const STYLES = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f0ea; color: #1f2933;
      font-family: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif; }
    .document { margin: 0 auto; max-width: 760px; padding: 32px 16px; }
    .page { background: #fff; padding: 48px 56px; margin: 0 auto 24px;
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12); }
    .line { margin: 0; font-size: 15px; line-height: 1.9; overflow-wrap: break-word; }
    .line--blank { height: 1em; }
    .line--title { font-size: 26px; font-weight: 700; text-align: center; }
    .line--intro { color: #52606d; }
    .line--heading { font-size: 19px; font-weight: 700; }
    .line--quote { color: #3e4c59; border-left: 3px solid #d9c9a3; padding-left: 12px; }
    .line--citation { border-left: 3px solid #c9b27c; padding-left: 12px; }
    .line--divider { color: #9aa5b1; text-align: center; }
    .line--missing { color: #9a3412; background: #fff7ed;
      border: 1px dashed #fdba74; border-radius: 4px; padding: 2px 8px; }
    .line--degraded { color: #9a3412; }
    .marker { white-space: nowrap; break-inside: avoid; page-break-inside: avoid;
      font-variant-numeric: tabular-nums; background: #f5f0e6;
      border-radius: 4px; padding: 0 2px; }
    .page-number { margin-top: 24px; color: #7b8794; font-size: 12px; text-align: center; }
    @page { size: A4; margin: 18mm; }
    @media print {
      body { background: #fff; }
      .document { max-width: none; padding: 0; }
      .page { box-shadow: none; margin: 0; padding: 0; page-break-after: always; }
    }
`;

/** 渲染为独立 HTML 文稿，可直接保存或打印导出。 */
export function renderHtml(document: PagedDocument): string {
  const pages = document.pages
    .map((page) => {
      const lines = page.lines.map(renderLine).join('\n');
      return [
        `    <section class="page" data-page="${page.number}">`,
        lines,
        `      <footer class="page-number">第 ${page.number} 页 / 共 ${document.pages.length} 页</footer>`,
        '    </section>',
      ].join('\n');
    })
    .join('\n');

  const degradedNote =
    document.degradedCount > 0
      ? `      <p class="line line--missing">本章节有 ${document.degradedCount} 处音频引用缺失或暂不可用，已按原位置标注。</p>\n`
      : '';

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="@history/exporter" />
    <title>${escapeHtml(document.title)}</title>
    <style>${STYLES}    </style>
  </head>
  <body>
    <main class="document">
${degradedNote}${pages}
    </main>
  </body>
</html>
`;
}
