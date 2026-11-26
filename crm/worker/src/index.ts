/**
 * lvlup-crm-api. Serves the CRM /v1 routes.
 * No custom domain is attached. Hyperdrive is preferred when the binding exists;
 * DATABASE_URL is the local fallback. Neither value is logged or returned.
 * Charges, QuickBooks, and message delivery stay off unless a later approval flips them.
 */
import { handleWorkerRequest, type CrmWorkerEnv } from './app.ts';
import { workerLoaders } from './fixtures.ts';

const loaders = workerLoaders();

export default {
  async fetch(request: Request, env: CrmWorkerEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    return handleWorkerRequest(request, env, ctx, { loaders });
  },
};
