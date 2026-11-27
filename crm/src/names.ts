/**
 * Person names and the minor-guardian rule for public forms.
 * A minor needs a guardian first name, last name, and signature.
 */
import { CrmError } from './errors.ts';

const PHONE_TEST = /\{phone[^}]*\}|\b(?:tel|sms):|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/i;

export function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function joinName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].map(part => String(part || '').trim()).filter(Boolean).join(' ');
}

export function containsPhoneText(value: string): boolean {
  return PHONE_TEST.test(value);
}

export function assertNoPhoneText(value: string, message = 'Phone numbers are not accepted here.') {
  if (containsPhoneText(value)) throw new CrmError(400, 'phone_not_accepted', message);
}

/** Birth date wins over a conflicting minor flag. Age 18 on the birthday is an adult. */
export function isMinorParticipant(input: {
  minor?: boolean | null;
  age?: number | null;
  birthDate?: string | null;
}, today: string): boolean {
  if (input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) {
    const [year, month, day] = input.birthDate.split('-').map(Number);
    const adult = new Date(Date.UTC(year + 18, month - 1, day));
    const now = new Date(today + 'T00:00:00Z');
    return now.getTime() < adult.getTime();
  }
  if (input.age != null && Number.isFinite(Number(input.age))) return Number(input.age) < 18;
  return input.minor === true;
}

export function assertMinorGuardian(input: {
  minor: boolean;
  required: boolean;
  guardianFirstName?: string | null;
  guardianLastName?: string | null;
  signature?: string | null;
  signedByGuardianName?: string | null;
}) {
  if (!input.minor || !input.required) return;
  const first = String(input.guardianFirstName || '').trim();
  const last = String(input.guardianLastName || '').trim();
  const signed = String(input.signedByGuardianName || joinName(first, last)).trim();
  if (!first || !last || !signed) {
    throw new CrmError(400, 'guardian_required', 'A guardian first and last name is required for a minor.');
  }
  assertNoPhoneText(signed, 'A guardian name cannot include a phone number.');
  const signature = String(input.signature || '').trim();
  if (signature.length < 2 || /^https?:\/\//i.test(signature)) {
    throw new CrmError(400, 'guardian_signature_required', 'A guardian signature is required for a minor.');
  }
  assertNoPhoneText(signature, 'A signature cannot include a phone number.');
}

export function assertRedirectUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  const url = String(value).trim();
  if (!url.startsWith('https://') || /tel:|sms:/i.test(url) || url.length > 500) {
    throw new CrmError(400, 'bad_redirect', 'Redirect URL must start with https://.');
  }
  return url;
}
