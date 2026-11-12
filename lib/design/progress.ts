export function filledSegments(percent: number, segments = 12): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const clamped = Math.min(100, percent);
  return Math.min(segments, Math.max(1, Math.ceil((clamped / 100) * segments)));
}
