# Doctor Lead Reminder — 72 Hours (Expiration)

**Status:** DRAFT

**Workflow:** D2C Lead Reminders (Workflow 3 — Annual/Unverified)

**Trigger:** 72 hours after lead notification sent, no accept/decline action

**Channel:** Email (SMS version below)

**Effect:** Lead expires; patient enters fallback cascade (Workflow 4) if
ZIP-matched, or receives closed notification if direct profile inquiry.

---

## Email

**Subject:** Patient inquiry expired

**From:** UpperCervicalCare.com <noreply@uppercervicalcare.com>

**Body:**

Hi {{first_name}},

The patient inquiry you received three days ago has expired. Because no action
was taken within the response window, this lead has been closed on your account.

If you'd like to adjust your notification preferences or have questions about
lead delivery, reply to this email or contact us at info@uppercervicalcare.com.

—
UpperCervicalCare.com

---

## SMS Version

UpperCervicalCare.com: Your patient inquiry has expired due to no response.
Contact us if you have questions about your lead settings.

---

## Copy Notes

- This is a notification, not a prompt — the lead is already closed.
- No call to action to "view" the lead; it's gone from their queue.
- Patient receives a separate expiration notice (see `patient-lead-expired.md`).
- If this was a ZIP-matched general inquiry, patient enters the 50-mile fallback
  cascade per Workflow 4. If direct profile inquiry to an Annual/Unverified
  doctor, the patient is routed to Find-a-Doctor or Exception.
- Level 2+ doctors never receive this message — their leads don't expire.

---

## Approval

- [ ] Drafted: Sep 18, 2026
- [ ] Sent for approval:
- [ ] Approved:
