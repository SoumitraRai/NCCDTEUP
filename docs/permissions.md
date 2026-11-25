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

## Temporary duty branch

The DDG or ADG gives or withdraws the `movement` duty for directorate officers on the Officers page ("TD branch"). Its holders act at the Branch step of a temporary duty request. It cannot be given on one's own post, by a duty holder, or to a group or unit officer.

## Temporary duty (TD)

- **Who raises one:** an officer for themselves, from one of their own unit, group or directorate posts (at least two days' notice, a development default); or an officer sending someone junior, by account or typed in by name and rank (no notice). Junior means in a formation below the sender's post, or in the same formation and outranked by it: in the directorate ADG > DDG > Director, in a group Gp Cdr > DGC, in a unit the CO; every other officer (AO, group staff, branch and other directorate officers) sends only into lower formations, never a peer or a senior. Someone typed in without an account (PI, GCI, staff) is junior to every officer of their formation, so an AO may send their unit's PI or GCI. A traveller holding several posts must be junior in every one within the sender's formation (user decision, 2026-11-24). ANOs, CTOs and cadets cannot raise TDs.
- **Chain:** Gp Cdr of the traveller's group, Branch (`movement` duty), Director, DDG, ADG, matched by post within the traveller's formation chain. It starts one step above the more senior of creator and traveller; when nobody is above, the TD is recorded as approved ("top of chain").
- **Who decides:** only the holder of the current step; never the creator or the traveller, even after the traveller's post ends.
- **Who sees it:** the creator, the traveller, and officers whose post covers the traveller's unit, group or directorate. Never public.
- **Changes:** only the creator cancels (pending or returned) or edits and sends again (returned); every change is versioned, snapshotted per round and audited. An account-holding traveller of a TD someone else created gets an in-app notice on creation, edit, cancellation and the final decision.

## Camps (CATC)

- **Who plans:** the CO or AO for their own unit; the Gp Cdr or group staff for any unit of their group. Seats go only to units of the host's group. Edit and cancel (with a reason) only before the camp starts, by the officer who planned it or someone senior to them under the TD seniority rule (user decision, 2026-11-25): an AO cannot change the CO's camp, group staff cannot change the Gp Cdr's or DGC's; group officers can change a unit's camp. Versioned and audited.
- **Who sees:** every directorate post sees every camp, report, report file, attendance figure, remark and history entry, even without a step to act on (user decision, 2026-11-25). Group officers see their group's camps; CO, AO, ANO and CTO see camps their unit hosts or has seats in. Never cadets, never public.
- **Cadet strength:** the unit's CO or AO enters authorised and enrolled JD/JW/SD/SW cadets for each of the unit's institutions per training year (versioned, audited), in each institution's Edit sheet on the Institutions page; Group and Admin see the same section read-only there, and anyone else who can see the institution opens "More details". The Camps Strength view reads it and links to the unit's institutions. Authorised strength replaced the old single "vacancy" figure (user decision, 2026-11-25). Group and directorate officers and the unit's ANOs/CTOs read it; cadets do not (user decision, 2026-11-25).
- **Briefing:** an optional briefing date on or before the camp's first day, set by whoever may edit the plan.
- **Reports:** after the camp the host unit or its group uploads the report (scanned) and enters attendance for every unit with seats. A group officer senior to the submitter (TD seniority) accepts it or returns it with a remark, never the submitter. A report the Gp Cdr submitted goes to the directorate, since nobody in the group is senior (user decision, 2026-11-25). A report is due 15 days after the camp ends (user decision, 2026-11-25). Each round is an immutable snapshot.

## Camp budgets

- **What:** one amount demanded per camp and stage (initial, revised, final) with its basis and a note; heads are an optional breakup that must add up to it (user decision, 2026-11-25).
- **When:** initial before the camp starts; revised before it ends, after a sanctioned initial or, once the camp has started, without one (not while an initial is in the chain); final after it ends, always. Plan camp can submit the initial demand with the plan.
- **Who prepares:** the host unit's CO or AO or a group officer of the camp's group. Only the preparer edits (when returned), resubmits or cancels.
- **Chain (provisional, to be confirmed by the directorate):** the Gp Cdr of the camp's group recommends, the DDG sanctions an amount up to the demand; a Gp Cdr's own budget starts at the DDG. The preparer never decides. Reference figures use synthetic rates.
- **Who sees:** the camp's viewers; every directorate post sees every budget.

## DDG and ADG post accounts

These posts are closed to registration. A directorate admin (role `ADMIN`) sets up the account on the Directorate posts page and, when the holder changes, updates name, email and phone. A handover deletes the old password, authenticator and sessions and creates a one-time set-password link (24 hours, hash stored). With email verification on it is emailed to the new address; otherwise (the default) it is shown once to the admin to hand over in person. Nobody sets up or hands over the post they hold. Every set-up and handover is audited with the previous holder's name and email.
