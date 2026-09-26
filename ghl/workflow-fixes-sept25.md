# Workflow Fixes — Sept 25, 2026

GHL API is read-only for workflow structure. These changes must be made via UI.

---

## Task 1: FIX — Patient Watch Stop (Opportunity Stage Updates)

### Problem
"Update opportunity" actions skip with error:
> Internal Action Error - Please use Opportunity trigger/find opportunity action to get the opportunity

**Root cause:** Workflow is triggered by inbound webhook (contact context only). The "Update Opportunity" action requires an opportunity to be loaded into the workflow context first.

### Solution
Add a **Find Opportunity** action in the main line BEFORE the condition branch.

### Exact UI Steps

1. Open **Automation** → **Workflows** → **Patient Watch Stop**

2. Click the **+** button AFTER "Remove From Workflow: Patient Expiration Watch" and BEFORE the "If/Else" condition

3. In the action picker, search for: **"Opportunity Lookup"**
   - This is under the "Opportunities" category
   - **DO NOT** use "Create Opportunity" or "Update Opportunity" here

4. Configure the Opportunity Lookup action:
   - **Pipeline:** Patient Leads
   - **Lookup by:** Contact (the enrolled contact is the patient)
   - This finds the opportunity created in Patient Expiration Watch for this patient

5. Click **Save Action**

6. The workflow structure should now be:
   ```
   Trigger: Inbound Webhook (Accept / Decline Relay)
      ↓
   Create/Update Contact (by lead_email)
      ↓
   Remove From Workflow → Patient Expiration Watch
      ↓
   ★ Opportunity Lookup (Pipeline: Patient Leads)  ← NEW
      ↓
   If/Else: lead_action
      ├─ Is "accept" → Update Opportunity Stage → "Accepted"
      └─ Is "decline" → Update Opportunity Stage → "Declined"
   ```

7. Click **Save** on the workflow

8. **Test** with a real decline/accept to confirm stage updates work

### Why "Opportunity Lookup" not "Find Opportunity"
GHL has similarly named actions:
- **Opportunity Lookup** — finds existing opp by pipeline + contact match (USE THIS)
- **Update Opportunity** — updates an opp already in context
- **Create Opportunity** — creates new opp (not what we need)

---

## Task 2: BUILD — Patient Confirmation Email

### Goal
Send immediate confirmation to patient when they submit an inquiry.

### Location
**Patient Expiration Watch** workflow — add as FIRST action (before patient-inquiry tag)

### Exact UI Steps

1. Open **Automation** → **Workflows** → **Patient Expiration Watch**

2. Click the **+** button AFTER "Trigger: Inbound Webhook" and BEFORE "Create/Update Contact"
   - Actually, place it AFTER Create/Update Contact (we need the contact to exist first)
   - So: Trigger → Create/Update Contact → **NEW: Send Email** → Add Tag

3. In the action picker, search for: **"Send Email"**
   - Under "Communications" category

4. Configure the Send Email action:
   - **To:** Contact Email (the enrolled contact is the patient)
   - **From Name:** UpperCervicalCare.com
   - **From Email:** (use default sending domain)
   - **Subject:** Your inquiry has been received
   - **Body:**
     ```
     Hi {{contact.first_name}},

     Thank you for reaching out through UpperCervicalCare.com.

     Your inquiry has been sent to a doctor in your area. You should hear back within 48 hours.

     If you have any questions in the meantime, you can reply to this email or contact us at info@uppercervicalcare.com.

     — The UpperCervicalCare.com Team
     ```

5. Click **Save Action**

6. The workflow structure should now be:
   ```
   Trigger: Inbound Webhook (Patient Watch Start)
      ↓
   Create/Update Contact (patient)
      ↓
   ★ Send Email (confirmation)  ← NEW
      ↓
   Add Tag: patient-inquiry
      ↓
   Create Opportunity
      ↓
   Wait 72 hours
      ↓
   ... rest of workflow
   ```

7. Click **Save** on the workflow

### Copy Reference
Full copy in: `copy/patient-confirmation-instant.md`

---

## Task 3: BUILD — Sign Up Auto-Tagger

### Goal
Automatically tag new Plan 3 (Unverified) and Plan 31 (Level 1 Annual) signups with `tier-annual`.

### BD Webhook Setup

1. Open BD Admin → Developer Hub → Custom Webhooks

2. Find or create webhook for event: **"Sign Up"** (new member registration)
   - If not available as a built-in event, check under "Member Events" or similar

3. Point the webhook URL to the new GHL workflow's inbound webhook URL (step 9 below)

### GHL Workflow Build — Exact UI Steps

1. Open **Automation** → **Workflows** → **+ Create Workflow**

2. Name: **Sign Up Auto-Tagger**

3. Add Trigger: Search for **"Inbound Webhook"**
   - Name it: "BD Sign Up"
   - Copy the webhook URL (you'll need this for BD)

4. Add Action 1: **Create/Update Contact**
   - Email ← `{{email}}` (or verify actual field name from BD payload)
   - First Name ← `{{first_name}}`
   - Last Name ← `{{last_name}}`

5. Add Action 2: **If/Else** condition
   - Condition: Custom Value `{{plan_id}}` OR `{{subscription_id}}`
     - **Is** `3` OR **Is** `31`
   - If BD sends plan_id as a string, use "Contains" `3` with exact match
   - **IMPORTANT:** Verify actual field name in BD Sign Up payload

6. Inside the **YES branch**, add: **Add Tag**
   - Tag: `tier-annual`

7. The **NO branch** (Level 2+ signups): **END** (no action needed)

8. Workflow structure:
   ```
   Trigger: Inbound Webhook (BD Sign Up)
      ↓
   Create/Update Contact
      ↓
   If/Else: plan_id Is "3" OR Is "31"
      ├─ YES → Add Tag: tier-annual → END
      └─ NO → END
   ```

9. Click **Save** → **Publish**

10. Copy the Inbound Webhook URL

11. Return to BD Developer Hub → paste URL into Sign Up webhook config

### BD Event Name to Enable
Look for one of these in BD Developer Hub:
- "Sign Up" (most likely)
- "New Member Registration"
- "Member Created"

**After wiring:** Test with a new signup (if possible in staging) or wait for a real signup and verify the tag appears.

### Closes the Standing Leak
New Plan 3/31 members will now automatically receive `tier-annual` tag, ensuring they're covered by the Lead Reminder Sequence.

---

## Task 4: FIX — Opportunity Name in Patient Expiration Watch

### Problem
Opportunity Name currently shows only patient name. On the pipeline board, you can't see
which doctor each lead is waiting on.

### Solution
Update Create Opportunity action to include doctor email in the name.

### Exact UI Steps

1. Open **Automation** → **Workflows** → **Patient Expiration Watch**

2. Click on the **Create Opportunity** action

3. Find the **Opportunity Name** field

4. Change from:
   ```
   {{lead_name}}
   ```
   To:
   ```
   {{lead_name}} → {{member_email}}
   ```

5. Click **Save Action**

6. Click **Save** on the workflow

### Result
Pipeline board will show: `John Smith → drbaker@clinic.com` making it clear which doctor
each lead is assigned to.

---

## Test Results to Log

**End-to-end decline test — Sept 25, 8:22pm:**
- Patient removed from Patient Expiration Watch: ✓ CONFIRMED
- Opportunity stage update to "Declined": ✗ FAILED (error above)
- After fix: Re-test required

---

*Document these changes in build-status.md and decision-log.md after completion.*
