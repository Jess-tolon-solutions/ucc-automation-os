# Build Status

Current state of UCC Automation OS implementation. Updated as work completes.

**Last updated:** Sep 23, 2026

---

## Summary

| Lane | Status | Notes |
|------|--------|-------|
| B2B (Workflows 5–6) | **LIVE** | BD webhook → GHL Directory → pipelines + Slack + contacts |
| D2C Reminders (Workflow 2–3) | **DRAFT** | Both workflows built in B2C, pending test |
| Expiration + Patient Loop | NOT STARTED | Depends on reminder workflow |
| ZIP Fallback Cascade (Workflow 4) | NOT STARTED | Blocked by Maximum Matches decision |
| Dashboard (Workflow 8–9) | NOT STARTED | |

---

## Completed

### B2B Lane (Sep 20, 2026)
- [x] Slack #b2b-inquiries channel created
- [x] BD built-in "Contact Us Form Submitted" webhook configured
- [x] GHL Directory workflow: B2B Inquiry Router
  - [x] Inbound webhook trigger receiving BD payload
  - [x] If/Else branch on `inquirer_type`
  - [x] Branch 1: Existing Member → Create/Update Contact → tag `b2b-member-support` → pipeline + ack email
  - [x] Branch 2: Prospective Doctor → Create/Update Contact → tag `b2b-prospective` → pipeline + ack email + nurture
  - [x] Else branch: Create/Update Contact → tag `patient-inquiry` → Slack alert (no pipeline)
  - [x] Slack webhook posts on all branches
- [x] End-to-end tested in production
- [x] **Sep 20 update:** Added Create/Update Contact + tag actions on all branches — every submission now creates a tagged GHL contact

### BD Event Discovery (Sep 20, 2026)
- [x] Confirmed BD built-in events available in Developer Hub:
  - `Contact Us Form Submitted` — real-time, used for B2B
  - `Lead Submitted` (`bootstrap_get_match`) — real-time, for D2C
  - `Lead Accept / Decline` — single event, stop condition for reminders
  - `One-Time Purchase` — $50 payment tracking
- [x] Determined smart-list webhooks are batch-only (not usable for real-time triggers)
- [x] **Sep 20:** Payload schema confirmed via inbound webhook: Lead Id, Doctor Id, Doctor Email, Doctor First Name, Action, Action Timestamp, Plan Id

### D2C Copy (Sep 20, 2026)
- [x] `doctor-reminder-24hr.md` — drafted
- [x] `doctor-reminder-48hr.md` — drafted
- [x] `doctor-reminder-72hr.md` (expiration notice) — drafted
- [ ] All copy sent for Billy approval

---

## In Progress

### D2C Lead Reminder Sequence (Workflows 2–3)

**Workflow 1 — Lead Reminder Sequence:** DRAFT in B2C (Upper Cervical Care)

- [x] Rebuilt in correct B2C account (Directory copy deleted)
- [x] Inbound webhook trigger for Lead Submitted
- [x] Field mappings corrected to real BD names (`member_email`, `member_first_name`)
- [x] Branch on `tier-annual` tag (replaces plan_id — not in payload)
- [x] For Annual/Unverified: reminder sequence
  - [x] Tag contact `pending-lead`
  - [x] Wait 24hr → send reminder 1
  - [x] Wait 24hr → send reminder 2 (48hr total)
  - [x] Wait 24hr → send expiration notice (72hr total)
- [x] Email templates created from drafted copy
- [x] SMS templates created from drafted copy
- [x] 150 Annual/Unverified members bulk-tagged with `tier-annual` via API
- [x] **FIXED:** BD v2 form template (`copy_of_bootstrap_get_match`) now wired to same webhook
- [x] Workflow tested end-to-end: lead → tier check passes → `pending-lead` tag added
- [ ] Add opportunity creation (Patient Leads pipeline, lead_id in name)

**Workflow 2 — Lead Accept Decline Handler:** DRAFT in B2C (Upper Cervical Care)

- [x] Inbound webhook trigger wired to BD Lead Accept / Decline event
- [x] Create/Update Contact (Email ← Doctor Email, First Name ← Doctor First Name)
- [x] Remove From Workflow (targeting Lead Reminder Sequence)
- [x] Remove Tag `pending-lead`
- [x] If/Else on Action field (contains "accept" / contains "decline")
- [x] Accept branch: add `lead-accepted` tag
- [x] Decline branch: add `lead-declined` tag
- [ ] Update opportunity stages (needs opportunity creation in Workflow 1 first)
- [ ] Decline branch placeholder for Workflow 4 cascade

**BD side:**
- [x] Lead Accept / Decline event enabled in Developer Hub
- [ ] Repoint Lead Submitted webhook from Directory to B2C account

**Go-live:**
- [ ] Compressed-timer end-to-end test
- [ ] Switch to production timers
- [ ] Repoint BD Lead Submitted webhook

---

## Tomorrow (Sep 21, 2026)

1. **Create ZZTEST doctor in BD** — Annual plan, plus-addressed email (e.g. jess+zztest@...), remote ZIP so no real doctors match
2. **Submit test lead, decline via Login as Member** — verify Action field's actual values in GHL execution log
3. **Compressed-timer end-to-end test:** lead → reminder 1 fires → decline → confirm reminder 2 never sends
4. **Repoint Lead Submitted webhook** to B2C reminder workflow URL (if not already done)
5. **Billy's Monday update** — schedule/send with the three reminder emails for copy approval

---

## Not Started

### Expiration Handling + Patient Loop
- [ ] Patient expiration notice (`patient-lead-expired.md`)
- [ ] Route to Find-a-Doctor or ZIP fallback cascade

### ZIP Fallback Cascade (Workflow 4)
- **BLOCKED:** Awaiting Billy decision on Maximum Matches (see decision log)
- [ ] Radius lookup logic
- [ ] 48hr cascade windows
- [ ] 2-backup limit then Exception

### Dashboard / Tracking (Workflows 8–9)
- [ ] Pipeline structure for lead lifecycle
- [ ] Exception queue
- [ ] Reporting views

### Cleanup
- [ ] Fix "jordan" template bug in BD
- [ ] Audit/clear 922 items in BD Forms Inbox

---

## Open Questions for Billy

1. **Maximum Matches = 5 vs exclusive cascade** — BD allows up to 5 doctors to match
   the same lead. Spec assumes one-doctor sequential cascade. Which model?

---

## Platform Credentials / Access

| System | Access | Notes |
|--------|--------|-------|
| BD Admin | Via Jess UCC login | Developer Hub webhooks |
| GHL Directory | Via Jess | B2B workflows live here |
| GHL B2C | Via Jess | D2C workflows will live here |
| Slack | #b2b-inquiries | Constansa's alert channel |
| Zapier | Billy's account | Bridge layer if needed |
