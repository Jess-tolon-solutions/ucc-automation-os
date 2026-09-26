# Patient Confirmation — Instant (on submission)

**Status:** APPROVED (Billy, Sept 25, 2026)

**Trigger:** Immediately on lead submission (Patient Expiration Watch enrollment)

**Recipient:** Patient (the lead)

---

## Email

**Subject:** Your inquiry has been received

**Body:**

Hi {{contact.first_name}},

Thank you for reaching out through UpperCervicalCare.com.

Your inquiry has been sent to a doctor in your area. You should hear back within 48 hours.

If you have any questions in the meantime, you can reply to this email or contact us at info@uppercervicalcare.com.

— The UpperCervicalCare.com Team

---

## Notes

- Patient must never see membership level or the $50 fee (per spec line 83)
- Sends to enrolled contact (patient) in Patient Expiration Watch
- Uses {{contact.first_name}} from Create/Update Contact action (maps to lead_name)
- "48 hours" sets expectation before the 72hr expiration notice fires
