# Build Status

Current state of UCC Automation OS implementation. Updated as work completes.

**Last updated:** Sep 24, 2026

---

## Summary

| Lane | Status | Notes |
|------|--------|-------|
| B2B (Workflows 5–6) | **LIVE** | BD webhook → GHL Directory → pipelines + Slack + contacts |
| D2C Reminders (Workflow 2–3) | **LIVE** | Lead Reminder Sequence + Accept/Decline Handler tested |
| Patient Expiration Watch | **LIVE** | 72hr patient notice via relay from Lead Reminder Sequence |
| Patient Watch Stop | **DRAFT** | Shell built, field name fix needed |
| ZIP Fallback Cascade (Workflow 4) | NOT STARTED | Blocked by Maximum Matches decision |
| Dashboard (Workflow 8–9) | PARTIAL | Patient Leads pipeline + Opportunity tracking live |

---

## B2C Account Workflows (Upper Cervical Care)

### Lead Reminder Sequence — LIVE
Doctor reminder workflow for Annual/Unverified tier.

- [x] Inbound webhook trigger (both BD form templates wired)
- [x] Field mappings: `member_email`, `member_first_name`
- [x] Branch on `tier-annual` tag
- [x] Add `pending-lead` tag
- [x] **NEW:** Custom Webhook relay to Patient Expiration Watch (premium action)
- [x] Wait 24hr → reminder 1 (email + SMS)
- [x] Wait 24hr → reminder 2 (email + SMS)
- [x] Wait 24hr → expiration notice (email + SMS)
- [x] Remove `pending-lead` tag, add `lead-expired` tag

### Lead Accept Decline Handler — LIVE
Stops reminders when doctor responds.

- [x] Inbound webhook trigger (BD Lead Accept/Decline event)
- [x] Field mappings: `user.email`, `user.first_name`, `lead_action`
- [x] Create/Update Contact (doctor)
- [x] Remove From Workflow → Lead Reminder Sequence
- [x] Remove Tag `pending-lead`
- [x] **NEW:** Custom Webhook relay to Patient Watch Stop
- [x] If/Else on `lead_action`
- [x] Accept branch: add `lead-accepted` tag
- [x] Decline branch: add `lead-declined` tag
- [ ] **TODO:** Fix relay body — `lead_id` and `lead_email` render null (use `lead.lead_id`, `lead.lead_email`)

### Patient Expiration Watch — LIVE
Notifies patient after 72hr if doctor doesn't respond.

- [x] Inbound webhook trigger (fed by GHL relay, NOT BD)
- [x] Create/Update Contact (patient: `lead_name`, `lead_email`, `lead_phone`)
- [x] Add Tag `patient-inquiry`
- [x] Create Opportunity (pipeline "Patient Leads", stage "Awaiting Response")
- [x] Opportunity custom fields: `lead_id`, `patient_email`, `patient_phone`, `patient_location`, `doctor_email`
- [x] Wait 72 hours
- [x] If/Else: pipeline stage = "Awaiting Response"
- [x] YES: Send patient expiration email (Find a Doctor variant, Billy-approved)
- [x] Add Tag `patient-expired-notified`
- [ ] **TODO:** Update Opportunity stage → "Expired - No Response"

### Patient Watch Stop — DRAFT
Stops Patient Expiration Watch when doctor accepts/declines.

- [x] Inbound webhook trigger ("Accept / Decline Relay")
- [x] Trigger sample captured
- [ ] Create/Update Contact by `lead_email`
- [ ] Remove From Workflow → Patient Expiration Watch
- [ ] If/Else on `lead_action`
- [ ] Update Opportunity stage → Accepted/Declined
- [ ] Publish

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

## Tomorrow (Sep 25, 2026)

1. **Fix Patient Watch Stop relay:**
   - Update Lead Accept Decline Handler relay body
   - `lead_id` → `{{inboundWebhookRequest.lead.lead_id}}`
   - `lead_email` → `{{inboundWebhookRequest.lead.lead_email}}`

2. **Complete Patient Watch Stop workflow:**
   - Add remaining steps
   - Test end-to-end
   - Publish

3. **Add Opportunity stage update** to Patient Expiration Watch (Expired - No Response)

4. **ZIP Fallback Cascade** — discuss with Billy

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

---

## Platform Credentials / Access

| System | Access | Notes |
|--------|--------|-------|
| BD Admin | Via Jess UCC login | Developer Hub webhooks |
| GHL Directory | mDoZhNXk... | B2B workflows |
| GHL B2C | o9QyWbMf... | D2C workflows |
| Slack | #b2b-inquiries | Constansa's alert channel |
| Zapier | Billy's account | Bridge layer if needed |
