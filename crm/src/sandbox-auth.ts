/**
 * Sandbox sign-in for the preview.
 * Email delivery stays off. A session token is minted only when local tokens
 * are already allowed. Protected routes keep the same bearer check.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { signToken, type Actor } from './auth.ts';
import { findCardPayload } from './charge-gate.ts';
import { CrmError } from './errors.ts';

export const SANDBOX_SCHOOLS = ['waunakee', 'eastmad', 'verona', 'deforest', 'goninjaW', 'goninjaV'] as const;

export type SandboxAuthEnv = {
  AUTHORIZENET_MODE?: string;
  CRM_TOKEN_SECRET?: string;
};

function assertSandbox(env: SandboxAuthEnv) {
  const mode = (env.AUTHORIZENET_MODE || 'sandbox').toLowerCase();
  if (mode !== 'sandbox') throw new CrmError(403, 'bad_mode', 'Sandbox sign-in is only available in sandbox mode.');
}

function rejectUnsafe(body: Record<string, unknown>) {
  if (findCardPayload(body)) throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted.');
  for (const key of Object.keys(body)) {
    if (/phone|sms|^tel$/i.test(key)) throw new CrmError(400, 'contact_not_allowed', 'This form does not take a phone number.');
  }
}

export function normalizeSandboxEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new CrmError(400, 'bad_email', 'Enter an email address.');
  }
  return email;
}

export function sandboxPreviewCode(email: string, secret: string) {
  if (!secret) throw new CrmError(503, 'sandbox_auth_unconfigured', 'Sandbox sign-in is not configured on this API.');
  return createHmac('sha256', secret).update('lvlup-sandbox-otp:' + email).digest('hex').slice(0, 6).toUpperCase();
}

function codesMatch(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionActor(email: string, desk: boolean): Omit<Actor, 'exp'> {
  if (desk) {
    return {
      role: 'staff',
      email,
      locationIds: [...SANDBOX_SCHOOLS],
      familyIds: [],
      memberId: null,
      canFinance: false,
      platformRole: 'front_desk',
    };
  }
  return {
    role: 'guardian',
    email,
    locationIds: [],
    familyIds: [],
    memberId: null,
    canFinance: false,
    platformRole: 'family',
  };
}

export function handleSandboxOtp(body: Record<string, unknown>, env: SandboxAuthEnv, secret: string) {
  assertSandbox(env);
  rejectUnsafe(body);
  const email = normalizeSandboxEmail(body.email);
  const previewCode = sandboxPreviewCode(email, secret);
  return {
    status: 200,
    body: {
      ok: true,
      sent: false,
      delivery: '0',
      sandbox: true,
      charges: false,
      channel: 'preview',
      email,
      previewCode,
      message: 'Email delivery is off. Use the sandbox code shown here, or paste a session token.',
    },
  };
}

export function handleSandboxSession(
  body: Record<string, unknown>,
  env: SandboxAuthEnv,
  secret: string,
  allowLocalTokens: boolean,
) {
  assertSandbox(env);
  rejectUnsafe(body);
  const email = normalizeSandboxEmail(body.email);
  if (!allowLocalTokens) {
    throw new CrmError(403, 'sessions_disabled', 'This sandbox is not issuing session tokens. Paste a bearer token if you already have one.');
  }
  const expected = sandboxPreviewCode(email, secret);
  const given = String(body.code || '').trim().toUpperCase();
  if (!codesMatch(given, expected)) {
    throw new CrmError(401, 'bad_code', 'That code does not match. Request a new sandbox code.');
  }
  const actor = sessionActor(email, body.desk === true);
  const token = signToken(actor, secret, 60 * 60 * 8);
  return {
    status: 200,
    body: {
      token,
      role: actor.role,
      email: actor.email,
      sandbox: true,
      charges: false,
      sent: false,
      delivery: '0',
    },
  };
}
