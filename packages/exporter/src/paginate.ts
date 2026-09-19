import { isWideCodePoint, measureCells } from './measure.js';
import type {
  ComposedBlock,
  ComposedChapter,
  InlinePart,
  LayoutOptions,
  Page,
  PagedDocument,
  PageLine,
} from './types.js';

const DEFAULT_LINE_CELLS = 40;
const DEFAULT_PAGE_LINES = 36;

interface Token {
  text: string;
  cells: number;
  atomic: boolean;
  space: boolean;
}

/**
 * 把行内片段切成排版用记号。原子片段（时间标记等）整体成为一个
 * 记号，永远不会被切开；全角字符逐字成记号，连续的半角字符
 * 组成词，空白折叠为单个空格。
 */
function tokenize(parts: InlinePart[]): Token[] {
  const tokens: Token[] = [];
  const push = (token: Token) => {
    const last = tokens[tokens.length - 1];
    if (token.space && (!last || last.space)) return;
    tokens.push(token);
  };

  for (const part of parts) {
    if (!part.text) continue;
    if (part.atomic) {
      push({ text: part.text, cells: measureCells(part.text), atomic: true, space: false });
      continue;
    }
    let word = '';
    const flushWord = () => {
      if (!word) return;
      push({ text: word, cells: measureCells(word), atomic: false, space: false });
      word = '';
    };
    for (const char of part.text) {
      if (char === ' ' || char === '\t') {
        flushWord();
        push({ text: ' ', cells: 1, atomic: false, space: true });
      } else if (isWideCodePoint(char.codePointAt(0) ?? 0)) {
        flushWord();
        push({ text: char, cells: 2, atomic: false, space: false });
      } else {
        word += char;
      }
    }
    flushWord();
  }
  return tokens;
}

function tokensToParts(tokens: Token[]): InlinePart[] {
  const parts: InlinePart[] = [];
  for (const token of tokens) {
    const last = parts[parts.length - 1];
    if (!token.atomic && last && !last.atomic) {
      last.text += token.text;
    } else {
      parts.push({ text: token.text, atomic: token.atomic || undefined });
    }
  }
  return parts;
}

/**
 * 贪心折行。记号放不下时整体移到下一行；比整行还宽的原子记号
 * 独占一行并允许溢出，但绝不拆开。
 */
function wrapParts(parts: InlinePart[], lineCells: number): InlinePart[][] {
  const tokens = tokenize(parts);
  const lines: InlinePart[][] = [];
  let current: Token[] = [];
  let currentCells = 0;

  const pushLine = () => {
    while (current.length && current[current.length - 1].space) current.pop();
    if (current.length) lines.push(tokensToParts(current));
    current = [];
    currentCells = 0;
  };

  for (const token of tokens) {
    if (token.space && current.length === 0) continue;
    if (currentCells > 0 && currentCells + token.cells > lineCells) {
      pushLine();
      if (token.space) continue;
    }
    current.push(token);
    currentCells += token.cells;
  }
  pushLine();
  return lines;
}

function blockLines(block: ComposedBlock, lineCells: number): PageLine[] {
  const lines: PageLine[] = [];
  block.paragraphs.forEach((paragraph, paragraphIndex) => {
    for (const parts of wrapParts(paragraph, lineCells)) {
      lines.push({
        parts,
        text: parts.map((part) => part.text).join(''),
        role: block.role,
        blockId: block.id,
        // 标题与引文的时间标记行不与后续内容分页分离
        keepWithNext:
          block.role === 'title' ||
          block.role === 'heading' ||
          (block.role === 'citation' && paragraphIndex === 0),
        degraded: block.degraded ? true : undefined,
      });
    }
  });
  return lines;
}

function assembleLines(chapter: ComposedChapter, lineCells: number): PageLine[] {
  const lines: PageLine[] = [];
  for (const block of chapter.blocks) {
    const own = blockLines(block, lineCells);
    if (!own.length) continue;
    if (lines.length) {
      lines.push({
        parts: [],
        text: '',
        role: 'blank',
        blockId: '',
        keepWithNext: false,
      });
    }
    lines.push(...own);
  }
  return lines;
}

function clampOption(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(200, Math.max(4, Math.floor(value)));
}

/**
 * 把编排好的章节分页。行是分页的最小单位，而时间标记在行内
 * 又是不可拆分的原子记号，因此任何时间标记都会完整地出现在
 * 同一页内，不会被页边界截断。
 */
export function paginate(
  chapter: ComposedChapter,
  options: LayoutOptions = {},
): PagedDocument {
  const lineCells = clampOption(options.lineCells, DEFAULT_LINE_CELLS);
  const pageLines = clampOption(options.pageLines, DEFAULT_PAGE_LINES);
  const flat = assembleLines(chapter, lineCells);

  const pages: Page[] = [];
  let current: PageLine[] = [];

  const flushPage = (final: boolean) => {
    while (current.length && current[current.length - 1].role === 'blank') {
      current.pop();
    }
    if (!final) {
      // 孤行控制：页尾需要与下一行保持在一起的行，整体移到下一页
      const carried: PageLine[] = [];
      while (current.length && current[current.length - 1].keepWithNext) {
        carried.unshift(current.pop()!);
      }
      if (current.length) {
        pages.push({ number: pages.length + 1, lines: current });
      }
      current = carried;
      return;
    }
    if (current.length) {
      pages.push({ number: pages.length + 1, lines: current });
    }
    current = [];
  };

  for (const line of flat) {
    if (current.length >= pageLines) flushPage(false);
    if (line.role === 'blank' && current.length === 0) continue;
    current.push(line);
  }
  flushPage(true);

  if (!pages.length) {
    pages.push({ number: 1, lines: [] });
  }

  return {
    title: chapter.title,
    pages,
    lineCells,
    pageLines,
    blockCount: chapter.blockCount,
    degradedCount: chapter.degradedCount,
  };
}
