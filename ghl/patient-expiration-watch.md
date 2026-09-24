# Patient Expiration Watch

GHL workflow in the **B2C account** (Upper Cervical Care) that monitors leads for
72 hours and sends patient expiration notices if the doctor doesn't respond.

**Workflow name in GHL:** Patient Expiration Watch

**Status:** PUBLISHED, LIVE

**Owner:** Billy (D2C/patient leads)

---

## Architecture

This workflow is NOT triggered by BD directly. BD allows only one webhook per form,
and those slots are used by Lead Reminder Sequence.

**Trigger chain:**
```
BD Lead Submitted → Lead Reminder Sequence → Custom Webhook relay → Patient Expiration Watch
```

The relay fires from Lead Reminder Sequence's tier-annual YES branch, after Add Tag
`pending-lead`, before the 24hr wait.

---

## Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — reference as "Patient Expiration Watch trigger")*

**Source:** GHL Custom Webhook action in Lead Reminder Sequence (NOT BD directly)

**Relay payload (JSON):**
```json
{
  "lead_id": "{{inboundWebhookRequest.lead_id}}",
  "lead_name": "{{inboundWebhookRequest.lead_name}}",
  "lead_email": "{{inboundWebhookRequest.lead_email}}",
  "lead_phone": "{{inboundWebhookRequest.lead_phone}}",
  "lead_location": "{{inboundWebhookRequest.lead_location}}",
  "member_email": "{{inboundWebhookRequest.member_email}}"
}
```

**Known issue:** `lead_phone` renders as literal `"null"` when patient omits phone.
Cosmetic; polish later.

---

## Workflow Steps

### 1. Create/Update Contact (Patient)

**Action:** Create/Update Contact

**Field mapping:**
- First Name ← `{{inboundWebhookRequest.lead_name}}`
- Email ← `{{inboundWebhookRequest.lead_email}}`
- Phone ← `{{inboundWebhookRequest.lead_phone}}`

This creates the PATIENT as a contact (separate from the doctor contact).

---

### 2. Add Tag

**Action:** Add Tag

**Tag:** `patient-inquiry`

Identifies this contact as a patient who submitted an inquiry.

---

### 3. Create Opportunity

**Action:** Create Opportunity

**Pipeline:** Patient Leads

**Stage:** Awaiting Response

**Opportunity name:** `Lead {{inboundWebhookRequest.lead_id}} - {{inboundWebhookRequest.lead_name}}`

**Custom fields (in "Lead Automation" folder):**
- `lead_id` ← `{{inboundWebhookRequest.lead_id}}`
- `patient_email` ← `{{inboundWebhookRequest.lead_email}}`
- `patient_phone` ← `{{inboundWebhookRequest.lead_phone}}`
- `patient_location` ← `{{inboundWebhookRequest.lead_location}}`
- `doctor_email` ← `{{inboundWebhookRequest.member_email}}`

**Setting:** Duplicate opportunities DISABLED (test with fresh patient emails each run)

---

### 4. Wait 72 Hours

**Action:** Wait

**Duration:** 72 hours

---

### 5. If/Else: Check Pipeline Stage

**Condition:** Opportunity pipeline stage = "Awaiting Response"

---

### 6a. YES Branch (Doctor didn't respond)

**Actions:**

1. **Send Email** — Patient expiration notice
   - To: `{{contact.email}}`
   - Template: Find a Doctor variant (Billy-approved copy)
   - Routes patient to Find-a-Doctor feature

2. **Add Tag:** `patient-expired-notified`

3. **[TODO]** Update Opportunity stage → "Expired - No Response"

4. **END**

---

### 6b. NO Branch (Doctor responded)

**Action:** END

The Accept/Decline flow already handled this lead. Patient Watch Stop workflow
updated the opportunity stage to Accepted or Declined.

---

## Related Workflows

- **Lead Reminder Sequence** — sends the relay that triggers this workflow
- **Patient Watch Stop** — stops this workflow when doctor accepts/declines
- **Lead Accept Decline Handler** — sends relay to Patient Watch Stop

---

## Testing Notes

- Use fresh patient email addresses each test (duplicate opportunities disabled)
- `lead_phone` will show "null" if patient didn't provide phone
- Known good payload: lead_id 9610

---

*Last updated: Sep 24, 2026*
