# Patient Watch Stop

GHL workflow in the **B2C account** (Upper Cervical Care) that stops the Patient
Expiration Watch when a doctor accepts or declines a lead.

**Workflow name in GHL:** Patient Watch Stop

**Status:** DRAFT — shell only, trigger captured, pending field name fix

**Owner:** Billy (D2C/patient leads)

---

## Purpose

When a doctor accepts/declines a lead, this workflow:
1. Finds the PATIENT contact (not the doctor)
2. Removes them from Patient Expiration Watch (prevents 72hr expiration notice)
3. Updates the Opportunity stage to Accepted or Declined

---

## Architecture

**Trigger chain:**
```
BD Lead Accept/Decline → Lead Accept Decline Handler → Custom Webhook relay → Patient Watch Stop
```

GHL's "Remove From Workflow" only acts on the enrolled contact. Since the Accept/Decline
handler enrolls the DOCTOR, it cannot remove the PATIENT from Patient Expiration Watch.
This relay workflow solves that by enrolling the patient and then removing them.

---

## Trigger

**Type:** Inbound Webhook ("Accept / Decline Relay")

**Webhook URL:** *(in workflow trigger settings — reference as "Patient Watch Stop trigger")*

**Source:** GHL Custom Webhook action in Lead Accept Decline Handler

**Intended relay payload (JSON):**
```json
{
  "lead_id": "...",
  "lead_email": "...",
  "lead_action": "..."
}
```

---

## KNOWN ISSUE — Field Names

**Problem:** The relay currently sends `lead_id` and `lead_email`, but in testing these
render as `"null"`. The Accept/Decline payload from BD uses different key names.

**Fix required:** Pull the handler's real captured accept/decline payload from execution
logs, find actual key names for lead ID and patient email, update relay body.

From `bd-accept-decline-schema.md`, the correct fields are:
- Lead ID: `lead.lead_id` → `{{inboundWebhookRequest.lead.lead_id}}`
- Patient email: `lead.lead_email` → `{{inboundWebhookRequest.lead.lead_email}}`
- Action: `lead_action` → `{{inboundWebhookRequest.lead_action}}` (this one works)

---

## Planned Workflow Steps

### 1. Create/Update Contact (Patient)

**Action:** Create/Update Contact

**Field mapping:**
- Email ← `{{inboundWebhookRequest.lead_email}}`

Finds the existing patient contact by email.

---

### 2. Remove From Workflow

**Action:** Remove From Workflow

**Target:** Patient Expiration Watch

Stops the 72hr countdown for this patient.

---

### 3. If/Else on lead_action

**Condition:** `{{inboundWebhookRequest.lead_action}}` contains "accept"

---

### 4a. Accept Branch

**Actions:**
1. Update Opportunity stage → "Accepted"
2. *(Optional)* Add tag `patient-doctor-accepted`
3. END

---

### 4b. Decline Branch

**Actions:**
1. Update Opportunity stage → "Declined"
2. *(Optional)* Add tag `patient-doctor-declined`
3. *(Future)* Trigger cascade to next doctor
4. END

---

## TODO (Tomorrow)

- [ ] Fix relay body in Lead Accept Decline Handler:
  - `lead_id` → `{{inboundWebhookRequest.lead.lead_id}}`
  - `lead_email` → `{{inboundWebhookRequest.lead.lead_email}}`
- [ ] Test relay with fixed field names
- [ ] Complete workflow steps
- [ ] Publish

---

## Related Workflows

- **Lead Accept Decline Handler** — sends the relay that triggers this workflow
- **Patient Expiration Watch** — this workflow stops that one

---

*Last updated: Sep 24, 2026*
