# Canonical GHL Workflow Design

Source of truth for D2C lead workflows. Compare against live GHL config during audits.

**IMPORTANT:** Field names below are from REAL BD payloads (see `bd-payload-schema.md`).
Never use synthetic/guessed field names.

---

## Workflow 1 — Lead Reminder Sequence

**Account:** B2C (Upper Cervical Care)

**Trigger:** Inbound Webhook — BD "Lead Submitted" (`bootstrap_get_match`)

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{member_email}}`
   - First Name ← `{{member_first_name}}`

2. **If/Else: Check tier tag**
   - Condition: Contact has tag `tier-annual`
   - YES → continue to step 3
   - NO (Level 2+) → **END** (no reminders for Level 2+ doctors)

3. **Add Tag:** `pending-lead`

4. **Wait:** 24 hours

5. **Send Reminder 1** (email + SMS)
   - Copy: `copy/doctor-reminder-24hr.md`

6. **Wait:** 24 hours

7. **Send Reminder 2** (email + SMS)
   - Copy: `copy/doctor-reminder-48hr.md`

8. **Wait:** 24 hours

9. **Send 72hr Expiration Notice** (email + SMS)
   - Copy: `copy/doctor-reminder-72hr.md`

10. **Remove Tag:** `pending-lead`

11. **Add Tag:** `lead-expired`

12. **END**

---

## Workflow 2 — Lead Accept Decline Handler

**Account:** B2C (Upper Cervical Care)

**Trigger:** Inbound Webhook — BD "Lead Accept / Decline"

**Schema status:** Real field names TBD — must capture actual decline event via ZZTEST

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{member_email}}` *(must match Workflow 1's field mapping to prevent duplicates)*
   - First Name ← `{{member_first_name}}`

2. **Remove From Workflow** → target: Lead Reminder Sequence

3. **Remove Tag:** `pending-lead`

4. **If/Else on Action field:** *(field name and values UNVERIFIED — capture real event)*

   **Branch A: Accept**
   - Condition: `[action field]` contains `accept` (or actual value)
   - Action: **Add Tag:** `lead-accepted`
   - **END**

   **Branch B: Decline**
   - Condition: `[action field]` contains `decline` (or actual value)
   - Action: **Add Tag:** `lead-declined`
   - **END**

---

## Workflow 3 — B2B Contact Form (Directory Account)

**Account:** Directory

**Trigger:** Inbound Webhook — BD "Contact Us Form Submitted"

### Actions (in order):

1. **Create/Update Contact**
   - Email ← `{{email}}`
   - Name ← `{{name}}`
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

## Audit Checklist

### Lead Reminder Sequence
- [ ] Trigger is Inbound Webhook (not form, not tag, not other)
- [ ] Create/Update Contact action exists and maps `member_email` → Email
- [ ] Create/Update Contact also maps `member_first_name` → First Name
- [ ] If/Else checks contact tag `tier-annual` (YES → continue, NO → END)
- [ ] Add Tag `pending-lead` exists AFTER tier check, BEFORE first Wait
- [ ] Three Wait steps (24hr each)
- [ ] Three Send actions (reminder 1, 2, expiration)
- [ ] At end: Remove Tag `pending-lead`, Add Tag `lead-expired`

### Lead Accept Decline Handler
- [ ] Trigger is Inbound Webhook
- [ ] Create/Update Contact maps `member_email` → Email (same field as Workflow 1)
- [ ] Create/Update Contact also maps `member_first_name` → First Name
- [ ] Remove From Workflow targets "Lead Reminder Sequence" (exact name match)
- [ ] Remove Tag `pending-lead` exists
- [ ] If/Else branches on Action field (field name/values from real capture)
- [ ] Accept branch adds `lead-accepted` tag
- [ ] Decline branch adds `lead-declined` tag

---

*Last updated: Sep 21, 2026*
