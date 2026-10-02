# ZIP Cascade Automation Service — Design Document

**Status:** BUILT — deployed to Cloudflare Workers
**Created:** Sept 30, 2026
**Deployed:** Oct 2, 2026

---

## Goal

When a patient lead expires or is declined, give the patient a choice: wait, or be connected
to another doctor. If they choose reroute, the ZIP Cascade Worker finds nearby doctors in BD
and matches them to the lead.

**Design Change (Oct 2, 2026):** Cascade is NOT automatic at 72hr. The patient receives a
choice email and the Worker fires only when they click "Connect me with another doctor"
(trigger link → Patient Chose Reroute workflow).

---

## Open Questions — RESOLVED

| # | Question | Answer |
|---|----------|--------|
| 1 | Does POST /api/v2/leads/match work on expired/declined leads? | **YES** — tested Oct 2, 2026. Lead 9602 (declined) successfully matched to ZZTest2 via API. New match created with `lead_matched_by: "API"`, `lead_status: 1`. |
| 2 | Does BD expose proximity search via API? | **NO** — we compute Haversine distance ourselves |
| 3 | Do user records include lat/lng coordinates? | **YES** — fields are `lat` and `lon` (not `lng`). Audit of 1,048 members shows all have valid coordinates. |
| 4 | What are the lead match status values? | 1 = Pending, 2 = Accepted, 3 = Declined |

---

## Selection Rule (Updated)

Original design said "up to 5 doctors." Billy clarified:

- **Level 2+ in range:** Match **EXACTLY ONE** (nearest). Level 2+ gets instant full delivery
  (auto-accept), so matching multiple means multiple practices calling the same patient.
- **No Level 2+ in range:** Match **up to 5 Annual/Unverified** (nearest first). They must pay
  $50 to accept, so only serious interest responds.

---

## Why `has_level2` Matters

When a Level 2+ doctor is auto-matched, BD does **NOT** fire an accept/decline webhook.
GHL would never know the patient was connected. The worker reports `has_level2: true` so GHL can:
- Mark the opportunity as Accepted
- Stop the patient waiting sequence
- Skip the "we couldn't find anyone" email

---

## Architecture

```
┌──────────────────┐                              ┌──────────────────────┐
│  Patient         │   clicks "connect me         │                      │
│  Expiration      │   with another doctor"       │  Patient Chose       │
│  Watch           │ ─────────────────────────────▶  Reroute Workflow    │
│  (sends choice   │   (trigger link)             │                      │
│   email at 72hr) │                              └──────────┬───────────┘
└──────────────────┘                                         │
                                                             │ POST cascade_trigger
                                                             ▼
                                              ┌──────────────────────┐
                                              │                      │
                                              │  ZIP Cascade Worker  │
                                              │  (Cloudflare)        │
                                              │                      │
                                              └──────────┬───────────┘
                                                         │
                         ┌───────────────────────────────┼───────────────────┐
                         │                               │                   │
                         ▼                               ▼                   ▼
              ┌─────────────────┐            ┌─────────────────┐   ┌─────────────────┐
              │  BD API         │            │  GHL Webhook    │   │  GHL Workflow   │
              │  - GET members  │            │  (callback)     │   │  (handles       │
              │  - GET lead     │            │                 │   │   result)       │
              │  - POST match   │            └─────────────────┘   └─────────────────┘
              └─────────────────┘
```

---

## 1. BD API Credentials

**API Key Name:** "Claude for BD"
**Key Location:** BD Admin → Developer Hub → API Keys
**Authentication:** `X-Api-Key` header

**Permissions required:**
- Leads: Read, Match
- Users: Read

**Worker Secret:** `BD_API_KEY` (set via `wrangler secret put BD_API_KEY`)

---

## 2. GHL Webhook

**Inbound Webhook URL:**
```
https://services.leadconnectorhq.com/hooks/o9QyWbMfXVHpNIYVzOI5/webhook-trigger/25063aa2-9437-44e6-9608-2522d09edeb1
```

**Worker Secret:** `GHL_WEBHOOK_URL` (set via `wrangler secret put GHL_WEBHOOK_URL`)

---

## 3. Input Payload (GHL → Worker)

```json
{
  "lead_id": "9602",
  "lead_email": "patient@example.com",
  "lead_name": "John Smith",
  "lead_location": "Chandler, AZ",
  "lat": "33.3061605",
  "lng": "-111.8412502",
  "checkPageType": "cascade_trigger"
}
```

If `lat`/`lng` missing or invalid, worker fetches from BD lead record.

---

## 4. Output Payload (Worker → GHL)

### Success — Match Found

```json
{
  "lead_id": "9602",
  "lead_email": "patient@example.com",
  "matched_doctor_emails": ["doctor@clinic.com"],
  "matched_doctors": [
    {
      "email": "doctor@clinic.com",
      "name": "Dr. Jane Smith",
      "distance_miles": 12.4,
      "tier": "level2"
    }
  ],
  "has_level2": true,
  "match_count": 1,
  "status": "matched"
}
```

### No Doctors in Range

```json
{
  "lead_id": "9602",
  "lead_email": "patient@example.com",
  "matched_doctor_emails": [],
  "has_level2": false,
  "match_count": 0,
  "status": "no_doctors_in_range"
}
```

### Error

```json
{
  "lead_id": "9602",
  "lead_email": "patient@example.com",
  "matched_doctor_emails": [],
  "has_level2": false,
  "match_count": 0,
  "status": "error",
  "error_message": "Lead has no valid coordinates"
}
```

---

## 5. GHL Workflow Logic

### Trigger Flow

1. **Patient Expiration Watch** (72hr after lead created):
   - Sends patient a choice email with two trigger links:
     - "Connect me with another doctor" → triggers **Patient Chose Reroute** workflow
     - "I'll wait" / no action → lead stays in current state

2. **Patient Chose Reroute** workflow:
   - Triggered by patient clicking the reroute link
   - Calls ZIP Cascade Worker via Custom Webhook
   - Passes: `lead_id`, `lead_email`, `lat`, `lng` (from contact custom fields)

3. **Cascade Result Handler** (inbound webhook from Worker):

| `status` | `has_level2` | GHL Action |
|----------|--------------|------------|
| `matched` | `true` | Move opportunity to "Accepted" stage, send confirmation |
| `matched` | `false` | Move to "Rerouted - Round 2", start 48hr cascade wait |
| `no_doctors_in_range` | — | Move to "Cascade Failed", send directory email to patient |
| `error` | — | Tag `cascade-error`, alert for manual review |

### Required Contact Custom Fields

Create in B2C sub-account, folder "Lead Automation":
- `lead_id` (text) — BD lead ID
- `lead_lat` (text) — patient latitude
- `lead_lng` (text) — patient longitude

These fields are populated when the lead is created and passed to the Worker.

---

## 6. Plan IDs

**Level 2+** (full access, auto-accept):
- 2, 18, 19, 23, 26, 27, 29, 33

**Annual/Unverified** ($50 accept/decline):
- 3 (Unverified Doctor)
- 31 (Level 1 Annual)

---

## 7. File Structure

```
ucc-automation-os/
├── code/
│   └── zip-cascade-service/
│       ├── src/
│       │   ├── index.js      # Worker entry point
│       │   ├── haversine.js  # Distance calculation
│       │   └── bd-api.js     # BD API client
│       ├── wrangler.toml     # Cloudflare config
│       ├── package.json
│       └── README.md         # Setup & deployment guide
├── ghl/
│   └── zip-cascade-service-design.md  # This document
```

---

## 8. Deployment

### Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### Deploy

```bash
cd code/zip-cascade-service
npm install
wrangler secret put BD_API_KEY      # Paste BD API key
wrangler secret put GHL_WEBHOOK_URL # Paste GHL webhook URL
npm run deploy
```

### Worker URL

**Production URL:**
```
https://zip-cascade.ucc-automation.workers.dev
```

This URL goes into the GHL workflow's Custom Webhook action.

---

## 9. Testing

### Local

```bash
npm run dev
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"9602","lat":"33.3061","lng":"-111.84"}'
```

### Production

Use a test lead (e.g., from ZZTEST) that has been declined or expired.

---

## 10. Monitoring

View live logs:
```bash
npm run tail
```

Or: Cloudflare Dashboard → Workers & Pages → zip-cascade → Logs

---

*Built and deployed Oct 2, 2026.*
