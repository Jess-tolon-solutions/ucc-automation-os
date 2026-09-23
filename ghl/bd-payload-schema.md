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

**Status:** Schema NOT YET CAPTURED — need to decline a real lead via Login as Member and inspect the payload.

**Expected fields (unverified):**
- `lead_id` — should match submission
- `member_email` — doctor who acted
- Action indicator field — name and values TBD

---

## What's NOT in the Payload

| Field | Status |
|-------|--------|
| `plan_id` / tier | **NOT INCLUDED** — must use contact tag (`tier-annual`) instead |
| `doctor_email` | Wrong name — use `member_email` |
| `doctor_first_name` | Wrong name — use `member_first_name` |
| `action` | Unverified — capture real decline to confirm |

---

## BD Support Ticket

**Request:** Add `plan_id` or membership tier field to Lead Submitted webhook payload.

**Rationale:** Enables workflow branching by tier without requiring pre-tagged contacts. Currently must maintain a synced tag list from BD member exports.

**Status:** Pending — add to BD support ticket queue.

---

*Last updated: Sep 22, 2026*
