import { describe, expect, it } from 'vitest';
import { formatTimeMarker, formatTimeRange } from '../src/index.js';

describe('formatTimeMarker', () => {
  it('formats sub-minute times as MM:SS.mmm', () => {
    expect(formatTimeMarker(0)).toBe('00:00.000');
    expect(formatTimeMarker(65_500)).toBe('01:05.500');
    expect(formatTimeMarker(599_999)).toBe('09:59.999');
  });

  it('includes hours once the time passes one hour', () => {
    expect(formatTimeMarker(3_600_000)).toBe('01:00:00.000');
    expect(formatTimeMarker(3_661_001)).toBe('01:01:01.001');
  });

  it('clamps invalid input to zero', () => {
    expect(formatTimeMarker(-5)).toBe('00:00.000');
    expect(formatTimeMarker(Number.NaN)).toBe('00:00.000');
    expect(formatTimeMarker(Number.POSITIVE_INFINITY)).toBe('00:00.000');
  });
});

describe('formatTimeRange', () => {
  it('wraps the whole range in brackets as one marker', () => {
    expect(formatTimeRange(1000, 2000)).toBe('〔00:01.000–00:02.000〕');
  });
});
