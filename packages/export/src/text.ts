/**
 * 文本分词与换行。
 *
 * 分词时把时间标记识别为原子 token：换行只发生在 token 边界，
 * 因此分页（以行为最小单位）永远不可能截断时间标记。
 * 全角字符按 2 个宽度单位计，半角按 1 个计。
 */

import { TIME_MARKER_AT_START } from './time.js';

export interface TextToken {
  text: string;
  /** 与前一个 token 之间的空白（行首渲染时丢弃） */
  prefix: string;
  /** 原子 token（时间标记）：换行与分页都不得将其拆开 */
  atomic: boolean;
}

export interface WrappedLine {
  tokens: TextToken[];
}

// 全角/宽字符区间：Hangul Jamo、CJK 部首与符号、假名、CJK 扩展 A、
// CJK 统一表意、韩文音节、兼容表意、CJK 兼容形式、全角 ASCII、全角符号。
const WIDE_CHAR =
  /[ᄀ-ᅟ⺀-〾぀-ヿ㐀-䶿一-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += WIDE_CHAR.test(ch) ? 2 : 1;
  }
  return width;
}

export function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const source = text.replace(/\s+/g, ' ');
  let pendingPrefix = '';
  let word = '';
  let index = 0;

  const flushWord = () => {
    if (!word) return;
    tokens.push({ text: word, prefix: pendingPrefix, atomic: false });
    word = '';
    pendingPrefix = '';
  };

  while (index < source.length) {
    const ch = source[index];
    if (ch === ' ') {
      flushWord();
      pendingPrefix = ' ';
      index += 1;
      continue;
    }
    if (ch === '[') {
      const marker = TIME_MARKER_AT_START.exec(source.slice(index));
      if (marker) {
        flushWord();
        tokens.push({ text: marker[0], prefix: pendingPrefix, atomic: true });
        pendingPrefix = '';
        index += marker[0].length;
        continue;
      }
    }
    if (WIDE_CHAR.test(ch)) {
      flushWord();
      tokens.push({ text: ch, prefix: pendingPrefix, atomic: false });
      pendingPrefix = '';
      index += 1;
      continue;
    }
    word += ch;
    index += 1;
  }
  flushWord();
  return tokens;
}

/**
 * 贪心换行。原子 token 永不拆分；比行宽还长的 token 独占一行
 * （允许溢出，但绝不截断）。
 */
export function wrapTokens(tokens: TextToken[], lineWidth: number): WrappedLine[] {
  const width = Math.max(1, Math.floor(lineWidth));
  const lines: WrappedLine[] = [];
  let current: TextToken[] = [];
  let currentWidth = 0;

  for (const token of tokens) {
    const tokenWidth = displayWidth(token.text);
    if (current.length === 0) {
      current = [token];
      currentWidth = tokenWidth;
      continue;
    }
    const added = displayWidth(token.prefix) + tokenWidth;
    if (currentWidth + added > width) {
      lines.push({ tokens: current });
      current = [token];
      currentWidth = tokenWidth;
    } else {
      current.push(token);
      currentWidth += added;
    }
  }
  if (current.length > 0) lines.push({ tokens: current });
  return lines;
}

export function lineToString(line: WrappedLine): string {
  return line.tokens
    .map((token, index) => (index === 0 ? '' : token.prefix) + token.text)
    .join('');
}

/** 把若干行重新拼成文本（行首空白丢弃，即换行点处的空白）。 */
export function linesToText(lines: WrappedLine[]): string {
  let text = '';
  let first = true;
  for (const line of lines) {
    for (const token of line.tokens) {
      if (!first) text += token.prefix;
      first = false;
      text += token.text;
    }
  }
  return text;
}
