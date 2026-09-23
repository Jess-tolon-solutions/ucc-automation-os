# Lead Accept / Decline Handler

GHL workflow in the **B2C account** (Upper Cervical Care) that handles doctor responses
to leads. Receives a single BD webhook for both accept and decline events, stops the
active reminder sequence, and branches on the action taken.

**Workflow name in GHL:** Lead Accept Decline Handler

**Workflows served:** 2 (Level 2+), 3 (Annual/Unverified), 4 (cascade — future)

**Owner:** Billy (D2C/patient leads)

**Status:** DRAFT — real payload captured, field names verified, ready to update GHL

---

## Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — do not commit)*

**Source:** BD Developer Hub → Lead Accept / Decline event (single event, single URL)

**Payload fields (REAL, verified Sep 23 2026 via ZZTEST decline):**

| What | BD Field | GHL Variable |
|------|----------|--------------|
| Action | `lead_action` | `{{inboundWebhookRequest.lead_action}}` |
| Doctor email | `user.email` | `{{inboundWebhookRequest.user.email}}` |
| Doctor first name | `user.first_name` | `{{inboundWebhookRequest.user.first_name}}` |
| Doctor last name | `user.last_name` | `{{inboundWebhookRequest.user.last_name}}` |
| Lead ID | `lead.lead_id` | `{{inboundWebhookRequest.lead.lead_id}}` |
| Plan ID | `user.subscription_id` | `{{inboundWebhookRequest.user.subscription_id}}` |
| Patient name | `lead.lead_name` | `{{inboundWebhookRequest.lead.lead_name}}` |
| Patient email | `lead.lead_email` | `{{inboundWebhookRequest.lead.lead_email}}` |

See `bd-accept-decline-schema.md` for full payload documentation.

---

## Workflow Steps (As Built)

### 1. Create/Update Contact

**Action:** Create/Update Contact

**Field mapping:**
- Email ← `{{inboundWebhookRequest.user.email}}`
- First Name ← `{{inboundWebhookRequest.user.first_name}}`
- Last Name ← `{{inboundWebhookRequest.user.last_name}}`

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

### 4. Branch: If/Else on lead_action field

#### Branch A: Accept

**Condition:** `{{inboundWebhookRequest.lead_action}}` contains `accept`

**Actions:**

1. **Add Tag:** `lead-accepted`

2. *(TODO)* **Update Opportunity**
   - Find opportunity by name containing `{{lead_id}}`
   - Move to stage: **Accepted**

3. *(Optional future)* Send confirmation to doctor

---

#### Branch B: Decline

**Condition:** `{{inboundWebhookRequest.lead_action}}` contains `decline`

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

**Note:** Confirmed `lead_action` values are `"accept"` and `"decline"` (lowercase).

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

*Last updated: Sep 23, 2026*
