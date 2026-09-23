# D2C Lead Reminder Sequence

GHL workflow in the **B2C account** (Upper Cervical Care) that manages the 24/48/72hr
reminder cadence for Annual/Unverified doctors who haven't responded to a patient lead.

**Workflow name in GHL:** Lead Reminder Sequence

**Workflows served:** 2 (Level 2+ handling), 3 (Annual/Unverified $50 flow), 8 (tracking)

**Owner:** Billy (D2C/patient leads)

**Status:** DRAFT — testing tier-annual tag check

---

## CRITICAL: Real BD Field Names

**Source:** Live capture from BD webhook via ZZTEST doctor, Sep 22, 2026

BD's Lead Submitted (`bootstrap_get_match`) payload uses these EXACT field names:

| BD Field | Maps to GHL Field | Notes |
|----------|-------------------|-------|
| `member_email` | Email | Doctor's email — used for contact lookup |
| `member_first_name` | First Name | Doctor's first name |
| `member_last_name` | Last Name | Doctor's last name |
| `member_phone_number` | Phone | Doctor's phone |
| `lead_name` | (Opportunity) | Patient's name |
| `lead_email` | (Opportunity) | Patient's email |
| `lead_phone` | (Opportunity) | Patient's phone |
| `lead_message` | (Opportunity) | Patient's message |
| `lead_location` | (Opportunity) | Patient's ZIP/location |
| `lead_id` | (Opportunity) | BD's unique lead ID |
| `lead_match_id` | (Opportunity) | Match record ID |

**IMPORTANT:** There is NO `plan_id` in the BD payload. Tier branching MUST use
the `tier-annual` contact tag, pre-applied via member export sync.

---

## Architecture Overview

Two GHL workflows in B2C account:

1. **Lead Reminder Sequence** (this doc) — receives new leads, checks tier tag,
   starts reminders for Annual/Unverified
2. **Lead Accept/Decline Handler** (`lead-accept-decline.md`) — receives doctor
   response, stops reminders, updates tags

**Data model:** Contacts are doctors (one per doctor, receives reminders).
Tags on Contact control workflow enrollment. See decision log entry 2026-09-20.

---

## Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — do not commit)*

**Source:** BD Developer Hub → Lead Submitted (`bootstrap_get_match`) event

**Content-Type from BD:** `application/x-www-form-urlencoded` (NOT JSON)

**User-Agent:** `BD-Software`

---

## Workflow Actions (in order)

### Step 1: Create/Update Contact

**Action:** Create/Update Contact

**Purpose:** Find or create the doctor as a GHL contact

**Field mappings:**
- Email ← `{{Inbound Webhook Trigger.member_email}}`
- First Name ← `{{Inbound Webhook Trigger.member_first_name}}`

**Critical:** The email field is the lookup key. If the email from BD doesn't
EXACTLY match an existing contact's email (including case), GHL creates a new
contact without the `tier-annual` tag.

---

### Step 2: If/Else — Check tier tag

**Action:** If/Else

**Condition:** Contact has tag `tier-annual`

This checks whether the contact (found/created in Step 1) has the pre-applied
`tier-annual` tag. This tag was bulk-applied to all Annual/Unverified members
via API on Sep 22, 2026.

**Branch YES (Annual/Unverified doctors):** Continue to Step 3

**Branch NO (Level 2+ doctors or new contacts):** END — no reminders for Level 2+

---

### Step 3: Add Tag `pending-lead`

**Action:** Add Tag

**Tag:** `pending-lead`

This tag is the stop condition for the reminder sequence. When the Accept/Decline
Handler receives a doctor response, it removes this tag, which stops the reminders.

---

### Step 4: Wait 24 hours

**Action:** Wait

**Duration:** 24 hours

---

### Step 5: Send 24hr Reminder

**Action:** Send Email + SMS

**Email template:** `doctor-reminder-24hr`
- Subject: A patient is waiting to hear from you
- Copy: See `copy/doctor-reminder-24hr.md`

**SMS template:** `UpperCervicalCare.com: You have a patient inquiry from yesterday
still waiting for a response. Log in to view and respond: [dashboard_link]`

---

### Step 6: Wait 24 hours

**Action:** Wait

**Duration:** 24 hours

---

### Step 7: Send 48hr Reminder

**Action:** Send Email + SMS

**Email template:** `doctor-reminder-48hr`
- Subject: Patient inquiry expires soon
- Copy: See `copy/doctor-reminder-48hr.md`

**SMS template:** `UpperCervicalCare.com: Your patient inquiry expires in 24 hours.
Log in to respond before it closes: [dashboard_link]`

---

### Step 8: Wait 24 hours

**Action:** Wait

**Duration:** 24 hours

---

### Step 9: Send 72hr Expiration Notice

**Action:** Send Email + SMS

**Email template:** `doctor-reminder-72hr`
- Subject: Patient inquiry expired
- Copy: See `copy/doctor-reminder-72hr.md`

**SMS template:** `UpperCervicalCare.com: Your patient inquiry has expired due to
no response. Contact us if you have questions about your lead settings.`

---

### Step 10: Remove Tag `pending-lead`

**Action:** Remove Tag

**Tag:** `pending-lead`

---

### Step 11: Add Tag `lead-expired`

**Action:** Add Tag

**Tag:** `lead-expired`

---

### Step 12: END

---

## Debugging the tier-annual Check

If the tier-annual condition evaluates to NO (Add Tag skipped), check:

### 1. Email Mismatch

The most likely cause. Create/Update Contact creates a NEW contact if:
- The email from BD has different casing (emails are case-sensitive in lookup)
- The email from BD has leading/trailing whitespace
- The email from BD is a different address than the tagged contact

**To verify:** Check the workflow execution log → look at the Create/Update Contact
step → see what email value was received and whether it matched an existing contact.

### 2. ZZTEST Doctor Configuration

Confirm in BD Admin → Members:
- The ZZTEST doctor's email is EXACTLY `jessica@tolonsolutions.ai` (no typos)
- This matches the GHL contact that has the `tier-annual` tag

### 3. Workflow Execution Log

In GHL → Automation → Workflows → Lead Reminder Sequence:
1. Click on a recent execution
2. Expand "Create/Update Contact" — see what contact was found/created
3. Expand "If/Else" — see what condition was evaluated and why it failed

### 4. Contact Record Check

Go to GHL Contacts → search for `jessica@tolonsolutions.ai`:
- Verify the contact exists
- Verify it has the `tier-annual` tag (exact spelling)
- Check if there are duplicate contacts with similar emails

---

## Variable: dashboard_link

Static URL to UCC doctor dashboard login. BD does not expose per-lead deep links.

**Value:** `https://uppercervicalcare.com/members/`

---

## Related Files

- `ghl/canonical-workflows.md` — Canonical workflow design reference
- `ghl/bd-payload-schema.md` — Real BD payload field names
- `ghl/lead-accept-decline.md` — Accept/Decline workflow (stops reminders)
- `copy/doctor-reminder-24hr.md` — 24hr reminder copy
- `copy/doctor-reminder-48hr.md` — 48hr reminder copy
- `copy/doctor-reminder-72hr.md` — 72hr expiration copy
- `docs/decision-log.md` — Sep 22 incident note and corrections

---

*Last updated: Sep 22, 2026*
