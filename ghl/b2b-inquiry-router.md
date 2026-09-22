# B2B Inquiry Router

GHL workflow that routes doctor-side inquiries from the General Contact form.
Receives payloads from BD via webhook; branches on `inquirer_type`; moves
contacts into the appropriate pipeline and posts to Slack.

**Workflows served:** 5 (Existing Member Support), 6 (Prospective Doctor)

**Owner:** Constansa (B2B/doctor-side inquiries)

---

## Trigger

**Type:** Inbound Webhook

**Webhook URL:** *(in workflow trigger settings — do not commit)*

**Source:** Brilliant Directories Developer Hub webhook, fired on General Contact
form submission where `inquirer_type` is NOT "Potential Patient looking for a
doctor" (patient inquiries route to the D2C lane separately).

**Payload fields used:**
- `inquirer_type` — classification from form dropdown
- `name` — submitter name
- `email` — submitter email
- `phone` — submitter phone (optional)
- `message` — free-text message field
- `zip_code` — optional, captured for patient routing but passed through here

---

## Branch: If/Else on inquirer_type

### Branch 1: Existing Member

**Condition:** `inquirer_type` contains `existing`

**Actions:**
1. **Create/Update Contact**
   - Map `name`, `email`, `phone` to contact fields

2. **Add Tag:** `b2b-member-support`

3. **Add to Pipeline:** B2B Member Support
   - Stage: New Request

4. **Send Acknowledgment Email**
   - Template: `member-support-ack` (see `copy/member-support-ack.md`)
   - Subject: "We received your request"

5. **Slack Webhook** (see action below)

---

### Branch 2: Prospective Doctor (Interested in Joining)

**Condition:** `inquirer_type` contains `interested in joining`

**Actions:**
1. **Create/Update Contact**
   - Map `name`, `email`, `phone` to contact fields

2. **Add Tag:** `b2b-prospective`

3. **Add to Pipeline:** Prospective Doctors
   - Stage: New Inquiry

4. **Send Acknowledgment Email**
   - Template: `prospective-doctor-ack` (see `copy/prospective-doctor-ack.md`)
   - Subject: "Welcome to UpperCervicalCare.com"

5. **Start Nurture Sequence**
   - Workflow: Prospective Doctor Nurture (day 1/4/10/21 touches per spec)

6. **Slack Webhook** (see action below)

---

### Else Branch (Patient Inquiry or Unclassified)

**Condition:** Neither "existing" nor "interested in joining" matched

This catches: patients who submitted via the contact form instead of a doctor
profile, malformed submissions, or new classification values.

**Actions:**
1. **Create/Update Contact**
   - Map `name`, `email`, `phone` to contact fields

2. **Add Tag:** `patient-inquiry`

3. **Slack Webhook** with alert flag (see action below)
   - Message includes: "PATIENT or UNCLASSIFIED — requires manual review"

4. **No pipeline assignment** — intentional; requires human triage

Note: Changed from `b2b-unclassified` to `patient-inquiry` since the most common
case hitting this branch is patients, not malformed B2B submissions.

---

## Slack Webhook Action

Fires on all three branches. Posts to `#b2b-inquiries` for Constansa.

**Webhook URL:** *(Slack incoming webhook — do not commit)*

**Payload format:**
```json
{
  "text": "[Branch Label] New B2B Inquiry",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Name:* {{contact.name}}\n*Email:* {{contact.email}}\n*Type:* {{inquirer_type}}\n*Message:* {{message}}"
      }
    }
  ]
}
```

For the Else branch, prefix with `:warning: UNCLASSIFIED` and add a note that
manual classification is required.

---

## Filter Gotcha

From CLAUDE.md audit notes: classification values all contain the word "Doctor".
Match on `existing` and `interested in joining` — never on "Doctor" alone, or
you'll match all three options.

---

## Testing Checklist

- [ ] Submit form as "existing UCC Doctor/Member" — confirm pipeline placement + Slack post
- [ ] Submit form as "Doctor interested in joining" — confirm pipeline + nurture sequence starts
- [ ] Submit form with unexpected value — confirm Else branch fires, no pipeline, Slack alert
- [ ] Confirm acknowledgment emails send for Branches 1 and 2
- [ ] Confirm Slack posts render correctly in #b2b-inquiries

---

## Related Files

- `bd/webhooks.md` — BD Developer Hub webhook configuration
- `copy/member-support-ack.md` — Branch 1 email template
- `copy/prospective-doctor-ack.md` — Branch 2 email template
- `docs/workflow-specification.md` — Workflows 5 and 6

---

*Last updated: Sep 20, 2026*
