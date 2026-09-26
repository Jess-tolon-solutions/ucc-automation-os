# Canonical GHL Workflow Design

Source of truth for D2C lead workflows. Compare against live GHL config during audits.

**IMPORTANT:** Field names below are from REAL BD payloads (see `bd-payload-schema.md`).
Never use synthetic/guessed field names.

---

## Workflow 1 — Lead Reminder Sequence

**Account:** B2C (Upper Cervical Care)
**Status:** LIVE (705-doctor audience)

**Trigger:** Inbound Webhook — BD "Lead Submitted" (`bootstrap_get_match` / `copy_of_bootstrap_get_match`)

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{member_email}}`
   - First Name ← `{{member_first_name}}`
   - Phone ← `{{member_phone_number}}`

2. **If/Else: Check tier tag**
   - Condition: Contact has tag `tier-annual`
   - YES → continue to step 3
   - NO (Level 2+) → **END** (no reminders for Level 2+ doctors)

3. **Add Tag:** `pending-lead`

4. **Custom Webhook Relay** → Patient Expiration Watch
   - Body: `lead_id`, `lead_name`, `lead_email`, `lead_phone`, `lead_location`,
     `lead_message`, `member_email` (doctor)
   - Purpose: Enrolls patient in 72hr expiration watch

5. **Wait:** 24 hours

6. **Send Reminder 1** (email + SMS)
   - Copy: `copy/doctor-reminder-24hr.md`

7. **Voicemail Drop** (ringless)
   - Script: ~15 seconds, references the email, mentions info@uppercervicalcare.com
   - Copy: `copy/doctor-reminder-24hr-vm.md`
   - **NOTE:** Drops immediately at 24hr mark (no time-window gate in v1).
     If night drops cause complaints, retrofit 8am recurring-window gate.
   - **COST:** Premium action + per-drop telephony charge — Billy aware.

8. **Wait:** 24 hours

9. **Send Reminder 2** (email + SMS)
   - Copy: `copy/doctor-reminder-48hr.md`

10. **Wait:** 24 hours

11. **Send 72hr Expiration Notice** (email + SMS)
    - Copy: `copy/doctor-reminder-72hr.md`

12. **Remove Tag:** `pending-lead`

13. **Add Tag:** `lead-expired`

14. **END**

---

## Workflow 2 — Lead Accept Decline Handler

**Account:** B2C (Upper Cervical Care)
**Status:** LIVE

**Trigger:** Inbound Webhook — BD "Lead Accept / Decline"

**Schema:** NESTED payload — see `bd-payload-schema.md` for full structure.

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{user.email}}`
   - First Name ← `{{user.first_name}}`

2. **Remove From Workflow** → target: Lead Reminder Sequence

3. **Remove Tag:** `pending-lead`

4. **Custom Webhook Relay** → Patient Watch Stop
   - Body (use nested paths):
     ```json
     {
       "lead_id": "{{inboundWebhookRequest.lead.lead_id}}",
       "lead_email": "{{inboundWebhookRequest.lead.lead_email}}",
       "lead_action": "{{inboundWebhookRequest.lead_action}}"
     }
     ```
   - Purpose: Stops patient's 72hr expiration watch, updates Opportunity stage
   - **NOTE:** Fires for ALL tiers including Level 2+ — harmless no-op for those
     (patient never enrolled in Patient Watch)

5. **If/Else on lead_action:**

   **Branch A: Accept**
   - Condition: `{{lead_action}}` is `accept`
   - Action: **Add Tag:** `lead-accepted`
   - **END**

   **Branch B: Decline**
   - Condition: `{{lead_action}}` is `decline`
   - Action: **Add Tag:** `lead-declined`
   - **END**

---

## Workflow 3 — Patient Expiration Watch

**Account:** B2C (Upper Cervical Care)
**Status:** PUBLISHING TODAY

**Trigger:** Inbound Webhook — "Patient Watch Start" (fed by GHL relay from Lead Reminder Sequence, NOT BD)

### Actions (in order):

1. **Create/Update Contact** (patient)
   - Email ← `{{lead_email}}`
   - First Name ← `{{lead_name}}`
   - Phone ← `{{lead_phone}}`

2. **Send Email** (patient confirmation — immediate)
   - Subject: Your inquiry has been received
   - Body: "Thank you for reaching out... You should hear back within 48 hours."
   - Copy: `copy/patient-confirmation-instant.md`

3. **Add Tag:** `patient-inquiry`

4. **Create Opportunity**
   - Pipeline: Patient Leads
   - Stage: Awaiting Response
   - Opportunity Name: `{{lead_name}} → {{member_email}}`
   - Custom Fields (Lead Automation folder):
     - `lead_id` ← `{{lead_id}}`
     - `patient_email` ← `{{lead_email}}`
     - `patient_phone` ← `{{lead_phone}}`
     - `patient_location` ← `{{lead_location}}`
     - `doctor_email` ← `{{member_email}}`

5. **Wait:** 72 hours

6. **If/Else: Check Opportunity stage**
   - Condition: Pipeline stage is "Awaiting Response"
   - YES → continue to step 7
   - NO (already Accepted/Declined) → **END**

7. **Send Patient Expiration Email**
   - Copy: `copy/patient-expiration-72hr.md` (Find a Doctor variant)
   - Billy-approved

8. **Add Tag:** `patient-expired-notified`

9. **Update Opportunity Stage** → "Expired - No Response"

10. **END**

---

## Workflow 4 — Patient Watch Stop

**Account:** B2C (Upper Cervical Care)
**Status:** PUBLISHING TODAY (Stop first, then Expiration Watch)

**Trigger:** Inbound Webhook — "Accept / Decline Relay" (fed by GHL relay from Lead Accept Decline Handler, NOT BD)

### Actions (in order):

1. **Create/Update Contact** (patient)
   - Email ← `{{lead_email}}`
   - (matches patient enrolled in Patient Expiration Watch)

2. **Remove From Workflow** → target: Patient Expiration Watch

3. **Opportunity Lookup** (REQUIRED for Update Opportunity to work)
   - Pipeline: Patient Leads
   - Lookup by: Contact (enrolled contact)
   - Loads the opportunity created by Patient Expiration Watch into context

4. **If/Else on lead_action:**

   **Branch A: Accept**
   - Condition: `{{lead_action}}` is `accept` (LITERAL typed value, not merge tag)
   - Action: **Update Opportunity Stage** → "Accepted"
   - **END**

   **Branch B: Decline**
   - Condition: `{{lead_action}}` is `decline` (LITERAL typed value, not merge tag)
   - Action: **Update Opportunity Stage** → "Declined"
   - **END**

   **None Branch:**
   - **END**

---

## Workflow 5 — B2B Contact Form (Directory Account)

**Account:** Directory
**Status:** LIVE

**Trigger:** Inbound Webhook — BD "Contact Us Form Submitted"

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{inquiry_email}}`
   - Name ← `{{yourname}}`
   - Phone ← `{{phone}}`

2. **If/Else on inquirer_type:**

   **Branch 1: Existing Member**
   - Condition: `inquirer_type` contains `existing`
   - Actions:
     - Add Tag: `b2b-member-support`
     - Add to Pipeline: B2B Member Support → Stage: New Request
     - Send Acknowledgment Email
     - Slack Webhook

   **Branch 2: Prospective Doctor**
   - Condition: `inquirer_type` contains `interested in joining`
   - Actions:
     - Add Tag: `b2b-prospective`
     - Add to Pipeline: Prospective Doctors → Stage: New Inquiry
     - Send Acknowledgment Email
     - Start Nurture Sequence
     - Slack Webhook

   **Else Branch: Patient/Unclassified**
   - Actions:
     - Add Tag: `patient-inquiry`
     - Slack Webhook (alert: requires manual review)
     - No pipeline assignment

---

## Relay Architecture

**Rule:** A relay lives in the workflow whose TRIGGER carries the signal it forwards.

| Source Workflow | Relay Target | Purpose |
|-----------------|--------------|---------|
| Lead Reminder Sequence | Patient Expiration Watch | Enroll patient in 72hr watch |
| Lead Accept Decline Handler | Patient Watch Stop | Stop patient watch, update Opp stage |

**Why relays exist:** GHL's "Remove From Workflow" only acts on the ENROLLED contact.
Cross-contact stops (doctor event must stop patient enrollment) require webhook relay
into a workflow that enrolls the other party.

---

## Audit Checklist

### Lead Reminder Sequence
- [x] Trigger is Inbound Webhook (not form, not tag, not other)
- [x] Create/Update Contact maps `member_email` → Email
- [x] Create/Update Contact maps `member_first_name` → First Name
- [x] Create/Update Contact maps `member_phone_number` → Phone
- [x] If/Else checks contact tag `tier-annual` (YES → continue, NO → END)
- [x] Add Tag `pending-lead` exists AFTER tier check
- [x] Custom Webhook relay to Patient Expiration Watch
- [x] Three Wait steps (24hr each)
- [x] Reminder 1: email + SMS + voicemail drop
- [x] Reminder 2: email + SMS
- [x] Expiration notice: email + SMS
- [x] At end: Remove Tag `pending-lead`, Add Tag `lead-expired`

### Lead Accept Decline Handler
- [x] Trigger is Inbound Webhook
- [x] Create/Update Contact maps `user.email` → Email (nested path)
- [x] Create/Update Contact maps `user.first_name` → First Name
- [x] Remove From Workflow targets "Lead Reminder Sequence" (exact name match)
- [x] Remove Tag `pending-lead` exists
- [x] Custom Webhook relay to Patient Watch Stop (nested paths: `lead.lead_id`, `lead.lead_email`)
- [x] If/Else branches on `lead_action` field
- [x] Accept branch adds `lead-accepted` tag
- [x] Decline branch adds `lead-declined` tag

### Patient Expiration Watch
- [x] Trigger is Inbound Webhook (GHL relay, NOT BD)
- [x] Create/Update Contact creates patient record
- [ ] Send Email: patient confirmation ("within 48 hours") — TO ADD
- [x] Add Tag `patient-inquiry`
- [x] Create Opportunity in Patient Leads pipeline
- [ ] Opportunity Name: `{{lead_name}} → {{member_email}}` — TO FIX
- [x] Wait 72 hours
- [x] If/Else checks Opportunity stage = "Awaiting Response"
- [x] Send patient expiration email (Find a Doctor variant)
- [x] Add Tag `patient-expired-notified`
- [x] Update Opportunity stage → "Expired - No Response"

### Patient Watch Stop
- [x] Trigger is Inbound Webhook (GHL relay, NOT BD)
- [x] Create/Update Contact by `lead_email` (patient)
- [x] Remove From Workflow targets "Patient Expiration Watch"
- [ ] Opportunity Lookup (Pipeline: Patient Leads, Contact: enrolled) — TO ADD (fixes "Internal Action Error")
- [x] If/Else branches on `lead_action` (LITERAL values, not merge tags)
- [x] Accept branch: Update Opportunity → "Accepted"
- [x] Decline branch: Update Opportunity → "Declined"

---

*Last updated: Sep 25, 2026*
