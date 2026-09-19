/**
 * 分页器：把文稿节点排版成固定行高的页面。
 *
 * 不变量：分页不得截断时间标记。实现上依赖两点——
 * 1. 分词阶段时间标记已是原子 token，行内换行不会拆开它；
 * 2. 分页只发生在行边界（原子块整体移动，超长块按行切分）。
 * 另外音频卡片的头部行（含时间标记）与正文首行保持不分离，
 * 标题与其后续内容保持不分离（keep-with-next）。
 */

import type { ComposedDocument, DocNode } from './model.js';
import { tokenize, wrapTokens, type TextToken, type WrappedLine } from './text.js';

export interface PaginationOptions {
  /** 每页可容纳的行数（含节点间空行），默认 36 */
  pageLines?: number;
  /** 每行宽度（全角计 2 个单位），默认 64 */
  lineWidth?: number;
}

export interface PageItem {
  node: DocNode;
  lines: WrappedLine[];
  /** 是否为跨页节点的后续部分 */
  continued: boolean;
  /** 本部分开头的头部行数（音频卡片的时间标记行），延续部分为 0 */
  headerLines: number;
  /** 节点完整行数，用于判断是否为未切分的整体 */
  totalLines: number;
}

export interface Page {
  index: number;
  items: PageItem[];
  lineCount: number;
}

interface LaidOutNode {
  node: DocNode;
  lines: WrappedLine[];
  /** 不可按行切分（标题、分隔符、占位块） */
  atomic: boolean;
  /** 与下一个节点保持同页 */
  keepWithNext: boolean;
  /** 头部行数：切分点不得落在其中，且头部之后至少跟一行正文 */
  headerLines: number;
}

export function layoutNode(node: DocNode, lineWidth: number): LaidOutNode {
  switch (node.kind) {
    case 'heading':
      return {
        node,
        lines: wrapTokens(tokenize(node.text), lineWidth),
        atomic: true,
        keepWithNext: true,
        headerLines: 0,
      };
    case 'paragraph':
      return {
        node,
        lines: wrapTokens(tokenize(node.text), lineWidth),
        atomic: false,
        keepWithNext: false,
        headerLines: 0,
      };
    case 'quote': {
      const text = node.cite ? `${node.text} —— ${node.cite}` : node.text;
      return {
        node,
        lines: wrapTokens(tokenize(text), lineWidth),
        atomic: false,
        keepWithNext: false,
        headerLines: 0,
      };
    }
    case 'divider':
      return {
        node,
        lines: [{ tokens: [{ text: '❖', prefix: '', atomic: false }] }],
        atomic: true,
        keepWithNext: false,
        headerLines: 0,
      };
    case 'missing-audio':
      return {
        node,
        lines: wrapTokens(tokenize(node.note), lineWidth),
        atomic: true,
        keepWithNext: false,
        headerLines: 0,
      };
    case 'audio': {
      const headerTokens: TextToken[] = [
        { text: '▶', prefix: '', atomic: false },
        { text: node.card.marker, prefix: ' ', atomic: true },
      ];
      const appendGroup = (tokens: TextToken[]) => {
        tokens.forEach((token, index) => {
          headerTokens.push(index === 0 ? { ...token, prefix: ' ' } : token);
        });
      };
      if (node.card.title) appendGroup(tokenize(node.card.title));
      if (node.card.recordingTitle) {
        appendGroup(tokenize(`（录音：${node.card.recordingTitle}）`));
      }
      const headerLines = wrapTokens(headerTokens, lineWidth);
      const bodyLines = [
        ...(node.card.summary
          ? wrapTokens(tokenize(node.card.summary), lineWidth)
          : []),
        ...(node.card.transcript
          ? wrapTokens(tokenize(node.card.transcript), lineWidth)
          : []),
      ];
      return {
        node,
        lines: [...headerLines, ...bodyLines],
        atomic: false,
        keepWithNext: false,
        headerLines: headerLines.length,
      };
    }
  }
}

export function paginateDocument(
  doc: ComposedDocument,
  options: PaginationOptions = {},
): Page[] {
  const pageLines = Math.max(4, Math.floor(options.pageLines ?? 36));
  const lineWidth = Math.max(8, Math.floor(options.lineWidth ?? 64));
  const laidOut = doc.nodes.map((node) => layoutNode(node, lineWidth));

  const pages: Page[] = [];
  let items: PageItem[] = [];
  let used = 0;

  const flush = () => {
    if (items.length === 0) return;
    pages.push({ index: pages.length + 1, items, lineCount: used });
    items = [];
    used = 0;
  };

  for (let index = 0; index < laidOut.length; index += 1) {
    const laid = laidOut[index];
    const hasNext = index + 1 < laidOut.length;
    let rest = laid.lines;
    let continued = false;

    while (rest.length > 0) {
      const spacing = used > 0 ? 1 : 0;
      const capacity = pageLines - used - spacing;
      // keep-with-next：为下一个节点至少预留一行
      const reserve = laid.keepWithNext && hasNext && !continued ? 1 : 0;

      if (
        rest.length + reserve <= capacity ||
        (used === 0 && (laid.atomic || rest.length <= pageLines))
      ) {
        // 整体放下。原子块独占一页仍放不下时允许溢出，但绝不截断。
        if (used > 0) used += 1;
        items.push({
          node: laid.node,
          lines: rest,
          continued,
          headerLines: continued ? 0 : laid.headerLines,
          totalLines: laid.lines.length,
        });
        used += rest.length;
        rest = [];
        continue;
      }

      if (laid.atomic) {
        // 当前页放不下且不可切分：整体移到下一页
        flush();
        continue;
      }

      // 可按行切分：第一部分至少覆盖头部行 + 一行正文（或两行）
      const minFirst = Math.min(rest.length, Math.max(laid.headerLines + 1, 2));
      const take = Math.min(rest.length, Math.max(0, capacity));
      if (take >= minFirst && take > 0) {
        if (used > 0) used += 1;
        items.push({
          node: laid.node,
          lines: rest.slice(0, take),
          continued,
          headerLines: continued ? 0 : laid.headerLines,
          totalLines: laid.lines.length,
        });
        rest = rest.slice(take);
        continued = true;
        flush();
      } else {
        // 剩余空间不足最小切分单元：整体后移到下一页
        flush();
      }
    }
  }

  flush();
  return pages;
}
