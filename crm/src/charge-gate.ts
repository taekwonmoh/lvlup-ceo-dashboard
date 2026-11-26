/**
 * Authorize.net charge gate.
 * Default is off. Sandbox only. Existing CIM profile ids only.
 * This file never calls the network and never accepts a card number.
 */
import { CrmError } from './errors.ts';
import { authorizeMode, buildChargeProfileRequest } from './authorize.ts';

export type ChargeEnv = {
  BILLING_CHARGES_ENABLED?: string;
  AUTHORIZENET_MODE?: string;
  AUTHORIZENET_LIVE?: string;
  BILLING_CHARGE_SINK?: string;
};

export type ChargeBody = {
  customerProfileId?: string;
  paymentProfileId?: string;
  amountCents?: number;
  invoiceNumber?: string;
  apiLoginId?: string;
  cardNumber?: string;
  cvv?: string;
  pan?: string;
};

const CARD_KEYS = /^(cardnumber|card_number|cvv|cvc|pan|accountnumber|account_number)$/i;

export function findCardPayload(value: unknown, path = ''): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const compact = value.replace(/[ -]/g, '');
    if (/^\d{13,19}$/.test(compact)) return path || 'value';
    return null;
  }
  if (typeof value === 'number') {
    const text = String(value);
    if (/^\d{13,19}$/.test(text)) return path || 'value';
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findCardPayload(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (CARD_KEYS.test(key)) return key;
      const hit = findCardPayload(child, path ? `${path}.${key}` : key);
      if (hit) return hit;
    }
  }
  return null;
}

export type ChargeSink = (request: unknown) => void;

/**
 * Builds the CIM charge body when the flag is on and the mode is sandbox.
 * Always returns submitted: false. A test sink may observe the body.
 * There is no HTTP client in this function.
 */
export function prepareCharge(env: ChargeEnv, body: ChargeBody, sink?: ChargeSink) {
  if (findCardPayload(body)) {
    throw new CrmError(400, 'card_not_allowed', 'Card numbers are not accepted. Use Accept.js.');
  }
  if (env.BILLING_CHARGES_ENABLED !== '1') {
    throw new CrmError(403, 'charges_disabled', 'Charging is off.');
  }
  authorizeMode(env);
  if (env.AUTHORIZENET_LIVE === '1') {
    throw new CrmError(403, 'live_disabled', 'Live Authorize.net is off.');
  }
  const customerProfileId = String(body.customerProfileId || '');
  const paymentProfileId = String(body.paymentProfileId || '');
  if (!/^\d{1,12}$/.test(customerProfileId) || !/^\d{1,12}$/.test(paymentProfileId)) {
    throw new CrmError(400, 'profile_required', 'An existing CIM profile id is required.');
  }
  const request = buildChargeProfileRequest({
    apiLoginId: body.apiLoginId || 'sandbox-login',
    customerProfileId,
    paymentProfileId,
    amountCents: Number(body.amountCents),
    invoiceNumber: String(body.invoiceNumber || 'shadow'),
  });
  if (env.BILLING_CHARGE_SINK === 'mock' && sink) sink(request);
  return { submitted: false as const, mode: 'sandbox' as const, request };
}
