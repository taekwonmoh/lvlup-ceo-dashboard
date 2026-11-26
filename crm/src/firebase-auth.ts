/**
 * Firebase ID token checks for the Worker.
 * Tests pass a local cert. This module does not fetch Google.
 */
import { CrmError } from './errors.ts';

export type FirebaseClaims = {
  email: string;
  sub: string;
  aud: string;
  iss: string;
  exp: number;
};

function b64urlToBytes(input: string) {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson<T>(segment: string): T {
  const bytes = b64urlToBytes(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function verifyFirebaseIdToken(token: string, input: {
  projectId: string;
  certs: Record<string, string>;
  nowSec?: number;
}): Promise<FirebaseClaims> {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const [h64, p64, s64] = parts;
  let header: { alg?: string; kid?: string };
  let claims: FirebaseClaims & { email_verified?: boolean };
  try {
    header = decodeJson(h64);
    claims = decodeJson(p64);
  } catch {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const pem = input.certs[header.kid];
  if (!pem) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const aud = input.projectId;
  const iss = `https://securetoken.google.com/${input.projectId}`;
  if (claims.aud !== aud || claims.iss !== iss || !claims.exp || claims.exp < now) {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  if (!claims.email || claims.email_verified === false) {
    throw new CrmError(401, 'unauthorized', 'Sign in required.');
  }
  const key = await crypto.subtle.importKey(
    'spki',
    b64urlToBytes(pemToSpki(pem)).buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s64),
    new TextEncoder().encode(`${h64}.${p64}`),
  );
  if (!ok) throw new CrmError(401, 'unauthorized', 'Sign in required.');
  return { email: claims.email.toLowerCase(), sub: claims.sub, aud: claims.aud, iss: claims.iss, exp: claims.exp };
}

function pemToSpki(pem: string) {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '').replace(/-----END PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  return body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
