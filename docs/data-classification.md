# Data classification

| Class | Examples | Delivery / retention |
|---|---|---|
| Public, reviewed | Publication title, summary, approved institution display name, district, event date, caption, sanitized derivative | Explicit PublicContent projection; withdrawn content and its media proxy immediately stop serving |
| Internal | Visits, training, discussions, internal notices, organization assignments | Authenticated scoped service; no-store |
| Restricted | Profiles, claims, amounts, bills, payment references, consent evidence, authentication secrets | Private database/buckets; logs exclude raw payloads; downloads require current resource access |
| Operational | Redacted action audit, job error codes | Admin audit; no tokens, signed URLs, passwords or document contents |

Public text rejects obvious email addresses, phone numbers and labeled precise coordinates. This is an additional guard, not a substitute for human review of names or indirect identifiers. Public content is plain text rendered by React; no user HTML is injected.

Original media stays private. Sharp re-encodes approved images without metadata; no original EXIF is copied. Both buckets deny anonymous access. A public media proxy checks the publication before delivery. Do not put a public bucket policy on finance storage.

Retention: expired recruitment enquiries are deleted by the worker (public collection is intentionally disabled); unfinished quarantine uploads expire after 24 hours. Finance, consent and audit history are not auto-deleted pending approved institutional retention schedules. Configure object-store lifecycle rules for abandoned derivative objects, quarantine copies and backups. Already issued signed private URLs remain valid for at most 60 seconds; already downloaded public images cannot be recalled.

All shipped fixtures are synthetic. Do not import production data or real personal documents into this environment.
