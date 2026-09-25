# BD Sign Up Auto-Tagger

**Status:** PROPOSED
**Priority:** HIGH — closes standing leak for new Plan 3/31 signups
**Account:** B2C (Upper Cervical Care)

---

## Purpose

Automatically tag new Plan 3 (Unverified Doctor) and Plan 31 (Level 1 Annual) members
with `tier-annual` when they sign up in BD. Without this workflow, new signups after
Sept 25, 2026 silently skip the D2C reminder cadence.

---

## Trigger

**BD Event:** Sign Up (new member registration)
**Webhook URL:** TBD (create in BD Developer Hub → Custom Webhooks)

---

## Expected BD Payload (verify on first real capture)

Based on other BD webhooks, expect fields like:
```json
{
  "user_id": "3946",
  "email": "newdoctor@example.com",
  "first_name": "Jane",
  "last_name": "Doe, DC",
  "plan_id": "3",
  "plan_name": "Unverified Doctor",
  "signup_date": "2026-09-26T10:30:00Z"
}
```

**CRITICAL:** Verify `plan_id` is present in payload before building. If not, file BD
support ticket to request it (like we did for Lead Submitted).

---

## Workflow Steps

### 1. Inbound Webhook Trigger
- Name: "BD Sign Up"
- Capture sample from ZZTEST signup or real new member

### 2. If/Else: plan_id in {3, 31}

**Condition:** `{{inboundWebhookRequest.plan_id}}` equals "3" OR "31"

**YES branch:**

### 3. Create/Update Contact
- Email: `{{inboundWebhookRequest.email}}`
- First Name: `{{inboundWebhookRequest.first_name}}`
- Last Name: `{{inboundWebhookRequest.last_name}}`

### 4. Add Tag
- Tag: `tier-annual`

### 5. (Optional) Add Tag for plan type
- If plan_id = 3: add tag `plan-unverified`
- If plan_id = 31: add tag `plan-annual`
- Useful for future segmentation, not required for v1

**NO branch:**
- Do nothing (Level 2+ members don't need the tag)

---

## Testing

1. Create ZZTEST signup on Plan 3 or Plan 31 (if possible in BD staging)
2. Verify webhook fires and payload contains `plan_id`
3. Verify GHL contact is created/updated with `tier-annual` tag
4. Test with Plan 2 signup to verify NO branch works (no tag added)

---

## Build Checklist

- [ ] Create custom webhook in BD Developer Hub for "Sign Up" event
- [ ] Point to new GHL workflow inbound webhook URL
- [ ] Create GHL workflow with steps above
- [ ] Capture real sample (ZZTEST or wait for real signup)
- [ ] Verify `plan_id` in payload
- [ ] Test both branches
- [ ] Publish workflow
- [ ] Update decision log: "Standing leak closed"
- [ ] Update build-status.md

---

## Fallback if plan_id not in payload

If BD doesn't include `plan_id` in the Sign Up webhook:

1. File BD support ticket requesting `plan_id` be added
2. Meanwhile, continue with weekly manual audit:
   - Export Plan 3 and Plan 31 members from BD
   - Compare to GHL contacts with `tier-annual` tag
   - Backfill any gaps via API

This is not sustainable at scale but acceptable as interim measure.
