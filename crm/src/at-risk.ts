/** Attendance drop versus a student's own recent baseline. */
export function isAtRisk(input: { recent: number; baseline: number; minBaseline?: number; ratio?: number }) {
  const minBaseline = input.minBaseline ?? 4;
  const ratio = input.ratio ?? 0.5;
  if (input.baseline < minBaseline) return false;
  return input.recent <= input.baseline * ratio;
}
