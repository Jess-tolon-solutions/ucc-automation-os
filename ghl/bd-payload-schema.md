# BD Webhook Payload Schema (Real, Verified)

**Source:** Live capture from BD Lead Submitted webhook via ZZTEST doctor, Sep 22, 2026

**User-Agent:** `BD-Software`

**Content-Type:** `application/x-www-form-urlencoded` (NOT JSON)

---

## Lead Submitted (`bootstrap_get_match` / `copy_of_bootstrap_get_match`)

**IMPORTANT:** BD has TWO form templates for lead submissions. Both must have webhooks
configured to the same GHL URL:
- `bootstrap_get_match` — original template (built-in webhook)
- `copy_of_bootstrap_get_match` — v2 template (custom webhook required)

Field names are exact — map these in GHL, not guesses.

### Doctor Fields (the member receiving the lead)
| Field | Description |
|-------|-------------|
| `member_email` | Doctor's email address |
| `member_first_name` | Doctor's first name |
| `member_last_name` | Doctor's last name |
| `member_phone_number` | Doctor's phone |

### Patient Fields (the lead)
| Field | Description |
|-------|-------------|
| `lead_name` | Patient's name |
| `lead_email` | Patient's email |
| `lead_phone` | Patient's phone |
| `lead_message` | Patient's inquiry message |
| `lead_location` | Patient's location/ZIP |

### System Fields
| Field | Description |
|-------|-------------|
| `lead_id` | BD's unique lead identifier |
| `lead_match_id` | Match record ID |
| `formname` | Always `bootstrap_get_match` for lead submissions |
| `checkPageType` | Form type indicator |
| `url_from` | Source URL |

---

## Lead Accept / Decline

**Status:** VERIFIED — captured from real decline event (lead 9630), Sep 25, 2026

**IMPORTANT:** This payload is NESTED, unlike the flat Lead Submitted payload.

### Top-Level Fields
| Field | Description |
|-------|-------------|
| `lead_action` | `"accept"` or `"decline"` |
| `is_webhook_post` | Always `"1"` |
| `lead_stringify` | JSON string of the `lead{}` object (parse if needed) |
| `user_stringify` | JSON string of the `user{}` object (parse if needed) |
| `headers` | Request headers object |

### lead{} Object (nested)
| Field | Description |
|-------|-------------|
| `lead.lead_id` | BD's unique lead identifier |
| `lead.lead_name` | Patient's name |
| `lead.lead_email` | Patient's email |
| `lead.lead_phone_copy` | Patient's phone (**NOTE:** NOT `lead_phone`) |
| `lead.lead_location` | Patient's location/ZIP |
| `lead.lead_message` | Patient's inquiry message (**SENSITIVE** — may contain health info) |
| `lead.match_id` | Match record ID |
| `lead.lead_price` | Lead cost (`"50.00"` for Annual/Unverified, `"0.00"` for Level 2+) |
| `lead.formname` | Form template name |
| `lead.url_from` | Source URL |
| `lead.lat` / `lead.lng` | Patient geolocation |
| `lead.bbox` | Bounding box for geo |

### user{} Object (nested — the doctor)
| Field | Description |
|-------|-------------|
| `user.user_id` | Doctor's BD user ID |
| `user.first_name` | Doctor's first name |
| `user.last_name` | Doctor's last name |
| `user.email` | Doctor's email |
| `user.company` | Practice name |
| `user.phone_number` | Doctor's phone |
| `user.subscription_id` | Plan ID (e.g., `"26"` for Level 2+, `"3"` for Unverified) |
| `user.subscription_name` | Plan name |
| `user.member_login_link` | **SENSITIVE — NEVER LOG OR COMMIT** (contains auth token) |
| *(additional profile fields)* | Full member profile data |

### GHL Merge Tags for Nested Fields
```
{{inboundWebhookRequest.lead_action}}
{{inboundWebhookRequest.lead.lead_id}}
{{inboundWebhookRequest.lead.lead_email}}
{{inboundWebhookRequest.user.email}}
{{inboundWebhookRequest.user.first_name}}
```

### Tier Coverage Note
Accept/Decline fires for ALL tiers including Level 2+ (observed: subscription_id 26,
lead_price 0.00). When the relay reaches Patient Watch Stop, Level 2+ events are a
harmless no-op — those patients were never enrolled in Patient Expiration Watch.

---

## What's NOT in Lead Submitted Payload

| Field | Status |
|-------|--------|
| `plan_id` / tier | **NOT INCLUDED** — must use contact tag (`tier-annual`) instead |
| `doctor_email` | Wrong name — use `member_email` |
| `doctor_first_name` | Wrong name — use `member_first_name` |

---

## BD Support Ticket

**Request:** Add `plan_id` or membership tier field to Lead Submitted webhook payload.

**Rationale:** Enables workflow branching by tier without requiring pre-tagged contacts. Currently must maintain a synced tag list from BD member exports.

**Status:** Pending — add to BD support ticket queue.

---

*Last updated: Sep 25, 2026*
