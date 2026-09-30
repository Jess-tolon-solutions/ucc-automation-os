# Decision log

Dated record of non-obvious choices. Newest first.

## 2026-09-25 — General Contact Form patient confirmation: direct to Find a Doctor

Patients who submit the general contact form (classified as "patient looking for a doctor")
need a confirmation email directing them to the directory.

**Technical finding:** BD's `/locations` search is client-side JavaScript. No URL parameter
pre-fills ZIP results. Cannot deep-link to `?zip={{lead_location}}`.

**Solution:** Email mentions their ZIP for context but links to the main directory page
where they can search manually.

**Copy:** `copy/patient-general-form-confirmation.md`
**Configuration:** BD Admin → Forms → [General Contact Form] → Autoresponder

## 2026-09-25 — End-to-end decline test: patient stop confirmed, Opp update failed

**Test:** Sept 25, 8:22pm — real decline via Patient Watch Stop relay

**Results:**
- Patient removed from Patient Expiration Watch: ✓ CONFIRMED
- Opportunity stage update to "Declined": ✗ FAILED

**Error:** "Internal Action Error - Please use Opportunity trigger/find opportunity action to get the opportunity"

**Root cause:** Workflow triggered by inbound webhook has contact context only. The
"Update Opportunity" action requires an opportunity to be loaded into context first.

**Fix:** Add "Opportunity Lookup" action in main line BEFORE the If/Else condition.
Lookup by Pipeline: Patient Leads, Contact: enrolled contact. This loads the opp
created by Patient Expiration Watch into context so Update Opportunity can act on it.

**GHL action naming:**
- "Opportunity Lookup" — finds existing opp by pipeline + contact (USE THIS)
- "Update Opportunity" — updates an opp already in context
- "Create Opportunity" — creates new opp (not what we need)

## 2026-09-25 — Sign Up Auto-Tagger workflow designed (closes standing leak)

New workflow to automatically tag Plan 3/31 signups with `tier-annual`:
1. BD fires "Sign Up" webhook on new member registration
2. GHL workflow: Inbound Webhook → Create/Update Contact → If plan_id ∈ {3, 31} → Add Tag tier-annual

**BD webhook event:** "Sign Up" (or "New Member Registration" / "Member Created")
**Field to branch on:** `plan_id` or `subscription_id` — verify from real payload

This closes the leak where new Annual/Unverified signups never get tagged and fall
out of the reminder sequence.

## 2026-09-25 — Patient confirmation email: send immediately on Patient Watch enrollment

Added instant patient confirmation as first action in Patient Expiration Watch
(after Create/Update Contact, before Add Tag).

**Copy:** "Your inquiry has been received... You should hear back within 48 hours."
**File:** `copy/patient-confirmation-instant.md`

Patient must never see membership level or the $50 fee (per spec Workflow 3, line 83).

## 2026-09-25 — Lead Accept/Decline payload is NESTED (verified via real decline)

Captured real decline event (lead 9630). Accept/Decline payload uses nested objects,
unlike the flat Lead Submitted payload.

**Structure:**
- Top level: `lead_action`, `is_webhook_post`, `lead_stringify`, `user_stringify`
- `lead{}`: `lead_id`, `lead_email`, `lead_phone_copy` (note: NOT `lead_phone`), etc.
- `user{}`: `user_id`, `email`, `first_name`, `subscription_id`, `member_login_link` (SENSITIVE)

**GHL merge tags must use nested paths:**
- `{{inboundWebhookRequest.lead.lead_id}}` — NOT `{{lead_id}}`
- `{{inboundWebhookRequest.lead.lead_email}}` — NOT `{{lead_email}}`

**Previous bug:** Relay body used flat paths → rendered null. Fixed.

## 2026-09-25 — Accept/Decline fires for ALL tiers (including Level 2+)

Observed Accept/Decline event for subscription_id 26 (Level 2+) with lead_price 0.00.
The workflow receives events for all tiers, not just Annual/Unverified.

**Implication:** Stop relay firing for Level 2+ is a harmless no-op — those patients
were never enrolled in Patient Expiration Watch (enrollment only happens for tier-annual
doctors in Lead Reminder Sequence).

## 2026-09-25 — Relay placement rule: relay lives where the trigger signal originates

Removed a misplaced relay from Lead Reminder Sequence (Patient Watch Stop relay was
firing at submission time for all tiers). The relay belongs in Lead Accept Decline
Handler — that's the workflow whose trigger carries the accept/decline signal.

**Rule:** A relay lives in the workflow whose TRIGGER carries the signal it forwards.

## 2026-09-25 — Voicemail drop added to reminder cadence

Added ringless voicemail drop directly after 24hr reminder email (tier-annual branch only).
Billy-approved ~15sec script, references the email, mentions info@uppercervicalcare.com.

**Delivery model:** Option B — drops immediately at 24hr mark, whatever hour. No
time-window gate in v1. If night drops cause complaints, retrofit 8am recurring-window gate.

**Cost implications:**
- Premium action + per-drop telephony charge (flagged to Billy)
- Ringless delivery is carrier-dependent; office VoIP/auto-attendants may reject drops
- Email remains the guaranteed channel; VM is best-effort second channel

## 2026-09-25 — OPEN: info@uppercervicalcare.com monitoring

Voicemail script references info@uppercervicalcare.com. Billy to confirm who monitors
that mailbox. Reply-to on reminder emails should point at a monitored address.

## 2026-09-25 — tier-annual tag coverage audit: Sept 22 covered Annual only; 555 of 564 Unverified members uncovered

**Background:** The D2C reminder workflow branches on the `tier-annual` tag to identify
Plan 3 (Unverified Doctor) and Plan 31 (Level 1 Annual) members. The Sept 22 bulk-tag
operation was scoped incorrectly — it covered only Plan 31 (Level 1 Annual), leaving
Plan 3 (Unverified Doctor) almost entirely untagged.

**Audit findings:**
- Plan 3 (Unverified Doctor): 150 members in BD export
- Plan 31 (Level 1 Annual): 562 members in BD export
- Overlap (7 emails in both): net 705 unique members
- Already tagged in GHL: 150 contacts
- Gap: 555 members missing `tier-annual` tag

**Remediation completed (Sept 25):**
- 485 contacts created (new to GHL) with `tier-annual` tag
- 70 contacts updated (existed but untagged) with `tier-annual` tag
- 0 failures
- All 705 Plan 3 + Plan 31 members now covered

**Standing leak identified:** This was a one-time backfill. New Plan 3/31 signups
after Sept 25 will NOT receive the tag automatically until the BD Sign Up webhook
auto-tagger workflow is built. That workflow is now priority — see proposal below.

**Proposed fix (BD Sign Up Auto-Tagger):**
1. BD fires "Sign Up" webhook on new member registration
2. GHL workflow receives payload containing `plan_id`
3. If `plan_id` ∈ {3, 31}: Create/Update Contact, add `tier-annual` tag
4. Publish and monitor

Until that workflow is live, any new Plan 3/31 signups will silently skip the
reminder cadence.

## 2026-09-23/24 — BD allows ONE custom webhook per form; fan-out via GHL relay
BD limits one custom webhook per form. Both live lead form slots (`bootstrap_get_match`
and `copy_of_bootstrap_get_match`) are already used by the Lead Reminder Sequence feed.

**Solution:** All fan-out happens GHL-side via workflow Custom Webhook actions, not by
adding more BD webhooks. The "form copy trick" doesn't help — a new form copy is
selectable in the dropdown but never receives live submissions.

**Architecture:**
- Lead Reminder Sequence receives BD webhook → relays JSON to Patient Expiration Watch
- Lead Accept Decline Handler receives BD webhook → relays to Patient Watch Stop
- GHL Custom Webhook is a premium action with per-execution microcharge

## 2026-09-23/24 — "Remove From Workflow" only acts on enrolled contact
GHL's "Remove From Workflow" action only affects the CURRENTLY ENROLLED contact in
that workflow execution. It cannot reach across to remove a different contact.

**Implication:** Cross-contact stops (doctor event must stop patient enrollment) require
a webhook relay into a workflow that enrolls the other party. The Patient Watch Stop
workflow exists specifically to receive the relay and act on the patient contact.

## 2026-09-23/24 — Synthetic payload rule tightened
Rule reaffirmed: no synthetic payloads to production webhook URLs.

**Tightened:** NEVER use a spoofed `BD-Software` user-agent in synthetic payloads.

**Exception:** Replaying a relay body we authored ourselves (exact keys only) to satisfy
GHL's sample-capture requirement is acceptable — these are our own field names, not
pretending to be BD.

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

## RESOLVED 2026-09-25 — Maximum Matches = 5, first to accept wins

**Billy's decision:** All 5 matched doctors receive the lead notification simultaneously.
First doctor to accept wins — the others lose access.

**Implication for Workflow 4 (ZIP Fallback Cascade):**
- On 72hr expiration (no response from any of the 5), patient gets "Find a Doctor" email
- No sequential cascade needed — BD's native matching already fans out to 5 doctors
- The cascade is parallel, not serial

**Implication for Patient Expiration Watch:**
- 72hr expiration notice remains the same
- Patient is directed to self-service via directory (Find a Doctor link)
- Manual exception queue if patient replies to expiration email needing help

This unblocks the Workflow 4 design — it's simpler than the spec's sequential model.

## RESOLVED 2026-09-20 — Reminder stop condition on doctor accept
~~GHL can't natively see a BD accept event.~~ BD fires a native Lead Accept webhook.
GHL receives it and removes the `pending-lead` tag or moves contact to a different
workflow stage, stopping the reminder sequence. No copy workaround needed.
