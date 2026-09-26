# Build Status

Current state of UCC Automation OS implementation. Updated as work completes.

**Last updated:** Sep 25, 2026

---

## Summary

| Lane | Status | Notes |
|------|--------|-------|
| B2B (Workflows 5–6) | **LIVE** | BD webhook → GHL Directory → pipelines + Slack + contacts |
| D2C Reminders (Workflow 2–3) | **LIVE** | Lead Reminder Sequence (w/ VM drop) + Accept/Decline Handler |
| Patient Expiration Watch | **PUBLISHING** | 72hr patient notice, Opp stage update included |
| Patient Watch Stop | **PUBLISHING** | Relay field names FIXED, publishing today (Stop first) |
| tier-annual Tag Coverage | **COMPLETE** | 705 members audited, 555 gaps fixed, 0 failures |
| BD Sign Up Auto-Tagger | **NEXT** | Closes standing leak for new Plan 3/31 signups |
| ZIP Fallback Cascade (Workflow 4) | PHASE 2 | Blocked by Maximum Matches decision |
| Dashboard (Workflow 8–9) | PARTIAL | Patient Leads pipeline (3 real opps in Awaiting Response) |

---

## B2C Account Workflows (Upper Cervical Care)

### Lead Reminder Sequence — LIVE (705-doctor audience)
Doctor reminder workflow for Annual/Unverified tier.

- [x] Inbound webhook trigger (both BD form templates wired)
- [x] Field mappings: `member_email`, `member_first_name`, `member_phone_number`
- [x] Branch on `tier-annual` tag
- [x] Add `pending-lead` tag
- [x] Custom Webhook relay to Patient Expiration Watch (premium action)
- [x] Wait 24hr → reminder 1 (email + SMS)
- [x] **NEW:** Voicemail drop (ringless, ~15sec Billy-approved script)
  - Drops immediately at 24hr mark (no time-window gate in v1)
  - Premium action + per-drop telephony charge — Billy aware
- [x] Wait 24hr → reminder 2 (email + SMS)
- [x] Wait 24hr → expiration notice (email + SMS)
- [x] Remove `pending-lead` tag, add `lead-expired` tag

### Lead Accept Decline Handler — LIVE
Stops reminders when doctor responds.

- [x] Inbound webhook trigger (BD Lead Accept/Decline event)
- [x] Field mappings: `user.email`, `user.first_name`, `lead_action` (NESTED payload)
- [x] Create/Update Contact (doctor)
- [x] Remove From Workflow → Lead Reminder Sequence
- [x] Remove Tag `pending-lead`
- [x] Custom Webhook relay to Patient Watch Stop
  - **FIXED:** Relay body uses nested paths: `lead.lead_id`, `lead.lead_email`
  - Verified with live decline (lead 9630) — real values received
- [x] If/Else on `lead_action`
- [x] Accept branch: add `lead-accepted` tag
- [x] Decline branch: add `lead-declined` tag

### Patient Expiration Watch — PUBLISHING TODAY
Notifies patient after 72hr if doctor doesn't respond.

- [x] Inbound webhook trigger (fed by GHL relay, NOT BD)
- [x] Create/Update Contact (patient: `lead_name`, `lead_email`, `lead_phone`)
- [ ] **ADD:** Send Email (patient confirmation — "within 48 hours") ← INSERT HERE
- [x] Add Tag `patient-inquiry`
- [x] Create Opportunity (pipeline "Patient Leads", stage "Awaiting Response")
- [ ] **FIX:** Opportunity Name → `{{lead_name}} → {{member_email}}` (shows doctor on board)
- [x] Opportunity custom fields: `lead_id`, `patient_email`, `patient_phone`, `patient_location`, `doctor_email`
- [x] Wait 72 hours
- [x] If/Else: pipeline stage = "Awaiting Response"
- [x] YES: Send patient expiration email (Find a Doctor variant, Billy-approved)
- [x] Add Tag `patient-expired-notified`
- [x] Update Opportunity stage → "Expired - No Response"
- [ ] Publish (after Patient Watch Stop)

**Copy:** `copy/patient-confirmation-instant.md`

### Patient Watch Stop — FIX NEEDED + PUBLISH
Stops Patient Expiration Watch when doctor accepts/declines.

**TEST RESULT (Sept 25, 8:22pm):**
- Patient removed from Patient Expiration Watch: ✓ CONFIRMED
- Opportunity stage update: ✗ FAILED ("Internal Action Error - Please use Opportunity trigger/find opportunity action")

**FIX:** Add "Opportunity Lookup" action BEFORE the If/Else condition (see `ghl/workflow-fixes-sept25.md`)

- [x] Inbound webhook trigger ("Accept / Decline Relay")
- [x] Trigger sample captured (from Lead Accept Decline Handler relay)
- [x] Create/Update Contact by `lead_email` (patient)
- [x] Remove From Workflow → Patient Expiration Watch
- [ ] **ADD:** Opportunity Lookup (Pipeline: Patient Leads, Contact: enrolled) ← FIX
- [x] If/Else on `lead_action` (LITERAL values: "accept" / "decline", not merge tags)
- [x] Accept branch: Update Opportunity stage → "Accepted"
- [x] Decline branch: Update Opportunity stage → "Declined"
- [x] None branch: END
- [ ] Re-test after fix
- [ ] Publish (first, before Expiration Watch)

### Sign Up Auto-Tagger — BUILD
Automatically tags new Plan 3/31 signups with `tier-annual`. Closes standing leak.

- [ ] Create workflow: Inbound Webhook trigger (BD Sign Up)
- [ ] Create/Update Contact (email, first_name, last_name)
- [ ] If/Else: plan_id Is "3" OR Is "31"
- [ ] YES branch: Add Tag `tier-annual`
- [ ] Wire BD "Sign Up" webhook to workflow URL
- [ ] Test with real signup
- [ ] Publish

**BD webhook event:** "Sign Up" (or "New Member Registration" / "Member Created")
**Spec:** `ghl/bd-signup-auto-tagger.md`

---

## B2B Account Workflows (Directory)

### B2B Contact Form — LIVE
Routes doctor inquiries to pipelines + Slack.

- [x] Inbound webhook trigger
- [x] Field mappings: `yourname`, `inquiry_email`, `phone`, `comments`
- [x] If/Else on `inquirer_type`
- [x] Existing Member branch → pipeline + Slack
- [x] Prospective Doctor branch → pipeline + nurture + Slack
- [x] Else branch → tag `patient-inquiry` + Slack alert
- [ ] B2B ack emails — pending sending domain check

---

## BD Webhook Configuration

| BD Event | Points To | Notes |
|----------|-----------|-------|
| Contact Us Form Submitted | B2B Directory workflow | Live |
| Lead Submitted (`bootstrap_get_match`) | Lead Reminder Sequence | Live |
| Lead Submitted v2 (`copy_of_bootstrap_get_match`) | Lead Reminder Sequence | Live |
| Lead Accept / Decline | Lead Accept Decline Handler | Live |
| Sign Up | Sign Up Auto-Tagger | **TO BUILD** — closes tag leak |

**Key constraint:** BD allows ONE custom webhook per form. All fan-out happens
GHL-side via Custom Webhook actions.

---

## Pipeline: Patient Leads

**Location:** B2C Account

**Stages:**
1. Awaiting Response (default)
2. Accepted
3. Declined
4. Expired - No Response
5. Expired - Cascade Failed (future)

**Custom fields (Lead Automation folder):**
- `lead_id`
- `patient_email`
- `patient_phone`
- `patient_location`
- `doctor_email`

**Setting:** Duplicate opportunities DISABLED

---

## Completed Today (Sep 25, 2026)

### tier-annual Tag Coverage Audit — COMPLETE

Audited GHL coverage for Plan 3 (Unverified Doctor) and Plan 31 (Level 1 Annual) members.

**Findings:**
- Plan 3: 150 members | Plan 31: 562 members | Overlap: 7 | Unique: 705
- Already tagged: 150 | Untagged: 70 | Missing from GHL: 485

**Remediation:**
- ✅ 485 contacts created with `tier-annual` tag
- ✅ 70 contacts updated with `tier-annual` tag
- ✅ 0 failures
- ✅ Full {3, 31} population now tagged

**Standing leak:** New signups after Sept 25 get NO tag until auto-tagger is built.

---

## Next Up

1. **Publish Patient Watch Stop + Patient Expiration Watch** (today)
   - Publish order: Stop first, then Watch
   - End-to-end test with real accept/decline

2. **Patient instant-confirmation email:**
   - First action in Patient Expiration Watch (before 72hr wait)
   - Pending copy approval

3. **BD Sign Up Auto-Tagger:**
   - Wire BD "Sign Up" webhook to new GHL workflow
   - Branch on `plan_id` ∈ {3, 31}
   - Add `tier-annual` tag on match
   - Closes standing leak for new signups

4. **Log end-to-end test results**

5. **ZIP Fallback Cascade** — discuss with Billy

---

## Not Started

### ZIP Fallback Cascade (Workflow 4)
- **BLOCKED:** Awaiting Billy decision on Maximum Matches (see decision log)
- [ ] Radius lookup logic
- [ ] 48hr cascade windows
- [ ] 2-backup limit then Exception

### Cleanup
- [ ] Fix "jordan" template bug in BD
- [ ] Audit/clear 922 items in BD Forms Inbox

---

## Open Questions for Billy

1. **Maximum Matches = 5 vs exclusive cascade** — BD allows up to 5 doctors to match
   the same lead. Spec assumes one-doctor sequential cascade. Which model?

2. **info@uppercervicalcare.com monitoring** — Voicemail script references this address.
   Who monitors it? Reply-to on reminder emails should point at a monitored address.

---

## Platform Credentials / Access

| System | Access | Notes |
|--------|--------|-------|
| BD Admin | Via Jess UCC login | Developer Hub webhooks |
| GHL Directory | mDoZhNXk... | B2B workflows |
| GHL B2C | o9QyWbMf... | D2C workflows |
| Slack | #b2b-inquiries | Constansa's alert channel |
| Zapier | Billy's account | Bridge layer if needed |
