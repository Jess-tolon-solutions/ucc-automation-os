# BD Contact Us Form Payload Schema (Real, Verified)

**Source:** Live capture from BD Contact Us form submission, Sep 23, 2026

**User-Agent:** `BD-Software`

**Content-Type:** `application/x-www-form-urlencoded`

**Form name:** `contact_form`

---

## Field Names (Verified)

| Field | BD Name | Description |
|-------|---------|-------------|
| Name | `yourname` | Submitter's name |
| Email | `inquiry_email` | Submitter's email |
| Phone | `phone` | Submitter's phone |
| Message | `comments` | Free-text message field |
| Inquirer Type (code) | `inquirer_type` | Short code (e.g., `existing_doctor`) |
| Inquirer Type (full) | `inquirer_type_values_stringify` | Full text (e.g., "I am an existing UpperCervicalCare.com Doctor/Member") |
| ZIP Code | `zip_code` | Submitter's ZIP |

---

## GHL Variable References

Use these in workflow actions:

```
{{inboundWebhookRequest.yourname}}
{{inboundWebhookRequest.inquiry_email}}
{{inboundWebhookRequest.phone}}
{{inboundWebhookRequest.comments}}
{{inboundWebhookRequest.inquirer_type_values_stringify}}
{{inboundWebhookRequest.zip_code}}
```

---

## Inquirer Type Values

| Code | Full Text |
|------|-----------|
| `existing_doctor` | "I am an existing UpperCervicalCare.com Doctor/Member" |
| (TBD) | "I am a Doctor interested in joining UpperCervicalCare.com" |
| (TBD) | "Potential Patient looking for a doctor" |

---

## System Fields (FYI)

| Field | Description |
|-------|-------------|
| `formname` | Always `contact_form` |
| `DATE` | Submission timestamp (YYYYMMDDHHMMSS) |
| `IP` | Submitter's IP address |
| `HTTPR` | Source URL |

---

## What NOT to Use

These field names were from synthetic tests and are WRONG:

| Wrong | Correct |
|-------|---------|
| `name` | `yourname` |
| `email` | `inquiry_email` |
| `message` | `comments` |

---

*Last updated: Sep 23, 2026*
