# 002: Officer registration and formation-level posts

Date: 2026-11-20. Status: accepted (user decisions).

## Context

Officers hold posts at three formation levels, each with different powers:
unit (CO and AO, near-equal powers), group (Group Commander at the top, branch
officers under him) and the UP NCC Directorate (ADG at the top, DDG under him,
7–8 staff officers under the DDG). With many units and groups, one operator
cannot create every account. Until now every role was anchored to an
institution, and group/directorate roles borrowed one.

## Decisions

1. Posts are anchored to the formation itself (institution, unit, group or
   directorate) and come from an appointment catalogue that fixes each post's
   level, powers and whether it heads the formation.
2. Officers register on their own pages. (Superseded: everyone signs in on
   one page, and authenticators are optional; see 13.)
   Cadets, ANOs and CTOs keep the existing pages.
3. Approval is by the level above, with peer review inside a formation:
   unit officer accounts are approved at their group; a group's own officer
   accounts are approved by someone already active at that group who holds
   the duty, or the Group Commander; the same for the directorate (DDG/ADG
   or a delegated officer). Nobody approves their own account. Only the first
   top account is created by the operator (scripts/provision.ts).
4. Heads (Group Commander, DDG, ADG) can delegate "approve registrations" to
   officers of their own formation.
5. Branch and staff officers see everything at their level but act only at
   the workflow steps assigned to their branch (each workflow names them as it
   is built).
6. Any confirmed email address may register; the approving officer is the
   check. A domain allowlist may be added later.
7. Every officer (any post at unit, group or directorate level) sees every
   officer in the officer list, whatever the post (user decision,
   2026-11-20). Seeing is not managing: granting posts or duties stays limited
   to the actor's own level and below.
8. The Group Superintendent post is not used.

## Amendments (user decisions, 2026-11-21)

9. Unit CO and AO approve each other: a unit post may also be approved by an
   officer already in post at that unit (in addition to the group and the
   directorate).
10. DDG and ADG posts are closed to registration. A directorate admin sets
    up the account for the post; when the holder is posted out, an admin
    updates the account's name, email and phone for the new holder. Only an
    admin approves these. A handover removes the old password, authenticator
    and sessions and emails a one-time set-password link to the new address;
    nobody hands over the post they hold.
11. Group Commander and Deputy Group Commander registrations may be approved
    by any officer at that group (as well as the directorate).
12. Email confirmation is optional and off for now (user decision,
    2026-11-21): no flow may depend on an email arriving until real mail is
    authorized. Registrations go straight to approvers; DDG/ADG set-password
    links are shown once to the admin to hand over in person.
13. Sign-in is email and password only for now (user decision,
    2026-11-21). Authenticator apps are optional; `REQUIRE_TWO_FACTOR=true`
    restores the requirement. Before turning it on, build an authenticator
    reset for approvers, or a lost phone locks an officer out.
14. Ending or moving an officer's post (user decision, 2026-11-24): whoever
    may approve a post's registration may end it or move the officer, the
    new post needing the same. A move keeps the same account; the old post
    closes and the new one opens, without the old post's duties.
