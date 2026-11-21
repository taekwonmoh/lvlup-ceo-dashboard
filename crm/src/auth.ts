import { createHmac, timingSafeEqual } from 'node:crypto';
import { CrmError } from './errors.ts';

export type Role = 'admin' | 'staff' | 'guardian' | 'member';

export type Actor = {
  role: Role;
  email: string;
  locationIds: string[];
  familyIds: string[];
  memberId: string | null;
  canFinance: boolean;
  exp: number;
};

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString('base64url');
}

export function signToken(actor: Omit<Actor, 'exp'> & { exp?: number }, secret: string, ttlSec = 3600): string {
  const body: Actor = {
    ...actor,
    exp: actor.exp ?? Math.floor(Date.now() / 1000) + ttlSec,
  };
  const payload = b64url(JSON.stringify(body));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyToken(token: string, secret: string): Actor {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  let actor: Actor;
  try { actor = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new CrmError(401, 'unauthorized', 'Sign in required.'); }
  if (!actor.exp || actor.exp < Math.floor(Date.now() / 1000)) {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  if (!['admin', 'staff', 'guardian', 'member'].includes(actor.role)) {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  return actor;
}

export function assertStaff(actor: Actor) {
  if (actor.role !== 'admin' && actor.role !== 'staff') {
    throw new CrmError(403, 'forbidden', 'Staff only.');
  }
}

export function assertFinance(actor: Actor) {
  assertStaff(actor);
  if (actor.role !== 'admin' && !actor.canFinance) {
    throw new CrmError(403, 'forbidden', 'Finance access required.');
  }
}

export function canSeeLocation(actor: Actor, locationId: string) {
  if (actor.role === 'admin') return true;
  if (actor.role === 'staff') return actor.locationIds.includes(locationId);
  return false;
}

export function canSeeFamily(actor: Actor, familyId: string) {
  if (actor.role === 'admin') return true;
  if (actor.role === 'staff') return true;
  return actor.familyIds.includes(familyId);
}
