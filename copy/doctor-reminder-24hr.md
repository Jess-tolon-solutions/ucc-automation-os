# Doctor Lead Reminder — 24 Hours

**Status:** DRAFT

**Workflow:** D2C Lead Reminders (Workflow 3 — Annual/Unverified)

**Trigger:** 24 hours after lead notification sent, no accept/decline action

**Channel:** Email (SMS version below)

---

## Email

**Subject:** A patient is waiting to hear from you

**From:** UpperCervicalCare.com <noreply@uppercervicalcare.com>

**Body:**

Hi {{first_name}},

You received a patient inquiry yesterday that's still waiting for your response.

This patient is actively looking for upper cervical care in your area. They took
the time to reach out — a quick response often makes the difference.

**To view and respond to this inquiry, log in to your UpperCervicalCare.com
dashboard.**

[View Inquiry →]

If you've already handled this lead outside the system, you can disregard this
reminder.

—
UpperCervicalCare.com

---

## SMS Version

UpperCervicalCare.com: You have a patient inquiry from yesterday still waiting
for a response. Log in to view and respond: {{dashboard_link}}

---

## Copy Notes

- "disregard this reminder" language is a v1 workaround — BD doesn't emit an
  accept event we can use as a stop condition. Future: wire BD accept webhook
  to stop the sequence properly.
- Do not mention the $50 fee in reminders — that's in the initial notification
  only. Reminders just prompt action.
- `{{first_name}}` must be the actual BD variable, not hardcoded "jordan"
  (see template bug in CLAUDE.md).

---

## Approval

- [ ] Drafted: Sep 18, 2026
- [ ] Sent for approval:
- [ ] Approved:
