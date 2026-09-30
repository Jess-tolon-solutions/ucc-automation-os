# Patient General Form Confirmation

**Status:** DRAFT — pending Billy approval
**Form:** General Contact Form (patient classification)
**Trigger:** Patient submits contact form with "I am a patient looking for an Upper Cervical doctor"

---

## Version A: With State Link (Recommended)

Since BD's search is client-side JavaScript, we can't deep-link directly to ZIP results.
Best fallback: Link to the state page based on their location.

**Subject:** We received your inquiry

**Body:**

Hi {{lead_name}},

Thank you for reaching out to UpperCervicalCare.com.

This is our general information inbox. To find an Upper Cervical doctor near you, please visit our directory:

**[Find a Doctor Near You](https://www.uppercervicalcare.com/locations/)**

Enter your ZIP code or city in the search box to see doctors in your area. You can also filter by distance and technique.

Once you find a doctor, you can contact them directly through their profile page.

— The UpperCervicalCare.com Team

---

## Version B: Simple Directory Link

**Subject:** We received your inquiry

**Body:**

Hi {{lead_name}},

Thank you for contacting UpperCervicalCare.com.

This inbox is for general inquiries. If you're looking to connect with an Upper Cervical doctor near {{lead_location}}, please visit our directory:

**[uppercervicalcare.com/locations](https://www.uppercervicalcare.com/locations/)**

From there, you can search by location and contact a doctor directly.

— The UpperCervicalCare.com Team

---

## Technical Notes

- BD's `/locations` page uses client-side JavaScript filtering — no URL parameter for ZIP pre-fill
- State pages exist (e.g., `/united-states/florida/`) but require manual navigation
- Patient's `lead_location` (ZIP) can be mentioned in copy but not used for dynamic linking
- This email fires from BD's form autoresponder, NOT from GHL

---

## Where to Configure

**BD Admin → Forms → [General Contact Form] → Autoresponder/Notifications**

Or if using Lead Actions:
**BD Admin → Leads → Lead Actions → [action for this form]**

---

*Drafted: Sept 25, 2026*
