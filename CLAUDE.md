# UCC Automation OS

Lead & Inquiry Automation system for UpperCervicalCare.com (UCC), built by Tolon Solutions AI.
This repo is the system of record for automations that live across platforms with no version
control of their own (Brilliant Directories, GoHighLevel, Zapier, Slack). It will be transferred
to UCC ownership at handover, so everything here must be understandable by someone who is not Jess.

## What this system does

Routes and manages two lanes of inquiries from UpperCervicalCare.com:

- **D2C (patient leads):** Patient submits on a doctor's BD profile or the Get Matched form.
  BD matches by membership tier and radius, notifies the doctor (full info for Level 2+,
  $50 accept/decline preview for Annual/Unverified). Our build adds everything AFTER the
  notification: 24/48/72hr reminder cadence, expiration handling, ZIP-matched fallback
  cascade, patient confirmations, tracking.
- **B2B (doctor inquiries):** Contact form with classification field `inquirer_type`
  (existing member / interested in joining / patient). Existing + joining route to GHL
  pipelines and Slack #b2b-inquiries for Constansa. Patients route to the D2C lane.

Full spec: `docs/workflow-specification.md` (Workflows 1–9). Read it before designing anything.

## Platforms and how they connect

- **Brilliant Directories (BD)** — directory, member data, lead capture and matching engine.
  Admin at uppercervicalcare.com. Build version 4.0. Webhooks live in Developer Hub.
- **GoHighLevel (GHL)** — CRM, workflows, email/SMS, pipelines. Doctors sync as contacts
  (member-level sync only; leads/patients do NOT sync natively — that bridge is our build).
- **Zapier** — Billy's account. Bridge layer where needed.
- **Slack** — #b2b-inquiries channel exists; alerts for Constansa.
- Transport reality: BD's only native outputs are emails and Developer Hub webhooks.
  Everything we build triggers off one of those two.

## Key facts learned in audit (Sep 2026) — do not re-derive

- BD's native lead engine WORKS: capture, tier routing (custom Lead Action ID 3
  "Paid Membership Leads - FLOW Automatically"), radius matching, and notifications all fire.
  Do not rebuild these. Our scope is the management layer around them.
- Plan IDs — Level 2+ (full access): 2, 18, 19, 23, 26, 27, 29, 33.
- Plan IDs — $50 accept/decline flow: **Plan 3 (Unverified Doctor)** and **Plan 31 (Level 1 Annual)**.
- GHL tag `tier-annual` covers BOTH plan 3 and plan 31 — the tag name is historical, do not rename.
- **STANDING LEAK:** New plan 3/31 signups after Sept 25, 2026 get NO tag until the BD Sign Up
  webhook auto-tagger is built. That workflow is priority this week — see decision log.
- BD lead settings: Maximum Matches = 5 (conflicts with spec's one-doctor cascade —
  open question for Billy, see decision log).
- BD admin bug: Edit pages for Lead Actions 404 on Build 4.0. Ticket filed with BD support.
  Config is live and working; only the admin edit UI is broken.
- Template bug: doctor lead notification greets every doctor as "jordan" (hardcoded).
  Fix = swap for first-name variable in BD Email Templates.
- Reminder cadence confirmed by Billy: 24/48/72 hours (overrides the day 2/4/5 in the spec).
- info@uppercervicalcare.com: admin copies of all leads land here; Jess has no mailbox
  access; intermittent soft bounces observed.
- ~922 unprocessed items in BD Forms Inbox — unaudited, likely years of unrouted
  contact-form submissions.
- Filter gotcha: classification values all contain the word "Doctor". Match on
  `existing` and `interested in joining` — never on "Doctor".

## Repo layout

- `docs/` — architecture, workflow spec, decision log, runbooks, handover docs
- `bd/` — BD-side config records: webhook definitions, email template copies (before/after),
  form settings, Lead Action documentation
- `ghl/` — GHL workflow specs: triggers, branches, actions per workflow, pipeline definitions
- `copy/` — every email/SMS in the system, versioned, with approval status
- `code/` — actual code: tracking dashboard, parsers, scripts

## Conventions

- Platform configs (GHL workflows, BD webhooks, Zaps) can't be exported as code — document
  each one as a markdown spec + screenshots the moment it's built or changed. If it isn't
  in the repo, it doesn't exist at handover.
- Every non-obvious choice gets a dated entry in `docs/decision-log.md`.
- Copy files carry a status line: DRAFT / SENT FOR APPROVAL / APPROVED (date).
- Never commit credentials, API keys, webhook URLs with tokens, or patient PII.
  Reference secrets by name and where they live (e.g. "GHL inbound webhook URL — in the
  workflow trigger, B2B Inquiry Router").
- Proprietary campaign methodology stays in the separate `profile-drive-os` repo — never here.
  This repo transfers to UCC.

## Current build status (Sep 25, 2026)

See `docs/build-status.md` for full detail.

**Completed:**
- [x] Audit complete; deposit received; $3k build, $1.5k/$1.5k terms
- [x] Slack #b2b-inquiries channel created
- [x] B2B routing LIVE: BD "Contact Us Form Submitted" webhook → GHL Directory workflow
      → pipelines (B2B Member Support, Prospective Doctors) + Slack post
- [x] BD event discovery: Lead Submitted, Lead Accept/Decline, One-Time Purchase all
      available as real-time webhooks (smart-list webhooks are batch-only — dead end)
- [x] D2C reminder copy drafted (24hr, 48hr, 72hr expiration)
- [x] Lead Reminder Sequence LIVE (both BD form templates wired)
- [x] Lead Accept Decline Handler LIVE (stops reminders on doctor response)
- [x] Patient Expiration Watch LIVE (72hr patient notification via relay)
- [x] tier-annual tag coverage audit: 705 members audited, 555 gaps fixed, 0 failures

**In progress:**
- [ ] BD Sign Up Auto-Tagger — closes standing leak for new Plan 3/31 signups (PRIORITY)
- [ ] Patient Watch Stop — shell built, relay field names need fix
- [ ] All system copy sent for Billy approval

**Not started:**
- [ ] jordan template fix
- [ ] ZIP fallback cascade (Workflow 4) — BLOCKED on Maximum Matches decision
- [ ] Tracking view / exception queue (Workflow 8–9)
- [ ] Handover docs + ownership transfer
