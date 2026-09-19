/**
 * 时间标记工具。
 *
 * 时间标记（如 [00:01:02.500]、[01:02:03.250 – 01:02:10.000]）在分词、
 * 换行与分页中都被视为原子单元，任何情况下不得被截断。
 */

const TIME_PART = String.raw`\d{1,2}:\d{2}(?:\.\d{1,3})?`;
const TIME_MARKER_SOURCE = String.raw`\[(?:\d{1,3}:)?${TIME_PART}(?:\s*[–—-]\s*(?:\d{1,3}:)?${TIME_PART})?\]`;

export const TIME_MARKER_REGEX = new RegExp(TIME_MARKER_SOURCE, 'g');
export const TIME_MARKER_AT_START = new RegExp(`^${TIME_MARKER_SOURCE}`);

/** 与前端一致的 mm:ss.mmm（超一小时加小时前缀）格式。 */
export function formatTime(milliseconds: number): string {
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

export function formatTimeMarker(startMs: number, endMs: number): string {
  return `[${formatTime(startMs)} – ${formatTime(endMs)}]`;
}
