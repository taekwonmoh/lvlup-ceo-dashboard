/**
 * Recurring class generation inside LVLUP's open hours.
 * Mon–Thu 2:00–8:30p every school.
 * Friday 3:00–7:30p Waunakee only.
 * Saturday 9:00a–1:00p every school except DeForest.
 * Sunday is closed.
 */

export const LOCATIONS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;

export type ClassTemplate = {
  id: string;
  locationId: string;
  title: string;
  weekday: number;
  startLocal: string;
  durationMin: number;
  capacity: number;
  instructor: string;
  room?: string;
  rankRange?: string;
};

export type GeneratedSession = {
  templateId: string;
  locationId: string;
  title: string;
  date: string;
  startLocal: string;
  endLocal: string;
  capacity: number;
  instructor: string;
  status: 'scheduled' | 'cancelled';
};

function minutes(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function weekdayOf(iso: string) {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

/** Open window for a school on a date, or null when the building is closed. */
export function openHours(locationId: string, iso: string): { start: string; end: string } | null {
  const day = weekdayOf(iso);
  if (day === 0) return null;
  if (day >= 1 && day <= 4) return { start: '14:00', end: '20:30' };
  if (day === 5) return locationId === 'waunakee' ? { start: '15:00', end: '19:30' } : null;
  if (day === 6) return locationId === 'deforest' ? null : { start: '09:00', end: '13:00' };
  return null;
}

export function fitsHours(locationId: string, iso: string, startLocal: string, durationMin: number) {
  const window = openHours(locationId, iso);
  if (!window) return false;
  const start = minutes(startLocal);
  const end = start + durationMin;
  return start >= minutes(window.start) && end <= minutes(window.end);
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function expandTemplates(input: {
  templates: ClassTemplate[];
  from: string;
  through: string;
  closures?: { date: string; locationId?: string | null }[];
}): GeneratedSession[] {
  const out: GeneratedSession[] = [];
  const closures = input.closures || [];
  let cursor = input.from;
  while (cursor <= input.through) {
    const dow = weekdayOf(cursor);
    for (const template of input.templates) {
      if (template.weekday !== dow) continue;
      if (!fitsHours(template.locationId, cursor, template.startLocal, template.durationMin)) continue;
      const closed = closures.some(c => c.date === cursor && (!c.locationId || c.locationId === template.locationId));
      out.push({
        templateId: template.id,
        locationId: template.locationId,
        title: template.title,
        date: cursor,
        startLocal: template.startLocal,
        endLocal: fromMinutes(minutes(template.startLocal) + template.durationMin),
        capacity: template.capacity,
        instructor: template.instructor,
        status: closed ? 'cancelled' : 'scheduled',
      });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}
