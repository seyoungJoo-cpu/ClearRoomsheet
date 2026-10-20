# Security patch: staging and release checklist

## Intended compatible changes
- Keep the current UI, GET/POST /api/sync, 3-second polling, order logic and game sockets unchanged.
- Serve only known UI assets from the web root; prevent direct access to server source, plaintext credentials, private JSON, subscriptions and archive files.
- Keep the two legacy default room XML URLs, but require existing X-Sync-Password header for access.
- Set nosniff and omit the X-Powered-By response header.
- Run CI smoke checks with synthetic room data only.

## DO NOT MERGE until data backup is verified
The Render service is set to auto-deploy main commits.
The operational app writes sync-state.json, close-day-archives/, push subscriptions, and VAPID key data to local disk. We have NOT established that a persistent disk exists. Deploy/restart might discard that data. Git revert restores code, not deleted state.

Release checklist:
1. Company IT/security owner reviews external hosting and operational data transfer and approves the work.
2. IT verifies persistent storage and makes a safe encrypted backup of active sync state, archives, push keys/subscriptions, and other necessary runtime data. Confirm restore on isolated staging with fake or approved test records.
3. Verify GitHub Action checks pass and manually test home, HK admin, front, inventory, order workflows, 3-second sync, default room XML fallback, Web Push, and PAD flow with fabricated test inputs.
4. Only then merge in a maintenance window; confirm Render deployment health plus user and storage behavior after restart.
5. If regression occurs, roll back app code, and restore data via the approved backup plan if needed.

## Security gaps intentionally deferred to avoid disrupting production
- Browser-delivered login and HK role passwords are hard-coded: migrate to server-side authentication and authorization, then rotate credentials.
- Public GitHub repository and credential file/history: review and privatize repository, rotate all potentially exposed secrets.
- Shared sync API has one password and allows query-string passwords; remove legacy access only after all clients are migrated.
- Full OPERA-derived data inventory, minimization and US-region hosted storage need company review.
- Do not assume employee PC-only access policy prevents personal devices or internet clients from reaching the public Render service.
- Do not use synthetic test files on the live Render service.

No real customer records or passwords are included in this change.
