/**
 * 把时间（毫秒）格式化为时间标记文本，与前端播放器的显示一致：
 * 不足一小时为 `MM:SS.mmm`，否则为 `HH:MM:SS.mmm`。
 */
export function formatTimeMarker(milliseconds: number): string {
  const safeMs = Number.isFinite(milliseconds)
    ? Math.max(0, Math.round(milliseconds))
    : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = safeMs % 1000;
  const prefix = hours > 0 ? `${String(hours).padStart(2, '0')}:` : '';
  return `${prefix}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * 片段的时间范围标记。返回的整串（含括号）在排版时作为
 * 一个原子单元，换行和分页都不会把它截断。
 */
export function formatTimeRange(startMs: number, endMs: number): string {
  return `〔${formatTimeMarker(startMs)}–${formatTimeMarker(endMs)}〕`;
}
