# CRM backbone

Local only. Nothing in this folder is deployed, and the tests do not call Firebase, GymDesk, or Authorize.net.

```bash
cd crm
npm install
npm test
```

Tests apply `migrations/` to a local database named `crm_test`. Override the URL with `CRM_DATABASE_URL`. The default login is `crm` / `crm` on `127.0.0.1`.

`npm start` serves the API on port 8787. Charges stay disabled. `AUTHORIZENET_MODE` must stay `sandbox`. Setting it to `live` throws unless `AUTHORIZENET_LIVE=1`, and even then this build does not open a network connection.

The Cloudflare Worker in `crm/worker` serves the same `/v1` routes. It prefers `env.HYPERDRIVE` and falls back to `DATABASE_URL`. This repo does not deploy it. See `docs/crm/platform-runbook.md`. `npm run typecheck` and `npm run worker:dry-run` check the Worker build.

The staff dashboard preview is `index.html?crmPreview=1` on localhost. It uses mock names and does not write Firebase. Without that query the dashboard is unchanged.

The member app and the front-desk CRM are separate pages under `crm/preview/`. They do not change `index.html`. See `docs/crm/PORTAL-PREVIEW.md`.

See `docs/crm/README.md` for the design and the open questions. Provisioning, the January 2027 cutover checklist, and the Phase 1 / Phase 2 split are in `docs/crm/platform-runbook.md` and `docs/crm/ROADMAP.md`. Nothing here is deployed.
