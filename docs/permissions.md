# Permission contract

Assignments are dated and revocable. Each assignment is anchored to exactly one formation matching its level (institution, unit, group or directorate; a database CHECK enforces it) and names its appointment from the catalogue. ANO/Cadet scope is their institution; CO (also held by the unit AO) is their unit; Group and Group staff are their group; Admin and Directorate staff are their directorate. Multiple assignments form a union **for the requested action**, never a global role plus unrelated scope. Expired/inactive assignments are excluded at each private request.

| Role | Read/write | Review | Publish | Record payment |
|---|---|---|---|---|
| Cadet | Own visits, profile, relevant notices/discussions; no staff finance | No | No | No |
| ANO/CTO (`ANO`) | Assigned institutions | No | No | No |
| CO | Assigned unit | Other people's submissions | No | Explicit `payment` capability |
| Group | Assigned group | Other people's submissions | No | Explicit `payment` capability |
| Admin | Assigned directorate | Other people's submissions | Explicit `publish` capability | Explicit `payment` capability |
| Group staff (`GROUP_STAFF`: branch officers) | Read whole group | Only at workflow steps named for their appointment (none yet) | No | No |
| Directorate staff (`DTE_STAFF`: officers under the DDG) | Read whole directorate | Only at workflow steps named for their appointment (none yet) | No | No |

Claims may be submitted/cancelled only by their owner. Nobody, including administrators, may review/approve their own claim. Payment recording also excludes the claimant. Publication reviewers and publishers cannot act on their own revision. Every detail query, CSV export and attachment authorization applies the same action-specific scope.

User revocation deletes sessions immediately. Assignment creation deletes the target user's sessions and denies self-assignment. Initial account creation is a controlled operator CLI (`scripts/provision.ts`), which reads credentials from stdin and records the operator identifier. The operator is a trusted deployment administrator; this is not a public endpoint.

Production privileged access requires enrolled TOTP only when `REQUIRE_TWO_FACTOR=true` (off for now; see Sign-in). `/en/security` and `/hi/security` allow enrollment without first entering the privileged workspace. Better Auth handles the second-factor challenge at sign-in. Session cookies are HttpOnly, production Secure, SameSite by library default. Session lifetime is eight hours absolute and one hour idle; the independent `lastSeenAt` field prevents a library refresh from bypassing idle expiry.

Mutation requests must have the configured application Origin. Do not accept arbitrary forwarded host/origin headers. Serve behind a trusted TLS reverse proxy. No browser bearer tokens or role switcher exist.

## Self-registration

Anyone may request a Cadet, ANO or CTO account at a publicly listed institution. Only an officer with `review` scope over that institution (CO of its unit, its Group, or the Directorate admin) can activate or reject it; activation grants exactly one assignment at that institution with no capabilities. CO, Group and Admin accounts are never self-service and are provisioned with `scripts/provision.ts`.

## Sign-in

Everyone signs in on one page (`/login`, also `/en/login` and `/hi/login`) with email and password. Authenticators are optional (user decision, 2026-11-21: password only for now): anyone may add one at Account security, and is then asked for its code. With `REQUIRE_TWO_FACTOR=true`, officer accounts (`requireTwoFactor`) and, in production, every reviewing role are refused private access until one is set up.

## Officer registration

Officers register on `/[locale]/officers/register` (linked from the member registration page) for one post at one formation. Who may activate:

- unit post (CO, AO): an officer in post at the same unit (CO and AO approve each other), or the group, or the directorate;
- Group Commander and Deputy Group Commander: any officer in post at that group, or the directorate;
- other group posts: the group or the directorate;
- directorate posts: the directorate.

"The group/directorate" means holding its head post (Gp Cdr, DDG, ADG) or the delegated `registrations` capability there. Only heads grant or withdraw that capability, for officers of their own group or directorate, never their own; it cannot be passed on. All officers see the officer list; managing posts is limited to the actor's level and below.

Ending or moving an officer's post (Officers page, "Change post") follows the same rule: whoever may approve a post's registration may end it, or move the officer to a new post that they could also approve. A move keeps the account, closes the old post and opens the new one at the same moment; delegated duties do not carry over. Nobody ends or moves their own post; DDG and ADG are handed over on the Directorate posts page. A reason is required and every change is audited (`officer.post.ended`, `officer.post.moved`).

## DDG and ADG post accounts

These posts are closed to registration. A directorate admin (role `ADMIN`) sets up the account on the Directorate posts page and, when the holder changes, updates name, email and phone. A handover deletes the old password, authenticator and sessions and creates a one-time set-password link (24 hours, hash stored). With email verification on it is emailed to the new address; otherwise (the default) it is shown once to the admin to hand over in person. Nobody sets up or hands over the post they hold. Every set-up and handover is audited with the previous holder's name and email.
