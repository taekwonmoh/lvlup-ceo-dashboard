/** Curriculum videos are grouped by cycle theme (Honesty, Self-Esteem, and the rest). */

export type CurriculumVideo = {
  title: string;
  vimeoId: string;
  cycleTheme: string;
  rankName?: string | null;
};

export function videosByCycleTheme(videos: CurriculumVideo[]): Record<string, CurriculumVideo[]> {
  const out: Record<string, CurriculumVideo[]> = {};
  for (const video of videos) {
    const theme = video.cycleTheme || 'Unassigned';
    if (!out[theme]) out[theme] = [];
    out[theme].push(video);
  }
  return out;
}
