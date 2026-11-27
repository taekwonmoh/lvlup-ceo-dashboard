/**
 * Cross-brand event visibility for the staff CRM and the member portal.
 * Go Ninja Summer Camps and Parents' Night Out default into the LVLUP member portal.
 * Sample rows only. No phone numbers, ATA numbers, or GymDesk ids.
 */
import { CrmError } from './errors.ts';
import type { Actor } from './auth.ts';
import { assertStaff } from './auth.ts';

export const GO_NINJA_LOCATIONS = ['goninjaW', 'goninjaV'] as const;
export const STUDIO_LOCATIONS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;

export type PortalEventType =
  | 'summer_camp'
  | 'pno'
  | 'belt_test'
  | 'clinic'
  | 'tournament'
  | 'party'
  | 'seminar'
  | 'other';

export type EventBrand = 'lvlup' | 'goninja';
export type EventListFilter = 'all' | 'school' | 'portal' | 'cross-brand';

export const EVENT_TYPE_LABELS: Record<PortalEventType, string> = {
  summer_camp: 'Summer Camp',
  pno: "Parents' Night Out",
  belt_test: 'Belt test',
  clinic: 'Clinic',
  tournament: 'Tournament',
  party: 'Party',
  seminar: 'Seminar',
  other: 'Other',
};

export type StudioEvent = {
  id: string;
  title: string;
  type: string;
  eventType: PortalEventType;
  date: string;
  endDate: string;
  time: string;
  locationId: string;
  brand: EventBrand;
  blurb: string;
  showInLvlupMemberPortal: boolean;
  visibleToBrands: EventBrand[];
  capacity: number;
  registered: number;
  published: boolean;
  memberPriceCents: number;
  nonMemberPriceCents: number;
};

type RawEvent = {
  id: string;
  title: string;
  type: string;
  date: string;
  endDate?: string;
  time: string;
  locationId: string;
  blurb: string;
  capacity: number;
  registered: number;
  memberPriceCents: number;
  nonMemberPriceCents: number;
  showInLvlupMemberPortal?: boolean;
};

export function isGoNinjaLocation(locationId: string): boolean {
  return locationId === 'goninjaW' || locationId === 'goninjaV';
}

export function normalizeEventType(value: string): PortalEventType {
  const text = String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === 'camp' || text === 'summer camp' || text === 'summercamp') return 'summer_camp';
  if (text === 'pno' || text === 'parents night out' || text === 'parents night') return 'pno';
  if (text === 'belt test' || text === 'belttest') return 'belt_test';
  if (text === 'clinic') return 'clinic';
  if (text === 'tournament') return 'tournament';
  if (text === 'party') return 'party';
  if (text === 'seminar') return 'seminar';
  return 'other';
}

/** True when a new Go Ninja Summer Camp or Parents' Night Out should be checked. */
export function defaultShowInLvlupMemberPortal(locationId: string, eventType: string): boolean {
  const kind = normalizeEventType(eventType);
  return isGoNinjaLocation(locationId) && (kind === 'summer_camp' || kind === 'pno');
}

export function visibleToBrands(locationId: string, showInLvlupMemberPortal: boolean): EventBrand[] {
  if (isGoNinjaLocation(locationId)) {
    return showInLvlupMemberPortal ? ['goninja', 'lvlup'] : ['goninja'];
  }
  return ['lvlup'];
}

export function isCrossBrandLvlupOffer(event: { locationId: string; showInLvlupMemberPortal: boolean }): boolean {
  return isGoNinjaLocation(event.locationId) && event.showInLvlupMemberPortal === true;
}

export function decorateStudioEvent(raw: RawEvent): StudioEvent {
  const eventType = normalizeEventType(raw.type);
  const show = raw.showInLvlupMemberPortal == null
    ? defaultShowInLvlupMemberPortal(raw.locationId, eventType)
    : raw.showInLvlupMemberPortal === true;
  return {
    id: raw.id,
    title: raw.title,
    type: EVENT_TYPE_LABELS[eventType],
    eventType,
    date: raw.date,
    endDate: raw.endDate || raw.date,
    time: raw.time,
    locationId: raw.locationId,
    brand: isGoNinjaLocation(raw.locationId) ? 'goninja' : 'lvlup',
    blurb: raw.blurb,
    showInLvlupMemberPortal: show,
    visibleToBrands: visibleToBrands(raw.locationId, show),
    capacity: raw.capacity,
    registered: raw.registered,
    published: true,
    memberPriceCents: eventType === 'belt_test' ? 0 : raw.memberPriceCents,
    nonMemberPriceCents: eventType === 'belt_test' ? 0 : raw.nonMemberPriceCents,
  };
}

const SAMPLE_EVENTS: RawEvent[] = [
  {
    id: 'gnw-summer-camp',
    title: 'Summer Camp',
    type: 'Summer Camp',
    date: '2027-06-14',
    endDate: '2027-06-18',
    time: '09:00',
    locationId: 'goninjaW',
    blurb: 'Half day and full day at Go Ninja Waunakee. Ages 5 to 12. Sample week.',
    capacity: 24,
    registered: 6,
    memberPriceCents: 14900,
    nonMemberPriceCents: 17900,
  },
  {
    id: 'gnv-summer-camp',
    title: 'Summer Camp',
    type: 'Summer Camp',
    date: '2027-06-21',
    endDate: '2027-06-25',
    time: '09:00',
    locationId: 'goninjaV',
    blurb: 'Half day and full day at Go Ninja Verona. Ages 5 to 12. Sample week.',
    capacity: 20,
    registered: 4,
    memberPriceCents: 14900,
    nonMemberPriceCents: 17900,
  },
  {
    id: 'gnw-pno',
    title: "Parents' Night Out",
    type: "Parents' Night Out",
    date: '2026-12-11',
    time: '18:00',
    locationId: 'goninjaW',
    blurb: 'Friday evening at Go Ninja Waunakee. Games and a sample pizza night.',
    capacity: 16,
    registered: 5,
    memberPriceCents: 2500,
    nonMemberPriceCents: 3500,
  },
  {
    id: 'gnv-pno',
    title: "Parents' Night Out",
    type: "Parents' Night Out",
    date: '2026-12-18',
    time: '18:00',
    locationId: 'goninjaV',
    blurb: 'Friday evening at Go Ninja Verona. Games and a sample pizza night.',
    capacity: 16,
    registered: 3,
    memberPriceCents: 2500,
    nonMemberPriceCents: 3500,
  },
  {
    id: 'gnw-skills',
    title: 'Ninja skills night',
    type: 'Clinic',
    date: '2026-12-09',
    time: '17:30',
    locationId: 'goninjaW',
    blurb: 'A Go Ninja skills night. Stays on the Go Ninja portal unless someone checks the box.',
    capacity: 18,
    registered: 2,
    memberPriceCents: 0,
    nonMemberPriceCents: 1500,
    showInLvlupMemberPortal: false,
  },
  {
    id: 'belt-test',
    title: 'Belt test',
    type: 'Belt test',
    date: '2026-12-12',
    time: '09:00',
    locationId: 'waunakee',
    blurb: 'Color belts at Waunakee. Belt testing is included with tuition.',
    capacity: 40,
    registered: 12,
    memberPriceCents: 0,
    nonMemberPriceCents: 0,
    showInLvlupMemberPortal: false,
  },
  {
    id: 'clinic',
    title: 'Sparring clinic',
    type: 'Clinic',
    date: '2026-12-05',
    time: '11:00',
    locationId: 'verona',
    blurb: 'Bring sparring gear if you have it.',
    capacity: 20,
    registered: 8,
    memberPriceCents: 4000,
    nonMemberPriceCents: 5500,
    showInLvlupMemberPortal: false,
  },
  {
    id: 'tournament',
    title: 'Winter tournament',
    type: 'Tournament',
    date: '2027-01-16',
    time: '08:00',
    locationId: 'eastmad',
    blurb: 'East Madison. Sample tournament day.',
    capacity: 80,
    registered: 22,
    memberPriceCents: 7500,
    nonMemberPriceCents: 9000,
    showInLvlupMemberPortal: false,
  },
  {
    id: 'parents-night',
    title: "Parents' Night Out",
    type: "Parents' Night Out",
    date: '2026-12-04',
    time: '18:00',
    locationId: 'eastmad',
    blurb: 'Drop off at East Madison. This LVLUP night is not a Go Ninja cross-brand listing.',
    capacity: 18,
    registered: 7,
    memberPriceCents: 2500,
    nonMemberPriceCents: 3500,
    showInLvlupMemberPortal: false,
  },
];

export function sampleStudioEvents(_today?: string): StudioEvent[] {
  return SAMPLE_EVENTS.map(decorateStudioEvent);
}

export function filterStudioEvents<T extends { locationId: string; showInLvlupMemberPortal: boolean }>(
  events: T[],
  filter: EventListFilter,
  locationId = '',
): T[] {
  if (filter === 'portal' || filter === 'cross-brand') return events.filter(isCrossBrandLvlupOffer);
  if (filter === 'school') return events.filter(row => row.locationId === locationId);
  return events.slice();
}

export function sortStaffEvents<T extends { locationId: string; showInLvlupMemberPortal: boolean; date: string }>(events: T[]): T[] {
  return events.slice().sort((a, b) => {
    const rankA = isCrossBrandLvlupOffer(a) ? 0 : 1;
    const rankB = isCrossBrandLvlupOffer(b) ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    return a.date.localeCompare(b.date) || a.locationId.localeCompare(b.locationId);
  });
}

/** LVLUP schools also receive Go Ninja camps and PNOs that are flagged for the portal. */
export function eventsForLocation<T extends { locationId: string; showInLvlupMemberPortal: boolean }>(
  events: T[],
  locationId: string,
): T[] {
  return events.filter(row => row.locationId === locationId || (!isGoNinjaLocation(locationId) && isCrossBrandLvlupOffer(row)));
}

export function eventsForMemberBrand<T extends { brand: EventBrand; showInLvlupMemberPortal: boolean }>(
  events: T[],
  brand: EventBrand,
): T[] {
  if (brand === 'goninja') return events.filter(row => row.brand === 'goninja' || row.brand === 'lvlup');
  return events.filter(row => row.brand === 'lvlup' || row.showInLvlupMemberPortal);
}

export type EventWrite = {
  id?: string;
  name?: string;
  title?: string;
  locationId?: string;
  eventType?: string;
  type?: string;
  startsOn?: string;
  date?: string;
  endsOn?: string;
  endDate?: string;
  time?: string;
  blurb?: string;
  capacity?: number;
  showInLvlupMemberPortal?: boolean | null;
};

function assertLocation(locationId: string) {
  if (!STUDIO_LOCATIONS.includes(locationId as typeof STUDIO_LOCATIONS[number])) {
    throw new CrmError(400, 'bad_location', 'Pick a LVLUP or Go Ninja school.');
  }
}

function assertDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CrmError(400, 'bad_date', 'Use a calendar date.');
}

function assertTitle(value: string) {
  const title = value.trim();
  if (title.length < 2 || title.length > 80) throw new CrmError(400, 'bad_name', 'Add an event name.');
  if (/phone|tel:|sms:|@/i.test(title) || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(title)) {
    throw new CrmError(400, 'bad_name', 'Leave phone numbers and email addresses off the event.');
  }
  return title;
}

function readFlag(value: unknown, locationId: string, eventType: string): boolean {
  if (value == null || value === '') return defaultShowInLvlupMemberPortal(locationId, eventType);
  if (typeof value !== 'boolean') {
    throw new CrmError(400, 'bad_flag', 'Also show in LVLUP Member Portal must be on or off.');
  }
  return value;
}

export function eventFromWrite(input: EventWrite, id: string): StudioEvent {
  const locationId = String(input.locationId || '');
  assertLocation(locationId);
  const eventType = String(input.eventType || input.type || '');
  const date = String(input.startsOn || input.date || '');
  assertDay(date);
  const end = String(input.endsOn || input.endDate || date);
  assertDay(end);
  const title = assertTitle(String(input.title || input.name || ''));
  const show = readFlag(input.showInLvlupMemberPortal, locationId, eventType);
  const capacity = Number(input.capacity);
  return decorateStudioEvent({
    id,
    title,
    type: eventType || title,
    date,
    endDate: end,
    time: /^\d{2}:\d{2}$/.test(String(input.time || '')) ? String(input.time) : '18:00',
    locationId,
    blurb: String(input.blurb || 'Added from the staff desk. Nothing was charged.').slice(0, 240),
    capacity: Number.isFinite(capacity) && capacity > 0 ? Math.min(200, Math.round(capacity)) : 16,
    registered: 0,
    memberPriceCents: 0,
    nonMemberPriceCents: 0,
    showInLvlupMemberPortal: show,
  });
}

export function publicStudioEvent(event: StudioEvent) {
  const spotsLeft = Math.max(0, event.capacity - event.registered);
  return {
    id: event.id,
    eventId: event.id,
    title: event.title,
    type: event.type,
    eventType: event.eventType,
    locationId: event.locationId,
    brand: event.brand,
    date: event.date,
    endDate: event.endDate,
    time: event.time,
    startsAt: event.date + 'T' + event.time + ':00-06:00',
    blurb: event.blurb,
    capacity: event.capacity,
    registered: event.registered,
    spotsLeft,
    published: event.published,
    available: event.published && spotsLeft > 0,
    memberPriceCents: event.memberPriceCents,
    nonMemberPriceCents: event.nonMemberPriceCents,
    listPriceCents: event.memberPriceCents,
    showInLvlupMemberPortal: event.showInLvlupMemberPortal,
    visibleToBrands: event.visibleToBrands,
    crossBrand: isCrossBrandLvlupOffer(event),
  };
}

function listEvents(search: URLSearchParams) {
  const filter = String(search.get('filter') || 'all') as EventListFilter;
  const locationId = search.get('locationId') || '';
  let events = sampleStudioEvents(search.get('asOf') || '');
  if (filter === 'portal' || filter === 'cross-brand' || filter === 'school') {
    events = filterStudioEvents(events, filter, locationId);
  } else if (locationId) {
    events = eventsForLocation(events, locationId);
  }
  return sortStaffEvents(events).map(publicStudioEvent);
}

export function handleCrossBrandEvents(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor;
  body: Record<string, unknown>;
}): { status: number; body: unknown } {
  const { method, parts, search, actor } = input;
  if (method === 'GET' && parts.length === 2) {
    return {
      status: 200,
      body: { events: listEvents(search), charges: false, persisted: false },
    };
  }
  if (method === 'GET' && parts.length === 3) {
    const id = String(parts[2] || '');
    const found = sampleStudioEvents().find(row => row.id === id);
    if (!found) throw new CrmError(404, 'not_found', 'Event not found.');
    return { status: 200, body: { event: publicStudioEvent(found), charges: false, persisted: false } };
  }
  assertStaff(actor);
  if (method === 'POST' && parts.length === 2) {
    const id = /^[a-z0-9-]{1,40}$/i.test(String(input.body.id || '')) ? String(input.body.id) : 'ev-preview';
    const event = eventFromWrite(input.body as EventWrite, id);
    return { status: 201, body: { event: publicStudioEvent(event), charges: false, persisted: false } };
  }
  if (method === 'PATCH' && parts.length === 3) {
    const id = String(parts[2] || '');
    if (!/^[a-z0-9-]{1,40}$/i.test(id)) throw new CrmError(400, 'bad_id', 'Unknown event.');
    const found = sampleStudioEvents().find(row => row.id === id);
    if (!found) throw new CrmError(404, 'not_found', 'Event not found.');
    if (!('showInLvlupMemberPortal' in input.body) || typeof input.body.showInLvlupMemberPortal !== 'boolean') {
      throw new CrmError(400, 'bad_flag', 'Also show in LVLUP Member Portal must be on or off.');
    }
    const event = decorateStudioEvent({
      ...found,
      type: found.eventType,
      showInLvlupMemberPortal: input.body.showInLvlupMemberPortal,
    });
    return { status: 200, body: { event: publicStudioEvent(event), charges: false, persisted: false } };
  }
  throw new CrmError(405, 'method_not_allowed', 'Use GET, POST, or PATCH.');
}
