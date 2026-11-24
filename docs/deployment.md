# Setup, deployment and operations

## Local setup

Use a supported Node release (tested with Node 26.8.2), npm and Docker Compose. Never point these commands at a production database. Compose uses the public Chainguard MinIO image because the former community MinIO image is no longer anonymously pullable. The ClamAV service is amd64-only and runs through Docker Desktop emulation on Apple Silicon.

```sh
cp .env.example .env
# Replace BETTER_AUTH_SECRET with a random secret of at least 32 characters.
npm ci
# Fresh machines only; existing local PostgreSQL on 5439 must not conflict.
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npx tsx scripts/storage-init.ts
npm run dev
# In a second terminal:
npm run worker
```

Open `http://localhost:3000/en`. Use `localhost` consistently: it must match BETTER_AUTH_URL for cookie/origin checks. Demo emails: cadet, ano, co, group, admin, ano2, co2, group2 at `sampark.test`; password `Sampark-Demo-2026!`. The second organization supports isolation tests. Fixtures cannot run when APP_MODE=production.

This workstation currently uses a separate local PostgreSQL 16 cluster at `/private/tmp/sampark-postgres`, port 5439, because Docker's engine was unavailable. Do not start Compose PostgreSQL on the same port. That temporary cluster is not a durable production deployment. The schema and migrations target PostgreSQL and are compatible with the Compose 17 service.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
# With the app running:
npm run test:e2e
npm run build
npm audit
```

Integration tests expect the seeded synthetic database and clean up their financial/publication records. Browser tests create synthetic visits. Never run them against real data.

## Staging and production

Build a Node server image with `npm ci`, `npm run db:generate`, and `npm run build`. Run migrations as a separate restricted deployment job, then `npm start` behind an HTTPS reverse proxy. The proxy must overwrite (not append to) `X-Forwarded-For` with the client address: the public registration form rate-limits on its first hop. The supplied start script binds loopback; adapt the container command to `next start --hostname 0.0.0.0` only within a private network. A separate worker uses the same deployment version and database, with restricted S3/ClamAV connectivity.

Set APP_MODE=production, BETTER_AUTH_URL to the exact HTTPS origin, a strong secret, TLS PostgreSQL credentials, and separate least-privilege private/public-media bucket credentials. The example environment and Compose credentials are development-only. Keep DB/storage ports off public networks. Configure encrypted disks, encrypted object storage, encrypted backups, staging separation and secret injection in the deployment platform.

Both storage buckets block public access. The public-media proxy checks current publication membership and uses no-store, ensuring withdrawal takes effect for new requests. Private downloads are signed for 60 seconds and audited. Do not log full request bodies, credentials, cookies or signed URLs. Configure ClamAV signature updates and monitor job failures. The worker fails closed when scanning is unavailable.

No mail/SMS provider, production identity federation or external error monitor is configured. In-app notifications persist. Password reset email delivery is unavailable; do not present an email reset as successful. An operator-led recovery procedure and verified delivery integration are required before production.

## Controlled onboarding

Seed only in development. For production, first create the approved organization hierarchy using a reviewed migration. An authorized infrastructure operator runs `npx tsx scripts/provision.ts` and provides a JSON object on stdin with name, email, password, institutionId (any institution of the formation), role, optional appointmentCode and operatorId. Create only the first directorate admin account this way (role `ADMIN`, appointmentCode `ADG` or `DDG`). That admin sets up the other top post on the Directorate posts page; every other officer registers on `/[locale]/officers/register` and is approved inside the system (docs/decisions/002-officer-registration.md). Never pass passwords as shell arguments or commit the input file. Account provisioning is audited. Publishing/payment capabilities are not granted by default. A separate administrator assigns them through the audited assignment endpoint. Privileged users enroll TOTP at `/en/security` before entering the workspace.

## Backup and restore

Use a service account and a protected `.pgpass` file (0600), not passwords in command history:

```sh
pg_dump -h 127.0.0.1 -p 5439 -U sampark -Fc sampark > sampark.backup
createdb -h 127.0.0.1 -p 5439 -U sampark sampark_restore_test
pg_restore -h 127.0.0.1 -p 5439 -U sampark -d sampark_restore_test --no-owner sampark.backup
```

In production, encrypt backups, restrict access, define RPO/RTO with the institution, back up both buckets with object versions, and test restored DB/media consistency in isolated staging. Retain audit/finance history according to approved policy. A successful database restore alone does not prove object-store recovery.

## Migrations and rollback

Commit every migration and lockfile. Use `prisma migrate deploy` in staging/production, never `migrate dev` or `db push`. Take a restorable snapshot before a schema change. Prefer additive migrations and backwards-compatible app rollout. Roll back application images only while compatible; forward-fix schema changes. Never delete financial history to make a migration pass. Verify backup restore before any destructive migration.

## Monitoring and moderation

`GET /api/health` checks the database and returns no details. Separately monitor worker heartbeat/job age, failed scans, storage availability, disk use and backup success. Logs contain event/error type only. Wire those signals to the approved monitoring system before release.

Editors create a separate public draft. A reviewer records permission, clean evidence where required, guardian consent where applicable, and reviews captions/content. A different reviewer approves; a user with explicit publishing capability publishes. A published revision is immutable; editing creates a new draft. Archive preserves historical access. Withdraw removes the public projection and media availability; consent revocation also withdraws. Warn contributors that downloaded images cannot be recalled.

Do not deploy publicly until the release gates in `docs/progress.md` are satisfied. No production deployment or communications were performed.

## Outgoing mail

Email is optional. With `REQUIRE_EMAIL_VERIFICATION` unset (the default), nothing depends on an email arriving: registration requests go straight to the approving officer, and a DDG/ADG set-up or handover shows the admin a one-time set-password link (24 hours, single use, audited as `post.setup_link_shown`) to give to the new holder in person. Turn it on (`true`) only together with authorized mail delivery; otherwise confirmation links would never arrive.


Mail (currently only registration confirmation links) is written to the `OutboundEmail` outbox in the same transaction as the change that needs it, and the worker delivers it. Delivery runs only when `MAIL_DELIVERY=smtp` and `SMTP_URL` are set; otherwise mail stays queued and expires with the link (24 hours). Sending real email is a communication: enable it in production only with explicit authorization, a directorate-approved sender address (`MAIL_FROM`) with SPF/DKIM, and an SMTP relay on the private network. Bodies are cleared once sent, because they carry one-time links. Development delivers to Mailpit (`compose.yaml`), which never relays.
