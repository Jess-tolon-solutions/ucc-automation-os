UpperCervicalCare.com — Lead & Inquiry Automation
Workflow Specification
Purpose of this document: This is the implementation specification for the UCC Lead & Inquiry Automation system across Brilliant Directories (BD), GoHighLevel (GHL), Zapier/Webhooks (ZW), and the internal Dashboard. It defines every trigger, data requirement, routing rule, automated action, communication point, status flow, follow-up timing, exception condition, and owning system for each workflow.

Operating principle: Automate routine actions and surface only exceptions requiring human attention. Use deterministic business rules wherever a defined data field (membership level, form selection, status, payment status) can reliably determine the action.

System legend:

BD = Brilliant Directories (directory, profiles, membership data, inquiry forms, initial capture)
GHL = GoHighLevel (CRM, email/SMS, workflows, pipelines, follow-ups)
ZW = Zapier / Webhook / API (moves data between systems)
DASH = Internal Dashboard (central visibility, lifecycle, exceptions)
SLACK = Slack (internal team notification channel(s))
CL = Claude (design, drafting, classification support, troubleshooting, eventual approved tool actions)

Qualifying membership tiers (BD plan IDs):

Level 2+ / full lead access (no $50 fee): Plan IDs 2, 18, 19, 23, 26, 27, 29, 33
Annual / Unverified ($50 accept/decline flow): Plan IDs 3, 31

Ownership: Billy owns leads (Workflows 1–4); Constansa owns B2B/doctor-side inquiries (Workflows 5–6); a virtual assistant may be added later to handle follow-up tasks. Owner defaults to unassigned on new Exceptions.


Implementation Status (as of this revision)
Built and live:

General Contact Us form (contact_form, live at uppercervicalcare.com/about/contact): includes the required classification question inquirer_type (options: existing UCC Doctor/Member, Doctor interested in joining, Potential Patient looking for a doctor) and an optional zip_code field with helper text, positioned between the classification question and the message box.
SMS/marketing consent labels reference a real UCC business SMS number and are not pre-checked by default.
Doctor-profile Annual/Unverified inquiry form ("Get Matched" lead form): location/ZIP field is live and required, sitewide. Level 2+ doctor-profile inquiries intentionally do not include a location field — no automatch decision applies, since the patient has already chosen that specific doctor and delivery is guaranteed regardless of location.

Pending decision — not yet built:

A dedicated Slack channel (e.g. #b2b-inquiries) for Constansa to get notified of B2B inquiries (Workflows 5–6) has been proposed but not yet created or wired up. Once confirmed, this would sit alongside or instead of GHL notifications as the alert mechanism for Constansa's queue.
BD's native Lead Settings includes an existing custom rule, "Paid Membership Leads - FLOW Automatically," governing Level 2+ delivery. Worth a full audit before the GHL/Zapier build starts, to confirm what BD already handles natively versus what still needs custom automation (Workflows 2–3).
The GHL/Zapier automation logic (routing, reminders, cascade, dashboard sync) described in Workflows 2–9 has not been built yet — only the BD-side form/field capture described above exists so far. This is the scope intended for the Upwork hire.


1. Doctor-Profile Patient Inquiry (Intake & Routing Layer)
This is the entry point that all doctor-profile inquiries pass through before splitting into Workflow 2 (Level 2+) or Workflow 3 (Annual/Unverified).

Trigger: Patient submits the inquiry form on an individual doctor's BD profile.
Data required: Doctor/profile ID, doctor's BD membership plan ID, patient name, patient email, patient phone (if supplied), patient message, submission date/time, generated lead/inquiry ID, initial lead status. Patient ZIP is captured only on the Annual/Unverified branch (Workflow 3) — Level 2+ profiles use a separate BD lead action with no location field, since no automatch decision applies (see Workflow 2).
Decision/routing rule: Deterministic branch on plan ID:
Plan ID in {2, 18, 19, 23, 26, 27, 29, 33} → Workflow 2 (full access, no fee)
Plan ID in {3, 31} → Workflow 3 ($50 accept/decline)
Automated action: Capture and normalize the submission; generate the lead/inquiry ID; write the initial record; fire the plan-ID branch.
Communication sent: None at this layer — handled in the branch (Workflow 2 or 3).
Status change: (none) → New
Follow-up timing: N/A — routing is instantaneous.
Exception requiring human attention: Plan ID missing, or present but not in either known list (new/unmapped plan); malformed submission (no email and no phone); doctor profile flagged inactive/suspended but still receiving inquiries.
System responsible: BD (capture) → ZW (push to GHL/dashboard) → DASH (record creation).


2. Level 2+ Lead Handling (Plan IDs 2, 18, 19, 23, 26, 27, 29, 33 — Full Access, No Purchase Required)
Trigger: Inbound inquiry from Workflow 1 where doctor's plan ID is in the Level 2+ list.
Data required: Same as Workflow 1, plus doctor's notification preferences (email/SMS) and doctor's GHL contact record.
Decision/routing rule: Deterministic — qualifying plan ID = full contact info released immediately, no payment gate.
Automated action:
Push complete patient contact info + message to the doctor via GHL (email/SMS per doctor preference).
Send patient confirmation immediately.
Log lead in dashboard as delivered.
Communication sent:
To doctor: "New patient inquiry" notification with full patient details.
To patient: Immediate confirmation that the inquiry reached the doctor. (Exact copy → Approved Communications reference doc.)
Status change: New → Delivered → (tracked forward as doctor engages) Viewed → Closed once resolved.
Follow-up timing: No purchase-related follow-up needed. Optional: a single "did you follow up with this patient?" nudge to the doctor after a defined interval (proposed 3–5 business days) purely for dashboard hygiene — not billing-related.
Exception requiring human attention: Doctor notification fails to deliver (bounced email/invalid number); doctor has no GHL contact record yet; lead sits Delivered with no doctor action past the hygiene-nudge window (informational exception, not billing).
System responsible: GHL (notification/delivery) · DASH (status tracking) · ZW (BD→GHL→DASH sync).


3. Annual / Unverified (Plan IDs 3, 31) — $50 Lead Acceptance Handling
Trigger: Inbound inquiry from Workflow 1 where doctor's plan ID is 3 or 31.
Data required: Same base inquiry data, but patient contact info is withheld from the doctor-facing view; doctor's payment method on file (if any); lead accept/decline response.
Decision/routing rule: Applies identically to both plan IDs (Annual and Unverified) — doctor sees the patient's message only, no name/email/phone, and is presented an Accept ($50) / Decline choice.
Automated action:
Send anonymized lead notification to doctor with Accept/Decline options.
On Accept + successful $50 payment → release full patient contact info to doctor automatically.
On Decline → close the lead on the doctor side.
On no action → enter the reminder cadence below; on expiration, hand off to the 50-mile fallback cascade if this lead originated from a ZIP-matched general inquiry (see Workflow 4). This expiration-and-cascade path applies only to Annual/Unverified doctors — Level 2+ doctors never expire or get re-routed (see Workflow 2 and the tier note in Workflow 4).
Communication sent:
To doctor: "You have a new lead — Accept for $50 or Decline," plus reminders at day 2 and day 4.
To doctor, on accept + payment: Full patient contact info released.
To patient (immediately on submission): Confirmation that the inquiry was received. Patient must never see membership level or the $50 fee.
To both doctor and patient, on expiration (day 5, no action taken): Expiration notice. Patient's notice should route them toward the Find-a-Doctor feature (or, if ZIP-matched, into the fallback cascade) rather than a dead end.
Status change: New → Awaiting Decision → Accepted (payment confirmed) or Declined or (no action by day 5) Expired.
Follow-up timing: Day 2 reminder → Day 4 reminder → Day 5 expiration with dual notification.
Exception requiring human attention: Payment fails after doctor clicks Accept; doctor accepts but payment method is missing/invalid on file; doctor disputes a charge; plan ID present but doctor account otherwise flagged (suspended, delinquent).
System responsible: BD (anonymized lead display, payment collection) · GHL (notifications, reminders, expiration messaging) · DASH (lifecycle tracking) · ZW (payment-status sync to dashboard).


4. General Patient Inquiry (via General Contact Form) — Now Including ZIP-Matched Routing
Trigger: Submission on the general UCC contact form where the classification question is answered "I am a patient looking for an Upper Cervical doctor."
Data required: Name, email, phone (optional), message, classification answer, ZIP code (now required for this branch), submission date/time.
Decision/routing rule: Deterministic on the classification field. Once classified as a patient inquiry:
System uses the ZIP to find the nearest qualifying doctor (any plan ID — Level 2+ or Annual/Unverified; both are eligible to receive the routed lead).
The matched lead is handed to Workflow 2 or Workflow 3 depending on that doctor's plan ID — it behaves exactly like a direct profile inquiry from that point forward, including the $50 accept/decline mechanic if applicable.
Tier gates what happens next if the doctor doesn't respond:
Level 2+ doctor: no expiration, no cascade. The lead simply sits Delivered until the doctor acts — same as a direct-profile inquiry to a Level 2+ doctor (Workflow 2). It is never silently re-routed to a competitor, since that doctor's membership includes guaranteed lead delivery.
Annual/Unverified doctor: if the 5-day accept/decline window expires with no action (Workflow 3), the fallback cascade below kicks in automatically.
Fallback cascade (Annual/Unverified matched doctor only — does not apply if the matched doctor is Level 2+):
Nearest backup doctor within 50 miles of the original ZIP → 48-hour response window.
If still no response, next-nearest backup within 50 miles → 48-hour response window.
If still no response after 2 backups → Exception (does not keep cycling indefinitely).
Each backup hop is itself tier-gated the same way: if a backup doctor happens to be Level 2+, the cascade stops there and the lead simply sits Delivered with that doctor rather than continuing to hop.
Automated action: Send immediate patient acknowledgment; run the ZIP match; hand off to Workflow 2/3; monitor for expiration/no-response to trigger the cascade; log every hop.
Communication sent:
To patient (immediately): Confirmation the inquiry was received and is being routed to a nearby doctor — still no mention of membership tier or fees.
To each matched doctor: Standard Workflow 2 or 3 notification.
To patient, if the cascade exhausts without a response: Notice that a human will follow up to help find a doctor (routes to Exception/manual placement).
Status change: New → Awaiting Decision (routed to doctor #1) → possibly re-enters Awaiting Decision for doctor #2, #3 (Annual/Unverified matches only — a Level 2+ match stops here) → Delivered/Accepted/Declined/Closed on success, or Exception if the cascade exhausts.
Follow-up timing: Governed by whichever workflow (2 or 3) the matched doctor falls into, plus the 48-hour cascade windows described above.
Exception requiring human attention: No qualifying doctor found within 50 miles of the ZIP at all; cascade exhausts after 2 backups with no response; patient ZIP is invalid/unparseable.
System responsible: BD (form capture, ZIP field) · ZW (radius lookup/matching logic, cascade sequencing) · GHL (notifications per hop) · DASH (full routing history per inquiry).


5. Existing Member/Doctor Support Inquiry
Trigger: General form submission where classification = "I am an existing doctor/member and need help with my account."
Data required: Doctor name/practice, email/phone, associated BD member record, message, classification answer.
Decision/routing rule: Deterministic on classification field. Must not receive the patient/find-a-doctor response.
Automated action:
Send immediate acknowledgment of the support request.
Create or update the doctor's GHL record.
Attempt categorization (billing, profile edit, lead dispute, technical issue, cancellation, other) — Claude/AI-assisted since it's not a deterministic field; routing within GHL once categorized stays rule-based.
Route into the matching member-support workflow/pipeline.
Assign Owner: Constansa (B2B/doctor-side inquiries).
(Pending decision — not yet built): Post a notification into a dedicated Slack channel (proposed #b2b-inquiries) so Constansa is alerted in real time, alongside or instead of the GHL-side notification.
Communication sent: To doctor: "We received your request, here's what happens next" acknowledgment (exact copy → Approved Communications doc).
Status change: New → Awaiting Decision ("In Progress") → Closed.
Follow-up timing: Check-in if unresolved after 2 business days; escalate to Exception if still open after 5 business days.
Exception requiring human attention: Category can't be confidently determined; billing dispute or cancellation request (always route to human, never auto-resolve); doctor reports a bug/technical issue; repeat/unresolved request.
System responsible: GHL (record, pipeline, acknowledgment) · SLACK (Constansa notification — pending) · CL (categorization assist) · DASH (status/owner tracking).


6. Prospective Doctor Inquiry
Trigger: General form submission where classification = "I am a doctor interested in joining UpperCervicalCare.com."
Data required: Doctor name, practice name/location, email/phone, message, classification answer.
Decision/routing rule: Deterministic on classification field. Assign Owner: Constansa (B2B/doctor-side).
Automated action:
Send immediate acknowledgment.
Provide standard membership information (tiers, what's included — sourced from the Membership Rules reference doc once built).
Enter doctor into the prospective-member pipeline in GHL.
Begin the approved nurture/follow-up sequence.
(Pending decision — not yet built): Post a notification into the same proposed #b2b-inquiries Slack channel so Constansa sees new prospective-doctor inquiries alongside member-support requests.
Communication sent: To prospective doctor: Welcome + membership overview + next steps (exact copy → Approved Communications doc).
Status change: New → Awaiting Decision (nurture in progress) → Closed (joined or opted out).
Follow-up timing: Nurture touches at day 1, day 4, day 10, and day 21 (full copy/cadence detail lives in the Lead Workflow Specifications reference doc).
Exception requiring human attention: High-intent signal (prospect replies asking to talk directly, asks pricing questions beyond standard nurture content, requests a call) — escalate for human follow-up rather than continuing automated nurture.
System responsible: GHL (pipeline, nurture sequence) · SLACK (Constansa notification — pending) · DASH (tracking) · CL (high-intent detection assist, communication drafting).


7. Automated Follow-Up Sequences (Cross-Cutting)
Applies across Workflows 3, 4 (cascade), 5, and 6 wherever something is awaiting a response.

Trigger: A tracked item (lead accept/decline, cascade hop, support request, prospective-doctor nurture step) has not progressed past its defined time threshold since its last action.
Data required: Last action timestamp, current status, follow-up attempt count, item type (drives which cadence applies).
Decision/routing rule: Deterministic time-based rule per item type — no AI judgment on whether to send a reminder, only optionally on how it's worded.
Automated action: Send the next scheduled reminder; increment follow-up attempt count; update last-action timestamp and next-scheduled-action date; trigger expiration/cascade/exception at the end of the cadence.
Communication sent: Reminder-specific templates per item type (→ Approved Communications doc).
Status change: No status change from a reminder alone, except the final action in a cadence, which moves the item to Expired, the next cascade hop, or Exception.
Follow-up timing:
Annual/Unverified lead accept/decline: reminder day 2, reminder day 4, Expired (with dual notification) at day 5.
ZIP-matched fallback cascade hop: 48-hour window per backup doctor, up to 2 backups, then Exception.
Member support request: check-in at 2 business days, escalate to Exception at 5 business days.
Prospective doctor nurture: touches at day 1/4/10/21, then move to low-frequency nurture or Closed if no engagement by day 30.
Exception requiring human attention: Max follow-up attempts reached with no response; a reminder send itself fails; an item's type/cadence can't be determined.
System responsible: GHL (scheduling and sending reminders) · DASH (attempt counts, next-action visibility) · ZW (keeping timestamps and cascade state in sync across systems).


8. Dashboard Tracking (Central Inquiry & Lead Record)
Trigger: Any event across Workflows 1–7 (creation, status change, follow-up attempt, cascade hop, resolution).

Data required (per record, minimum field set): Inquiry ID, Date, Inquiry Type, Patient/Doctor, Doctor Profile, Membership Plan ID, Lead Status, Last Action, Follow-Up Attempts, Next Action, Owner (Billy / Constansa / VA-future / unassigned), Exception/Attention Required flag, Routing history (for ZIP-matched leads: which doctors were tried, in order).

Decision/routing rule: Every inquiry from every workflow creates or updates exactly one dashboard record — no inquiry type is exempt.

Automated action: Write/update the record on every event; recompute the "needs attention" flag whenever status, follow-up count, or elapsed time crosses a defined threshold.

Communication sent: None directly — internal view only.

Status change: Dashboard reflects, rather than drives, status.

Follow-up timing: N/A — near-real-time updates.

Status set per inquiry type:

Inquiry type
Statuses used
Default Owner
Level 2+ doctor-profile lead
New → Delivered → Viewed → Closed
Billy
Annual/Unverified doctor-profile lead
New → Awaiting Decision → Accepted / Declined / Expired → Closed
Billy
General patient inquiry (ZIP-matched)
New → Awaiting Decision (per hop) → Delivered/Accepted/Declined/Closed, or Exception if cascade exhausts
Billy
Member support
New → Awaiting Decision ("In Progress") → Closed
Constansa
Prospective doctor
New → Awaiting Decision (nurturing) → Closed
Constansa
Any type, any point
→ Exception (overrides normal flow)
Unassigned until claimed


Exception requiring human attention: Sync failure between BD/GHL and the dashboard (record missing or status mismatch) is itself an exception, separate from the record's own business-rule exceptions.

System responsible: DASH (display, filtering, alerting) · ZW (keeping it in sync) · BD/GHL (source-of-truth events).


9. Exception Management
Trigger: Any condition flagged as an exception in Workflows 1–8, or a genuinely unclassifiable inquiry ("Something else," or classification confidence too low to route automatically).
Data required: Everything from the originating workflow, plus the specific exception reason/category.
Decision/routing rule: When the system cannot confidently apply a deterministic rule, it must not guess. Default behavior is always: record it, flag it, surface it — never silently auto-resolve an ambiguous case.
Automated action: Create/flag the dashboard record as Exception; assign a reason category; leave Owner unassigned until Billy or Constansa claims it (or, later, a VA if delegated).
Communication sent: None automatically to the patient/doctor beyond whatever standard acknowledgment they already received at intake.
Status change: → Exception (reachable from any other status).
Follow-up timing: N/A until a human reviews it; the dashboard should surface exceptions prominently.
Exception requiring human attention: By definition, this entire workflow is the human-attention layer.
System responsible: DASH (surfacing, filtering "needs attention") · CL (drafting a resolution or response once a human decides the approach) · human (final call).


Recommended Reference Documents (Project Knowledge — Not Yet Created)
Membership Rules — full detail behind plan IDs 2, 3, 18, 19, 23, 26, 27, 29, 31, 33: what's included per tier, pricing, lead fees.
Lead Workflow Specifications — every trigger → condition → action → follow-up → exception at full implementation detail, including the ZIP-matching/cascade logic from Workflow 4.
Approved Communications — exact copy for every patient email, doctor lead notification, reminder, expiration notice (both parties), decline/accept message, and member-support response.
Dashboard Specification — every field, status, filter, and alert at full detail, building on the status-mapping table in Workflow 8.
System Documentation — how BD, GHL, Zapier/webhooks, and the eventual DMG operating system actually connect (auth, endpoints, sync direction, failure handling), including the radius-lookup logic needed for Workflow 4's ZIP matching.



For implementation: See the accompanying Upwork brief for the project overview intended for contractor handoff, and the Recommended Reference Documents above for detail that should be filled in as build-phase documentation (exact communication copy, dashboard field specs, and system connection details).

