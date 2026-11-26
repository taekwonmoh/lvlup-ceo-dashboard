/** Dunning schedule from the billing design. Nothing is sent. */
import { addDays } from './holds.ts';

export function dunningSchedule(firstOn: string) {
  return [
    { attempt: 1, on: firstOn, membershipStatus: 'active', send: false },
    { attempt: 2, on: addDays(firstOn, 3), membershipStatus: 'active', send: false },
    { attempt: 3, on: addDays(firstOn, 7), membershipStatus: 'past_due', send: false },
    { attempt: 4, on: addDays(firstOn, 14), membershipStatus: 'past_due', send: false },
  ];
}
