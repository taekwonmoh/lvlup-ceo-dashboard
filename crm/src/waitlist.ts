/** Waitlist promotion. Pure. The API applies it inside a transaction. */
export type Seat = { id: string; status: 'booked' | 'waitlist' | 'cancelled'; createdAt: string };

export function promoteWaitlist(seats: Seat[], cancelledId: string): { seats: Seat[]; promotedId: string | null } {
  const next = seats.map(seat => ({ ...seat }));
  const cancelled = next.find(seat => seat.id === cancelledId);
  if (!cancelled || cancelled.status !== 'booked') return { seats: next, promotedId: null };
  cancelled.status = 'cancelled';
  const waiting = next
    .filter(seat => seat.status === 'waitlist')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (!waiting.length) return { seats: next, promotedId: null };
  waiting[0].status = 'booked';
  return { seats: next, promotedId: waiting[0].id };
}
