# ADR 001 — PostgreSQL-backed modular monolith

Accepted for local development, 11 November 2026.

Use the requested Next.js/TypeScript/PostgreSQL architecture. Prefer explicit services and allowlisted public projections over browser authorization. Use stable Prisma 7 rather than its current release-candidate npm tag. Better Auth supplies maintained password hashing, sessions and TOTP. A durable SQL job queue avoids requiring Redis for the first local deployment.

Use simple semantic HTML/CSS while security and financial contracts stabilize. Avoid a second backend. No deployment or external communications are authorized by this ADR. Production readiness needs evidence for every release check.
