# Decision log

Dated record of non-obvious choices. Newest first.

## 2026-09-23 — BD has two Lead Submitted form templates (both now wired)
BD profiles use TWO different form templates for lead submissions:
- `bootstrap_get_match` — original template (built-in webhook existed)
- `copy_of_bootstrap_get_match` — v2 template (NO webhook until today)

Some profiles load both forms; which one fires depends on which contact button the
patient clicks. Test leads from ZZTEST were firing the v2 form, which had no webhook.

**Fix:** Created custom webhook in BD Developer Hub for `copy_of_bootstrap_get_match`
pointing to the same B2C workflow URL. Both forms now trigger the Lead Reminder Sequence.

**Coverage note:** This wasn't just a test issue — any real doctor profile using the v2
template was also missing webhooks. Now fixed.

## 2026-09-22 — INCIDENT: Synthetic payload broke production workflow
A real lead (#9601, patient inquiry to Dr. Steven MacDonald) triggered the Lead Reminder
Sequence while it was mapped to synthetic field names (`doctor_email`, `plan_id`) instead
of BD's real field names. Create/Update Contact failed silently — no contact created,
workflow enrolled a phantom. Workflow paused (Draft) pending fix.

**Root cause:** We posted synthetic curl payloads to the production webhook URL to prime
GHL's field mapper. BD's real payload uses different field names.

**Rule (permanent):** NEVER post synthetic payloads to production webhook URLs. All trigger
mappings must come from captured real events via the ZZTEST doctor.

## 2026-09-22 — BD Lead Submitted payload: real field names (CORRECTS Sep 20 entry)
Captured real BD webhook via ZZTEST. Actual field names:
- **Doctor fields:** `member_email`, `member_first_name`, `member_last_name`, `member_phone_number`
- **Patient fields:** `lead_name`, `lead_email`, `lead_phone`, `lead_message`, `lead_location`
- **System fields:** `lead_id`, `lead_match_id`, `formname` (= `bootstrap_get_match`)

**CRITICAL:** `plan_id` / tier is **NOT** in the payload. Cannot branch on tier from webhook
data alone. Must use pre-applied contact tag (`tier-annual`) synced from BD member exports.

The Sep 20 entry below was based on synthetic curl and is **WRONG** — do not use those field names.

## 2026-09-22 — BD support ticket: request plan_id in Lead Submitted payload
Filed request with BD to add `plan_id` or membership tier field to the Lead Submitted
webhook payload. Would eliminate need for pre-tagged contacts and manual tier sync.

## ~~2026-09-20 — BD Lead Accept/Decline payload schema confirmed~~ SUPERSEDED
~~Wired the Lead Accept/Decline webhook to GHL and discovered the actual payload fields
via inbound webhook custom values: Lead Id, Doctor Id, Doctor Email, Doctor First Name,
Action, Action Timestamp, Plan Id.~~

**THIS ENTRY WAS WRONG** — based on synthetic curl payload, not real BD data. See Sep 22
correction above. Lead Accept/Decline real schema still TBD (need to capture real decline).

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
