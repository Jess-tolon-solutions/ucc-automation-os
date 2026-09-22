# BD Developer Hub Webhooks

Webhook configurations in Brilliant Directories Developer Hub that push data to
external systems. BD's only native outputs are emails and these webhooks — all
automation triggers off one of these two.

**Admin location:** uppercervicalcare.com → Admin → Developer Hub → Webhooks

**Important discovery (Sep 20, 2026):** BD has two types of webhooks:
- **Built-in event webhooks** (real-time) — Contact Us Form Submitted, Lead Submitted,
  Lead Accept, Lead Decline, One-Time Purchase. These fire immediately on events.
- **Smart-list webhooks** (batch only) — fire on schedule (daily/weekly), not real-time.
  Not usable for automation triggers. Dead end.

---

## Contact Us Form Submitted (B2B Lane)

**Status:** LIVE — routing to GHL Directory account

BD built-in event that fires when the General Contact form is submitted.

**Trigger:** Form submission on General Contact form

**Destination:** GHL Directory account → B2B Inquiry Router workflow

**Webhook URL:** *(stored in GHL workflow trigger — do not document here)*

**Payload fields:**
| Field | Source | Notes |
|-------|--------|-------|
| `inquirer_type` | Form field | Classification dropdown — determines routing |
| `name` | Form field | Submitter's name |
| `email` | Form field | Submitter's email |
| `phone` | Form field | Optional |
| `message` | Form field | Free-text inquiry |
| `zip_code` | Form field | Optional; used for patient routing, passed through on B2B |
| `submitted_at` | System | ISO timestamp |

**Content-Type:** `application/json`

**Method:** POST

---

## Lead Submitted (`bootstrap_get_match`)

**Status:** EXISTS but pointing at wrong account — needs repointing to B2C

BD built-in event that fires when a patient submits an inquiry on a doctor's
profile or the Get Matched form.

**Trigger:** Lead form submission (doctor profile or Get Matched)

**Current destination:** GHL Directory account (WRONG — this is B2B account)

**Required destination:** GHL B2C account → Lead Submitted workflow

**Payload fields:**
| Field | Source | Notes |
|-------|--------|-------|
| `lead_id` | BD system | Generated inquiry ID |
| `doctor_id` | BD system | Matched doctor's BD member ID |
| `doctor_email` | BD system | Doctor's email |
| `doctor_first_name` | BD system | For personalization |
| `plan_id` | BD system | Doctor's membership tier — determines workflow branch |
| `patient_name` | Form field | |
| `patient_email` | Form field | |
| `patient_phone` | Form field | Optional |
| `patient_message` | Form field | |
| `patient_zip` | Form field | Required on Annual/Unverified flow only |
| `submitted_at` | System | ISO timestamp |

---

## Lead Accept / Decline

**Status:** NOT YET CONFIGURED — build when D2C workflow is ready

BD built-in event that fires when a doctor accepts OR declines a lead. This is a
**single event with one webhook URL** — the `action` field indicates which.

**Trigger:** Doctor accepts or declines lead

**Destination:** GHL B2C account → Lead Accept/Decline workflow

**Payload fields:**
| Field | Source | Notes |
|-------|--------|-------|
| `lead_id` | BD system | Matches lead from submission |
| `doctor_id` | BD system | |
| `doctor_email` | BD system | For contact lookup |
| `action` | BD system | `accept` or `decline` |
| `action_timestamp` | System | ISO timestamp |

**Purpose:** Stops the reminder sequence (Remove From Workflow + remove tag);
branches on `action` to update opportunity stage and tags accordingly.

---

## One-Time Purchase

**Status:** NOT YET CONFIGURED — optional tracking

BD built-in event that fires when a one-time payment completes (the $50 lead fee).

**Trigger:** Payment success

**Potential use:** Tracking/reporting. Lead Accept is the cleaner trigger for
stopping reminders since it fires on the action, not the payment completion.

---

## Webhook Security Notes

- BD webhooks do not support HMAC signing in Build 4.0. Authenticate by:
  - Keeping webhook URLs secret (not in repo)
  - Validating required fields on the receiving end
- All webhook URLs with tokens are secrets — reference by name only in docs.
- Test in BD Developer Hub console before relying on production traffic.

---

## Configuration Checklist

- [x] Contact Us Form Submitted → GHL Directory (B2B Inquiry Router) — LIVE
- [ ] Lead Submitted → repoint from Directory to B2C account
- [ ] Lead Accept/Decline → configure pointing to B2C Lead Accept/Decline workflow
- [ ] One-Time Purchase → optional, for tracking only

---

## Related Files

- `ghl/b2b-inquiry-router.md` — receiving workflow for Contact Us Form Submitted
- `ghl/d2c-lead-reminders.md` — receiving workflows for Lead Submitted/Accept/Decline
- `docs/workflow-specification.md` — full system spec

---

*Last updated: Sep 20, 2026*
