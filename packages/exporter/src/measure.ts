/** 全角（占两格）字符的码点区间。 */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // 谚文字母
  [0x2e80, 0x303e], // CJK 部首、符号（含 《》〔〕）
  [0x3041, 0x33ff], // 假名与 CJK 兼容
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 统一表意文字
  [0xa000, 0xa4cf], // 彝文音节
  [0xac00, 0xd7a3], // 谚文音节
  [0xf900, 0xfaff], // CJK 兼容表意文字
  [0xfe30, 0xfe4f], // CJK 兼容形式
  [0xff00, 0xff60], // 全角 ASCII
  [0xffe0, 0xffe6], // 全角符号
  [0x20000, 0x2fffd], // CJK 扩展 B 及以后
  [0x30000, 0x3fffd],
];

export function isWideCodePoint(codePoint: number): boolean {
  return WIDE_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
}

/** 以「格」度量文本宽度：全角字符两格，其余一格。 */
export function measureCells(text: string): number {
  let cells = 0;
  for (const char of text) {
    cells += isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return cells;
}
