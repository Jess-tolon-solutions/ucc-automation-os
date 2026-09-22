# Decision log

Dated record of non-obvious choices. Newest first.

## 2026-09-20 — BD Lead Accept/Decline payload schema confirmed
Wired the Lead Accept/Decline webhook to GHL and discovered the actual payload fields
via inbound webhook custom values: Lead Id, Doctor Id, Doctor Email, Doctor First Name,
Action, Action Timestamp, Plan Id. Key findings:
- **Plan Id is included** — means tier branching (Annual/Unverified vs Level 2+) is
  buildable directly in the reminder workflow without a separate lookup.
- **Lead Id is included** — enables per-lead opportunity records per Workflow 8.
- **Action field** — exact values TBD; need to test with real decline to confirm whether
  BD sends "accept"/"decline", "Accepted"/"Declined", or something else. Current branch
  uses `contains` to handle either case.

## 2026-09-20 — Contacts are doctors, Opportunities are leads
GHL data model decision: doctor records are Contacts (one per doctor, persistent),
patient leads are Opportunities in a "Patient Leads" pipeline (one per inquiry,
lead_id in name). This maps to the spec's Workflow 8 requirement for per-inquiry
tracking. Reminders fire to the Contact (doctor); lifecycle stages track on the
Opportunity (lead). Tags on Contact control workflow enrollment; Opportunity stage
is the audit trail. This avoids creating patient Contacts we'd never market to.

## 2026-09-20 — BD emits one Accept/Decline event, not two
BD's Lead Accept and Lead Decline are a single webhook event with an `action` field
(`accept` or `decline`), not separate events. One GHL workflow receives it and
branches internally. Documented in `ghl/lead-accept-decline.md`.

## 2026-09-20 — BD built-in events discovered; smart-list webhooks are batch-only
Spent time investigating BD Developer Hub smart-list webhooks as triggers. Dead end:
smart-list webhooks fire on batch schedule (daily/weekly export), not real-time on
individual events. Pivoted to BD's built-in form/lead events, which ARE real-time:
- **Contact Us Form Submitted** — fires immediately on form submit. B2B lane uses this.
- **Lead Submitted** (`bootstrap_get_match`) — fires on patient inquiry to doctor profile.
  Currently configured pointing at Directory (B2B) GHL account; needs repointing to B2C.
- **Lead Accept** / **Lead Decline** — fires when doctor accepts or declines a lead.
  THIS IS THE STOP CONDITION for the reminder sequence (resolves the open question below).
- **One-Time Purchase** — fires on $50 payment. Useful for tracking but Lead Accept is
  the cleaner stop trigger.

## 2026-09-20 — B2B lane live end-to-end
BD built-in "Contact Us Form Submitted" webhook → GHL Directory workflow (B2B Inquiry
Router) → pipelines (Member Support / Prospective Doctors) + Slack #b2b-inquiries.
Working in production. The smart-list webhook approach documented earlier was abandoned.

## 2026-09-20 — Reminder stop condition: BD Lead Accept event
The open question from 2026-09-18 is resolved. BD fires a native Lead Accept webhook
when a doctor accepts a lead. GHL workflow can receive this and stop the reminder
sequence cleanly — no need for the "disregard if handled" copy workaround in v1.

## 2026-09-20 — Reminder copy uses static login link as CTA
Reminder emails link to the static UCC dashboard login URL rather than a dynamic
lead-specific deep link. BD does not expose a per-lead URL in the webhook payload.
Acceptable for v1; patients are few enough that doctors can find the pending lead
after login. Future: consider BD API lookup to construct deep links if volume grows.

## 2026-09-18 — B2B routing built in GHL, not Zapier
BD contact-form webhook → GHL Inbound Webhook trigger → If/Else on `inquirer_type` →
pipeline record + Slack post via incoming webhook. Chosen over a Zapier zap because the
spec (Workflows 5–6) needs B2B inquiries as GHL pipeline records for Constansa anyway;
this creates the record and the alert in one motion, one less tool in the chain.
Zapier remains the fallback if GHL's Inbound Webhook trigger can't be enabled.

## 2026-09-18 — Patient contact-form submissions captured in GHL (Else branch)
The B2B router's Else branch tags patients `patient-inquiry` instead of discarding.
Starts the patient database and per-source lead reporting. No Slack noise.

## 2026-09-17 — Reminder cadence: 24/48/72 hours
Billy confirmed on the Sep 15 call, overriding the spec's day 2/4/5. Reminder at 24h
and 48h, expiration + cascade handoff at 72h.

## 2026-09-17 — Do not rebuild BD's native lead engine
Audit proved capture, tier routing, radius matching, and notifications work natively.
Scope is the management layer only: reminders, expiration, cascade, patient loop,
B2B routing, tracking. The 404 on Lead Action edit pages is a BD admin-UI bug
(ticket filed), not missing config.

## 2026-09-17 — Dashboard is standalone, no dependency on Nick's platform
Tracking view built on GHL pipelines + a lightweight standalone view with a clean data
contract, so it works day one and can plug into Nick's platform later if that survives.

## OPEN — Maximum Matches = 5 vs one-doctor cascade
BD currently allows up to 5 doctors to match/buy the same lead. Spec assumes exclusive
sequential cascade. Billy decision needed: exclusive leads (spec) or shared (current).
Shapes the Workflow 4 build.

## RESOLVED 2026-09-20 — Reminder stop condition on doctor accept
~~GHL can't natively see a BD accept event.~~ BD fires a native Lead Accept webhook.
GHL receives it and removes the `pending-lead` tag or moves contact to a different
workflow stage, stopping the reminder sequence. No copy workaround needed.
