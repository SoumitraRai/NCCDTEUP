# Architecture

Sampark is a local-first modular monolith: Next.js 16.4.6 App Router, React 19.3.1, strict TypeScript, PostgreSQL, Prisma 7.10.1 with the pg driver adapter, Better Auth 1.7.20 database sessions and TOTP, next-intl, Zod, S3-compatible storage, Sharp, and a PostgreSQL-backed worker. Versions are exact in package.json and package-lock.json. Prisma's npm `latest` was a release candidate; stable 7.10.1 was selected deliberately.

## Boundaries

- `src/server/authorization`: authenticate, live assignments, action-specific organizational scope, explicit capabilities, separation of duties. Route groups are not a security boundary.
- `src/modules/finance`: deterministic integer-paise calculation, immutable submitted snapshots, versioned transitions, serializable transactions, payment and reversal ledger.
- `src/modules/movement`: temporary duty requests on the shared approval engine (formation chains, post and duty steps, start index), per-round snapshots and traveller notices. Day count and notice are development defaults.
- `src/modules/camps`: camps (CATC) hosted by a unit with seats for units of its group, state from IST dates, report rounds (file plus attendance) reviewed by someone senior to the submitter (TD seniority), strength per unit. Report deadline 15 days (user decision). Camp budgets (`budgets.ts`, route CAMP_BUDGET) with stage windows, optional breakup and synthetic reference rates; cadet strength per institution (`enrolment.ts`).
- `src/modules/publications`: reviewed revisions and a physically separate `PublicContent` projection. Public queries explicitly select safe fields. No private-record fetch is used to render a public page.
- `src/server/storage` and `src/server/jobs`: authorized intents, private quarantine, real ClamAV INSTREAM scanner, clean object isolation, expiring downloads. Public derivative delivery rechecks a live publication.
- `src/app/api/private/[...path]`: thin HTTP boundary, strict input schemas, same-origin mutation check, private no-store responses. Generic records and administration currently live here; extract domains as their workflows expand.
- `src/components`: public presentation, native semantic forms/tables, workspace and dialogs.

Private routes never use shared caching. Public responses currently use no-store for immediate withdrawal; there is no external search index/CDN to invalidate. Scheduled publications enter the projection only after review; readers enforce publish time even when the worker is delayed. The worker archives expired notices and runs cleanup.

## Deliberate deviations

Native semantic HTML/CSS implements the token system, forms and tables instead of adding Tailwind, shadcn, React Hook Form and TanStack to the first release. Zod is authoritative at server boundaries. The custom dialog has focus trapping and restoration; this is tested, not treated as automatically accessible. No chart library is included; amounts remain accessible text/tables. There is no Python application backend. No cloud connectors or external communications are enabled.

These are reversible library choices. Financial, privacy and authorization invariants must remain unchanged when replacing UI components.

## Source verification

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation); installed framework documentation under `node_modules/next/dist/docs` was also consulted.
- [Prisma 7 database drivers](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management) and [TOTP](https://better-auth.com/docs/plugins/2fa); installed plugin schema verified against migrations.
- [next-intl App Router](https://next-intl.dev/docs/getting-started/app-router).

This is not a security certification or production-readiness assertion.
