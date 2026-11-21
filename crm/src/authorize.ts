/**
 * Authorize.net request shapes. Sandbox fixtures only.
 * This module never calls the network and never submits a charge.
 */
import { CrmError } from './errors.ts';

export type AuthNetEnv = {
  AUTHORIZENET_MODE?: string;
  AUTHORIZENET_LIVE?: string;
};

export function authorizeMode(env: AuthNetEnv) {
  const mode = (env.AUTHORIZENET_MODE || 'sandbox').toLowerCase();
  if (mode === 'live' && env.AUTHORIZENET_LIVE !== '1') {
    throw new CrmError(403, 'live_disabled', 'Live Authorize.net is off. AUTHORIZENET_LIVE=1 is required even to acknowledge live mode.');
  }
  if (mode === 'live') {
    throw new CrmError(403, 'live_network_disabled', 'Live mode was acknowledged. This build still does not call Authorize.net.');
  }
  if (mode !== 'sandbox') {
    throw new CrmError(400, 'bad_mode', 'AUTHORIZENET_MODE must be sandbox.');
  }
  return 'sandbox' as const;
}

export function buildGetCustomerProfileRequest(input: {
  apiLoginId: string;
  customerProfileId: string;
}) {
  return {
    getCustomerProfileRequest: {
      merchantAuthentication: { name: input.apiLoginId, transactionKey: '[secret]' },
      customerProfileId: input.customerProfileId,
    },
  };
}

export function buildChargeProfileRequest(input: {
  apiLoginId: string;
  customerProfileId: string;
  paymentProfileId: string;
  amountCents: number;
  invoiceNumber: string;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new CrmError(400, 'bad_amount', 'amountCents must be a positive integer');
  }
  return {
    createTransactionRequest: {
      merchantAuthentication: { name: input.apiLoginId, transactionKey: '[secret]' },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: (input.amountCents / 100).toFixed(2),
        profile: {
          customerProfileId: input.customerProfileId,
          paymentProfile: { paymentProfileId: input.paymentProfileId },
        },
        order: { invoiceNumber: input.invoiceNumber },
      },
    },
  };
}

export function submitCharge(): never {
  throw new CrmError(403, 'charges_disabled', 'This backbone never submits a charge.');
}

export type SandboxProfile = {
  customerProfileId: string;
  merchantCustomerId: string;
  paymentProfiles: { customerPaymentProfileId: string; brand: string; last4: string }[];
};

/** Fixture stand-in for getCustomerProfile. No HTTP. */
export function getCustomerProfile(env: AuthNetEnv, profiles: SandboxProfile[], customerProfileId: string) {
  authorizeMode(env);
  const hit = profiles.find(p => p.customerProfileId === customerProfileId);
  if (!hit) throw new CrmError(404, 'profile_not_found', 'No sandbox profile with that id.');
  return {
    customerProfileId: hit.customerProfileId,
    merchantCustomerId: hit.merchantCustomerId,
    paymentProfiles: hit.paymentProfiles.map(p => ({
      customerPaymentProfileId: p.customerPaymentProfileId,
      brand: p.brand,
      last4: p.last4,
    })),
  };
}
