/**
 * Local Worker entry. No route is configured, so this file cannot attach api.lvlupma.com.
 * Health does not touch a database. Other routes return 503 until DATABASE_URL is set locally.
 */
export default {
  async fetch(request: Request, env: { BILLING_CHARGES_ENABLED?: string; QBO_ENABLED?: string; AUTHORIZENET_MODE?: string }): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      return Response.json({
        ok: true,
        charges: false,
        qbo: false,
        mode: env.AUTHORIZENET_MODE || 'sandbox',
        billingFlag: env.BILLING_CHARGES_ENABLED || '0',
        qboFlag: env.QBO_ENABLED || '0',
        intendedHost: 'api.lvlupma.com',
      });
    }
    return Response.json(
      { error: { code: 'not_deployed', message: 'This Worker is local-only. Set DATABASE_URL for a local database. Nothing is deployed.' } },
      { status: 503 },
    );
  },
};
