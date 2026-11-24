# NCC DTE UP Sampark

A PostgreSQL-backed development application for approved public stories and private, role-scoped administration. All shipped content/accounts/rates are synthetic. No production deployment has been performed.

## Run locally

Follow [setup and deployment](docs/deployment.md). The short path is:

```sh
cp .env.example .env
# Set a random BETTER_AUTH_SECRET, then:
npm ci
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run storage:init
npm run dev
npm run worker   # second terminal: scans uploads, delivers queued mail
```

Local mail never leaves the machine: with `MAIL_DELIVERY=smtp` and `SMTP_URL=smtp://127.0.0.1:1025` in `.env`, the worker delivers to Mailpit, whose inbox is at [127.0.0.1:8025](http://127.0.0.1:8025).

Visit [the local application](http://localhost:3000/en). Local accounts use `ano@sampark.test`, `co@sampark.test`, `admin@sampark.test`, or `cadet@sampark.test` with password `Sampark-Demo-2026!`. Never use these fixtures in production.

## What is implemented

- English/Hindi public routes, approved institution finder, publication categories, active/archive notices, privacy/help pages, responsive themes.
- Real password sign-in, database sessions, TOTP, live dated assignments, organization scope and revocation.
- Self-registration (Cadet, ANO, CTO) with email confirmation and activation by an officer in scope.
- Persistent visits, private discussions/notices, publication revisions, review/consent/publish/withdraw workflow and separate public projection.
- Exact integer-paise claims, versioned calculation snapshots, review/return/reject, separate partial/full payment ledger, reversals and scoped CSV export.
- Private attachment intents, quarantine/scanner worker, clean object isolation, 60-second downloads and sanitized image derivatives. Live storage/scanner integration remains unverified on this workstation.
- Synthetic fixtures, migrations, tests, CI, eight project-local skills and operational documentation.

Read the [evidence and remaining release gates](docs/progress.md). This implementation is not yet a production-ready completion of every criterion in the master brief.
