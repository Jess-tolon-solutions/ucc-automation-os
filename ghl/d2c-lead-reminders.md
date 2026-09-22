# D2C Lead Reminder Sequence

GHL workflow in the **B2C account** (Upper Cervical Care) that manages the 24/48/72hr
reminder cadence for Annual/Unverified doctors who haven't responded to a patient lead.

**Workflow name in GHL:** Lead Reminder Sequence

**Workflows served:** 2 (Level 2+ handling), 3 (Annual/Unverified $50 flow), 8 (tracking)

**Owner:** Billy (D2C/patient leads)

**Status:** DRAFT — rebuilt in correct B2C account (Directory copy deleted), pending
Billy's copy approval and end-to-end test with Accept/Decline handler

---

## Architecture Overview

Two GHL workflows in B2C account:

1. **Lead Submitted Workflow** (this doc) — receives new leads, creates opportunity,
   branches by tier, starts reminders for Annual/Unverified
2. **Lead Accept/Decline Workflow** (`lead-accept-decline.md`) — receives doctor
   response, stops reminders, updates opportunity stage

**Data model:** Contacts are doctors (one per doctor, receives reminders). Opportunities
are leads (one per inquiry, tracks lifecycle). See decision log entry 2026-09-20.

---

## Lead Submitted Workflow

### Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — do not commit)*

**Source:** BD Developer Hub → Lead Submitted (`bootstrap_get_match`) event

**BD Configuration Required:**
- In BD Admin → Developer Hub → Webhooks
- Event: Lead Submitted
- Currently pointing at Directory account — **repoint to this B2C webhook URL**

**Payload fields (from BD):**
| Field | Source | Notes |
|-------|--------|-------|
| `lead_id` | BD system | Unique inquiry ID |
| `doctor_id` | BD system | Matched doctor's BD member ID |
| `doctor_email` | BD system | Doctor's email for GHL contact lookup |
| `doctor_first_name` | BD system | For email personalization |
| `plan_id` | BD system | Membership tier — determines branch |
| `patient_name` | Form field | |
| `patient_email` | Form field | |
| `patient_phone` | Form field | Optional |
| `patient_message` | Form field | |
| `patient_zip` | Form field | Required for Annual/Unverified |
| `submitted_at` | System | ISO timestamp |

---

### Branch: If/Else on plan_id

### Step 1: Create Opportunity (All Branches)

**Action:** Create Opportunity

**Pipeline:** Patient Leads

**Opportunity name:** `Lead {{lead_id}} - {{patient_name}}`

**Fields:**
- `lead_id`: `{{lead_id}}`
- `doctor_id`: `{{doctor_id}}`
- `patient_name`: `{{patient_name}}`
- `patient_email`: `{{patient_email}}`
- `patient_phone`: `{{patient_phone}}`
- `patient_zip`: `{{patient_zip}}`
- `submitted_at`: `{{submitted_at}}`
- `plan_id`: `{{plan_id}}`

This is the per-inquiry record per Workflow 8. One opportunity per lead, tracks
through Awaiting Decision → Accepted/Declined/Expired.

---

### Step 2: Branch on plan_id

#### Branch 1: Level 2+ (Full Access)

**Condition:** `plan_id` in `2, 18, 19, 23, 26, 27, 29, 33`

**Actions:**
1. **Create/Update Contact** (doctor as contact)
   - Lookup by `doctor_email`
   - Tag: `level2-lead-received`
   - Custom field `last_lead_date`: `{{submitted_at}}`

2. **Update Opportunity Stage:** Delivered

3. **No reminder sequence** — Level 2+ leads don't expire

4. *(Optional future)* **Send hygiene nudge** at day 5 asking "did you follow up?"

---

#### Branch 2: Annual/Unverified ($50 Flow)

**Condition:** `plan_id` in `3, 31`

**Actions:**
1. **Create/Update Contact** (doctor as contact)
   - Lookup by `doctor_email`
   - Tag: `pending-lead` ← THIS IS THE STOP CONDITION TAG
   - Tag: `annual-unverified`
   - Custom field `pending_lead_id`: `{{lead_id}}`
   - Custom field `pending_lead_submitted`: `{{submitted_at}}`

2. **Update Opportunity Stage:** Awaiting Decision

3. **Start Reminder Sequence** (see Reminder Sequence section below)

---

#### Else Branch

**Condition:** `plan_id` not in either list

**Actions:**
1. **Create/Update Contact**
   - Tag: `lead-unknown-tier`

2. **Update Opportunity Stage:** Exception

3. *(Future)* Post to exception Slack channel

---

## Reminder Sequence (Annual/Unverified Branch Only)

Executes as a wait-based sequence within the workflow. The `pending-lead` tag is the
stop condition — if removed (by Lead Accept or Lead Decline workflows), the contact
exits the sequence.

### Sequence Steps

```
[Contact enters with pending-lead tag]
        │
        ▼
    Wait 24 hours
        │
        ▼
    If: Contact has tag "pending-lead"
        │
        ├─ Yes → Send 24hr Reminder (email + SMS)
        │           │
        │           ▼
        │       Wait 24 hours
        │           │
        │           ▼
        │       If: Contact has tag "pending-lead"
        │           │
        │           ├─ Yes → Send 48hr Reminder (email + SMS)
        │           │           │
        │           │           ▼
        │           │       Wait 24 hours
        │           │           │
        │           │           ▼
        │           │       If: Contact has tag "pending-lead"
        │           │           │
        │           │           ├─ Yes → Send 72hr Expiration Notice
        │           │           │           │
        │           │           │           ▼
        │           │           │       Remove tag "pending-lead"
        │           │           │       Add tag "lead-expired"
        │           │           │       Move pipeline to "Expired"
        │           │           │       [Trigger patient expiration flow - future]
        │           │           │
        │           │           └─ No → Exit (already responded)
        │           │
        │           └─ No → Exit (already responded)
        │
        └─ No → Exit (already responded)
```

### Email Templates

**24hr Reminder:** `doctor-reminder-24hr`
- Subject: A patient is waiting to hear from you
- Copy: See `copy/doctor-reminder-24hr.md`

**48hr Reminder:** `doctor-reminder-48hr`
- Subject: Patient inquiry expires soon
- Copy: See `copy/doctor-reminder-48hr.md`

**72hr Expiration:** `doctor-reminder-72hr`
- Subject: Patient inquiry expired
- Copy: See `copy/doctor-reminder-72hr.md`

### SMS Templates

**24hr:** `UpperCervicalCare.com: You have a patient inquiry from yesterday still waiting for a response. Log in to view and respond: {{dashboard_link}}`

**48hr:** `UpperCervicalCare.com: Your patient inquiry expires in 24 hours. Log in to respond before it closes: {{dashboard_link}}`

**72hr:** `UpperCervicalCare.com: Your patient inquiry has expired due to no response. Contact us if you have questions about your lead settings.`

### Variable: dashboard_link

Static URL to UCC doctor dashboard login. BD does not expose per-lead deep links in
webhook payload.

**Value:** `https://uppercervicalcare.com/members/` *(confirm exact URL)*

---

## Pipeline: Patient Leads

**Stages:**
1. Awaiting Decision (Annual/Unverified pending response)
2. Delivered (Level 2+ immediate delivery)
3. Accepted
4. Declined
5. Expired
6. Exception

Opportunities (leads) move through these stages. The Accept/Decline workflow
(`lead-accept-decline.md`) handles stage transitions on doctor response.

---

## Testing Checklist (Reminder Sequence Only)

- [ ] Submit test lead to Level 2+ doctor profile:
  - [ ] Opportunity created in Patient Leads pipeline
  - [ ] Opportunity stage = Delivered
  - [ ] No reminder sequence starts
- [ ] Submit test lead to Annual/Unverified doctor profile:
  - [ ] Opportunity created in Patient Leads pipeline
  - [ ] Opportunity stage = Awaiting Decision
  - [ ] Contact created with `pending-lead` tag
  - [ ] 24hr reminder fires after wait
  - [ ] 48hr reminder fires after wait
  - [ ] 72hr expiration fires after wait
  - [ ] Tags update correctly at expiration
  - [ ] Opportunity moves to Expired stage
- [ ] Test unknown plan_id:
  - [ ] Opportunity stage = Exception
  - [ ] Contact tagged `lead-unknown-tier`

See `lead-accept-decline.md` for Accept/Decline workflow testing.

---

## BD Webhook Configuration

1. Log into BD Admin → Developer Hub → Webhooks
2. Find existing "Lead Submitted" webhook (currently pointing at Directory)
3. Update destination URL to this B2C workflow's inbound webhook URL
4. Test with BD's webhook test tool before going live

---

## Related Files

- `ghl/lead-accept-decline.md` — Accept/Decline workflow (stops reminders)
- `copy/doctor-reminder-24hr.md` — 24hr reminder copy
- `copy/doctor-reminder-48hr.md` — 48hr reminder copy
- `copy/doctor-reminder-72hr.md` — 72hr expiration copy
- `bd/webhooks.md` — BD webhook configuration reference
- `docs/workflow-specification.md` — Workflows 2, 3, 8

---

*Last updated: Sep 20, 2026*
