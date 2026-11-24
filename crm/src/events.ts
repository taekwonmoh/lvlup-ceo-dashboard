/**
 * Event launch and the public booking shape the members site will call.
 * Pricing reuses the promo quote. No charge is sent.
 */
import { quoteBooking, type PromoCode, type Quote, type BuyerKind } from './pricing.ts';

export type EventKind = 'belt_test' | 'clinic' | 'tournament' | 'party' | 'camp' | 'seminar' | 'other';

export type LaunchEvent = {
  id: string;
  title: string;
  locationId: string;
  brand: 'lvlup' | 'goninja';
  eventType: EventKind;
  startsAt: string;
  capacity: number;
  registered: number;
  memberPriceCents: number;
  nonMemberPriceCents: number;
  published: boolean;
  registrationOpensOn: string;
  registrationClosesOn: string;
};

export function brandForLocation(locationId: string): 'lvlup' | 'goninja' {
  return locationId === 'goninjaW' || locationId === 'goninjaV' ? 'goninja' : 'lvlup';
}

export function eventCapacity(event: { capacity: number; registered: number }) {
  const registered = Math.max(0, event.registered);
  const spotsLeft = Math.max(0, event.capacity - registered);
  return {
    capacity: event.capacity,
    registered,
    spotsLeft,
    full: spotsLeft === 0,
    fill: event.capacity === 0 ? 0 : Math.min(1, registered / event.capacity),
  };
}

export function eventListPrice(event: LaunchEvent, buyer: BuyerKind): number {
  return buyer === 'member' ? event.memberPriceCents : event.nonMemberPriceCents;
}

export type PublicEventBooking = {
  eventId: string;
  title: string;
  locationId: string;
  brand: 'lvlup' | 'goninja';
  eventType: EventKind;
  startsAt: string;
  listPriceCents: number;
  dueCents: number;
  discountCents: number;
  spotsLeft: number;
  capacity: number;
  registered: number;
  published: boolean;
  available: boolean;
};

/** Shape docs/crm/MEMBERS-API.md can show before confirm. */
export function publicEventBooking(input: {
  event: LaunchEvent;
  buyer: BuyerKind;
  on: string;
  codes?: string[];
  catalog?: PromoCode[];
}): PublicEventBooking {
  const event = input.event;
  const cap = eventCapacity(event);
  const list = eventListPrice(event, input.buyer);
  const inWindow = input.on >= event.registrationOpensOn && input.on <= event.registrationClosesOn;
  let quote: Quote | null = null;
  if (input.codes && input.codes.length && input.catalog) {
    quote = quoteBooking({
      listPriceCents: list,
      on: input.on,
      locationId: event.locationId,
      brand: event.brand,
      eventType: event.eventType,
      eventId: event.id,
      buyer: input.buyer,
      codes: input.codes,
      catalog: input.catalog,
      redemptions: [],
    });
  }
  const available = event.published && !cap.full && inWindow;
  return {
    eventId: event.id,
    title: event.title,
    locationId: event.locationId,
    brand: event.brand,
    eventType: event.eventType,
    startsAt: event.startsAt,
    listPriceCents: list,
    dueCents: quote ? quote.dueCents : list,
    discountCents: quote ? quote.discountCents : 0,
    spotsLeft: cap.spotsLeft,
    capacity: cap.capacity,
    registered: cap.registered,
    published: event.published,
    available,
  };
}
