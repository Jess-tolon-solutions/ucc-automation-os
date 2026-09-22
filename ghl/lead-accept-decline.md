# Lead Accept / Decline Handler

GHL workflow in the **B2C account** (Upper Cervical Care) that handles doctor responses
to leads. Receives a single BD webhook for both accept and decline events, stops the
active reminder sequence, and branches on the action taken.

**Workflow name in GHL:** Lead Accept Decline Handler

**Workflows served:** 2 (Level 2+), 3 (Annual/Unverified), 4 (cascade — future)

**Owner:** Billy (D2C/patient leads)

**Status:** DRAFT — skeleton built, pending end-to-end test

---

## Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — do not commit)*

**Source:** BD Developer Hub → Lead Accept / Decline event (single event, single URL)

**Payload fields (discovered via inbound webhook custom values):**
| Field | GHL Custom Value | Notes |
|-------|------------------|-------|
| `Lead Id` | `{{lead_id}}` | Matches the lead from submission; enables per-lead opportunities |
| `Doctor Id` | `{{doctor_id}}` | BD member ID |
| `Doctor Email` | `{{doctor_email}}` | For contact lookup |
| `Doctor First Name` | `{{doctor_first_name}}` | For contact record |
| `Action` | `{{action}}` | Value TBD — test with real decline to confirm exact string |
| `Action Timestamp` | `{{action_timestamp}}` | ISO timestamp |
| `Plan Id` | `{{plan_id}}` | Tier — enables branch logic if needed |

---

## Workflow Steps (As Built)

### 1. Create/Update Contact

**Action:** Create/Update Contact

**Field mapping:**
- Email ← `{{doctor_email}}`
- First Name ← `{{doctor_first_name}}`

Creates the contact if new, or finds existing by email. Must come first so
subsequent actions have a contact to operate on.

---

### 2. Remove From Workflow

**Action:** Remove From Workflow

**Target workflow:** Lead Reminder Sequence

**Why this is required:** Tag removal alone does NOT stop an active GHL workflow
enrollment. The contact will continue receiving scheduled actions unless explicitly
removed from the workflow. This must fire before tag removal.

---

### 3. Remove Tag

**Action:** Remove Tag

**Tag:** `pending-lead`

Belt-and-suspenders with step 2. Ensures the tag state is clean even if the
workflow removal had edge cases.

---

### 4. Branch: If/Else on Action field

#### Branch A: Accept

**Condition:** `Action` contains `accept`

**Actions:**

1. **Add Tag:** `lead-accepted`

2. *(TODO)* **Update Opportunity**
   - Find opportunity by name containing `{{lead_id}}`
   - Move to stage: **Accepted**

3. *(Optional future)* Send confirmation to doctor

---

#### Branch B: Decline

**Condition:** `Action` contains `decline`

**Actions:**

1. **Add Tag:** `lead-declined`

2. *(TODO)* **Update Opportunity**
   - Find opportunity by name containing `{{lead_id}}`
   - Move to stage: **Declined**

3. **[PLACEHOLDER] Workflow 4 Cascade Trigger**
   - If this lead was ZIP-matched (general inquiry, not direct profile)
   - AND doctor is Annual/Unverified (plan_id 3 or 31)
   - THEN trigger 50-mile fallback cascade to next doctor
   - *Not built yet — add action here when Workflow 4 is ready*

**Note:** Exact `Action` field values TBD — need to test with real BD decline via
Login as Member to see what BD actually sends (might be "accept"/"decline",
"Accepted"/"Declined", or something else).

---

## Testing Checklist

- [ ] Trigger webhook with `action` = `accept`
  - [ ] Contact found by email
  - [ ] Removed from Lead Reminder Sequence workflow
  - [ ] `pending-lead` tag removed
  - [ ] `lead-accepted` tag added
  - [ ] Opportunity moved to Accepted stage
  - [ ] No further reminder emails fire
- [ ] Trigger webhook with `action` = `decline`
  - [ ] Contact found by email
  - [ ] Removed from Lead Reminder Sequence workflow
  - [ ] `pending-lead` tag removed
  - [ ] `lead-declined` tag added
  - [ ] Opportunity moved to Declined stage
  - [ ] No further reminder emails fire
- [ ] Test with compressed timers: submit lead, wait for 24hr reminder, then accept — confirm sequence stops

---

## BD Webhook Configuration

1. Log into BD Admin → Developer Hub → Webhooks
2. Find or create "Lead Accept / Decline" webhook
3. Set destination URL to this workflow's inbound webhook URL
4. Confirm payload includes `action` field with `accept` or `decline` value
5. Test with BD's webhook test tool

---

## Related Files

- `ghl/d2c-lead-reminders.md` — Lead Reminder Sequence (Workflow 1) that this stops
- `bd/webhooks.md` — BD webhook configuration
- `docs/workflow-specification.md` — Workflows 2, 3, 4

---

*Last updated: Sep 20, 2026*
