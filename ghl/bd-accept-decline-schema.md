# BD Lead Accept/Decline Payload Schema (Real, Verified)

**Source:** Live capture from BD Lead Decline event via ZZTEST doctor, Sep 23, 2026

**User-Agent:** `BD-Software`

**Content-Type:** `application/x-www-form-urlencoded`

---

## Top-Level Fields

| Field | Value/Type | Description |
|-------|------------|-------------|
| `lead_action` | `"accept"` or `"decline"` | The action taken by the doctor |
| `is_webhook_post` | `"1"` | Webhook indicator |

---

## Lead Object (`lead.*`)

| Field | GHL Variable | Description |
|-------|--------------|-------------|
| `lead.lead_id` | `{{inboundWebhookRequest.lead.lead_id}}` | Unique lead identifier |
| `lead.lead_name` | `{{inboundWebhookRequest.lead.lead_name}}` | Patient name |
| `lead.lead_email` | `{{inboundWebhookRequest.lead.lead_email}}` | Patient email |
| `lead.lead_phone_copy` | `{{inboundWebhookRequest.lead.lead_phone_copy}}` | Patient phone |
| `lead.lead_message` | `{{inboundWebhookRequest.lead.lead_message}}` | Patient inquiry message |
| `lead.lead_location` | `{{inboundWebhookRequest.lead.lead_location}}` | Patient location (city, state) |
| `lead.date_added` | `{{inboundWebhookRequest.lead.date_added}}` | Lead submission timestamp |
| `lead.status` | `{{inboundWebhookRequest.lead.status}}` | Lead status code |
| `lead.formname` | `{{inboundWebhookRequest.lead.formname}}` | Form used (`bootstrap_get_match` or `copy_of_bootstrap_get_match`) |
| `lead.url_from` | `{{inboundWebhookRequest.lead.url_from}}` | Source profile URL path |

---

## User Object (`user.*`) — The Doctor

| Field | GHL Variable | Description |
|-------|--------------|-------------|
| `user.user_id` | `{{inboundWebhookRequest.user.user_id}}` | BD member ID |
| `user.email` | `{{inboundWebhookRequest.user.email}}` | Doctor's email (for contact lookup) |
| `user.first_name` | `{{inboundWebhookRequest.user.first_name}}` | Doctor's first name |
| `user.last_name` | `{{inboundWebhookRequest.user.last_name}}` | Doctor's last name |
| `user.full_name` | `{{inboundWebhookRequest.user.full_name}}` | Doctor's full name |
| `user.subscription_id` | `{{inboundWebhookRequest.user.subscription_id}}` | Plan ID (31 = Annual) |
| `user.subscription_name` | `{{inboundWebhookRequest.user.subscription_name}}` | Plan name ("Level 1 Annual") |
| `user.company` | `{{inboundWebhookRequest.user.company}}` | Practice name |
| `user.city` | `{{inboundWebhookRequest.user.city}}` | Doctor's city |

---

## GHL Workflow Mappings

### Create/Update Contact (Doctor)
```
Email ← {{inboundWebhookRequest.user.email}}
First Name ← {{inboundWebhookRequest.user.first_name}}
Last Name ← {{inboundWebhookRequest.user.last_name}}
```

### If/Else Branch on Action
```
Condition: {{inboundWebhookRequest.lead_action}} contains "decline"
  → Add tag: lead-declined

Condition: {{inboundWebhookRequest.lead_action}} contains "accept"
  → Add tag: lead-accepted
```

---

## What NOT to Use

These field names were from synthetic tests and are WRONG:

| Wrong | Correct |
|-------|---------|
| `action` | `lead_action` |
| `doctor_email` | `user.email` |
| `doctor_first_name` | `user.first_name` |
| `lead_id` (top level) | `lead.lead_id` |
| `plan_id` | `user.subscription_id` |

---

## Plan IDs Reference

| subscription_id | subscription_name | Type |
|-----------------|-------------------|------|
| 31 | Level 1 Annual | Annual/Unverified ($50 flow) |
| 3 | (TBD) | Annual/Unverified |
| 2, 18, 19, 23, 26, 27, 29, 33 | Level 2+ | Full access |

---

*Last updated: Sep 23, 2026*
