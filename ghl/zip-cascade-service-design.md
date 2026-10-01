# ZIP Cascade Automation Service — Design Document

**Status:** DESIGN — awaiting approval before build
**Created:** Sept 30, 2026

---

## Goal

When a patient lead goes unanswered (72hr) or declined, automatically re-match it to up to 5
nearby doctors in BD, and tell GHL who those doctors are so they can be enrolled in a
reminder sequence.

---

## 1. BD API Credentials & Scopes

**Where to get them:**
BD Admin → Developer Hub → Generate API Key

**Authentication:**
All requests use `X-Api-Key` header with the generated token.

**Permissions required:**
BD Admin → Developer Hub → [Your API Key] → Actions → Permissions
- Leads: Read, Match
- Users: Read (to query doctors by location/plan)

**Example request:**
```bash
curl -X GET 'https://uppercervicalcare.com/api/v2/leads/get/123' \
  -H 'X-Api-Key: YOUR_API_KEY'
```

**Source:** [BD API Overview](https://support.brilliantdirectories.com/support/solutions/articles/12000088887-api-overview-and-testing-the-api-from-admin-area)

---

## 2. POST /api/v2/leads/match on Expired Leads

**Endpoint:** `POST /api/v2/leads/match`

**Parameters:**
```json
{
  "lead_id": "9630",
  "users_to_match": "doctor1@example.com,doctor2@example.com"
}
```

**What it does:** Adds new matches to the specified lead. Original matches remain.

### ⚠️ OPEN QUESTION

**Does this work on a lead whose original matches have expired or been declined?**

The documentation does not explicitly address this. The lead has a `status` field (numeric),
but status values are not documented.

**Recommendation:** Test manually before building:
1. Find an expired lead in BD admin
2. Try POST /api/v2/leads/match via API tester in Developer Hub
3. Confirm the new doctors receive notifications

**Source:** [Leads API Documentation](https://support.brilliantdirectories.com/support/solutions/articles/12000091106-leads-api-how-to-edit-lead-data-with-api-calls)

---

## 3. Getting Candidate Doctors Within 50 Miles

### What BD API Offers

**GET /api/v2/user/get** — list/filter members

Can filter by:
- `subscription_id` (plan ID)
- `city`, `state_code`, `country_code`
- `active` status

**Cannot filter by:** radius, lat/lng proximity

**Source:** [listUsers MCP Tool](https://glama.ai/mcp/servers/brilliantdirectories/brilliant-directories-mcp/tools/listUsers)

### ⚠️ OPEN QUESTION

**Does BD expose a member search by proximity via API?**

The `/search` endpoint exists for frontend use with an `address` parameter, but:
- Full API access is unclear
- May require "Pretty URL advanced setup"
- Radius parameter not documented in API context

**Source:** [How to Search Members via API](https://support.brilliantdirectories.com/support/solutions/articles/12000102884-how-to-search-for-members-through-the-api)

### Fallback: Compute Distance Ourselves

If no proximity API exists:

1. **Pull all active doctors** with GET /api/v2/user/get
   - Filter: `active=1` and `subscription_id` in Level 2+ or Annual/Unverified plans
   - Response includes: `user_id`, `email`, `subscription_id`, `city`, `state_code`

2. **Get doctor coordinates** — each user record should have lat/lng (needs verification)

3. **Exclude 0,0 coordinates** — members with `lat=0.00, lng=0.00` are invisible to matching

4. **Compute Haversine distance** from patient coordinates to each doctor

5. **Sort by distance**, take nearest 5 within 50 miles

6. **Prioritize by tier:**
   - First: Level 2+ (plans 2, 18, 19, 23, 26, 27, 29, 33)
   - Fallback: Annual/Unverified (plans 3, 31) if no Level 2+ within radius

**Performance note:** ~700-900 doctors in directory. Fetching all and computing distance
is acceptable for cascade frequency (a few per day). Cache doctor list if needed.

---

## 4. Getting Patient Coordinates

### Option A: From Lead Accept/Decline Payload (already have)

The accept/decline webhook payload includes:
```json
{
  "lead": {
    "lat": "27.7676",
    "lng": "-82.6403",
    "lead_location": "33701"
  }
}
```

**Problem:** Cascade triggers on expiration (no accept/decline), so we may not have this.

### Option B: GET /api/v2/leads/get/{lead_id}

Response includes:
```json
{
  "lat": "37.09024",
  "lng": "-95.712891",
  "lead_location": "United States"
}
```

**This is the reliable path.** Service fetches lead by ID to get coordinates.

### Option C: Geocode the text location

If lat/lng are null/zero, geocode `lead_location` (ZIP or city) via Google Maps API.

**Recommendation:** Option B first, fall back to C if coordinates are 0,0.

---

## 5. Where the Service Runs

### Recommendation: Cloudflare Workers

| Criteria | Cloudflare Workers |
|----------|-------------------|
| Cost | Free tier: 100k requests/day |
| Complexity | Single JS file, no server management |
| Latency | Edge deployment, fast |
| UCC ownership | Easy transfer (Cloudflare account) |
| Secrets | Workers Secrets for API keys |

**Alternative:** AWS Lambda + API Gateway
- More powerful, but more complex
- Higher learning curve for UCC team

**Alternative:** Simple Node.js on Railway/Render
- Easy to understand
- $5-10/month
- Traditional server model

### My Recommendation

**Cloudflare Workers** — simplest, cheapest, easiest to transfer.

The service is stateless (receives webhook, calls BD API, calls GHL webhook, done).
No database needed. Perfect fit for edge functions.

---

## 6. Exact Payloads

### GHL → Service (Cascade Trigger)

Sent by Patient Expiration Watch or Patient Watch Stop via Custom Webhook action.

```json
{
  "event": "cascade_trigger",
  "lead_id": "9630",
  "patient_email": "patient@example.com",
  "patient_name": "John Smith",
  "patient_phone": "555-123-4567",
  "patient_location": "33701",
  "original_doctor_email": "drsmith@clinic.com",
  "opportunity_id": "opp_abc123",
  "trigger_reason": "expired" | "declined"
}
```

### Service → BD API

**Step 1: Get lead coordinates**
```
GET /api/v2/leads/get/9630
→ Extract lat, lng
```

**Step 2: Get candidate doctors** (if no proximity API)
```
GET /api/v2/user/get?property=active&property_value=1
→ Filter by subscription_id, compute distance, sort
```

**Step 3: Match lead to doctors**
```
POST /api/v2/leads/match
{
  "lead_id": "9630",
  "users_to_match": "dr1@clinic.com,dr2@clinic.com,dr3@clinic.com"
}
```

### Service → GHL (Cascade Result)

Sent to a new GHL Inbound Webhook trigger.

```json
{
  "event": "cascade_matched",
  "lead_id": "9630",
  "patient_email": "patient@example.com",
  "opportunity_id": "opp_abc123",
  "matched_doctors": [
    {
      "email": "dr1@clinic.com",
      "name": "Dr. Jane Baker",
      "tier": "level2",
      "distance_miles": 12.4
    },
    {
      "email": "dr2@clinic.com",
      "name": "Dr. Bob Wilson",
      "tier": "annual",
      "distance_miles": 23.1
    }
  ],
  "has_level2": true,
  "match_count": 5
}
```

**GHL workflow branches on `has_level2`:**
- `true` → Set opportunity to Accepted immediately, stop patient emails
- `false` → Normal 48hr accept window applies

---

## 7. Failure Handling

### No Eligible Doctors Within 50 Miles

**Service → GHL:**
```json
{
  "event": "cascade_failed",
  "lead_id": "9630",
  "patient_email": "patient@example.com",
  "opportunity_id": "opp_abc123",
  "reason": "no_doctors_in_radius",
  "searched_radius_miles": 50
}
```

**GHL workflow:**
- Update opportunity stage → "Cascade Failed - No Doctors"
- Send patient email: "We couldn't find doctors near you. Please search our directory."
- Tag: `cascade-no-match`
- Optionally: Slack alert to Constansa for manual intervention

### BD API Error

**Service → GHL:**
```json
{
  "event": "cascade_error",
  "lead_id": "9630",
  "error": "BD API returned 500",
  "retry_eligible": true
}
```

**GHL workflow:**
- Tag: `cascade-error`
- Slack alert for manual review

### Lead Already Has Active Matches

If BD returns error because lead has active (non-expired) matches:

**Service → GHL:**
```json
{
  "event": "cascade_skipped",
  "lead_id": "9630",
  "reason": "active_matches_exist"
}
```

---

## Open Questions Summary

| # | Question | Impact | How to Resolve |
|---|----------|--------|----------------|
| 1 | Does POST /api/v2/leads/match work on expired leads? | Blocking | Test manually in BD API tester |
| 2 | Does BD expose proximity search via API? | Architecture | Test /search endpoint with address param |
| 3 | Do user records include lat/lng coordinates? | Distance calc | Check GET /api/v2/user/get response |
| 4 | What are the lead status values? | Logic | Check BD docs or test |

---

## File Structure (after approval)

```
ucc-automation-os/
├── code/
│   └── zip-cascade-service/
│       ├── index.js          # Cloudflare Worker entry point
│       ├── wrangler.toml     # Cloudflare config (no secrets)
│       ├── lib/
│       │   ├── bd-api.js     # BD API client
│       │   ├── ghl-webhook.js # GHL webhook sender
│       │   ├── distance.js   # Haversine calculation
│       │   └── tier-logic.js # Plan ID → tier mapping
│       └── README.md         # Setup & deployment guide
├── ghl/
│   └── zip-cascade-service-design.md  # This document
```

---

## Next Steps (after approval)

1. Resolve open questions 1-4 via BD API testing
2. Create Cloudflare account (or choose alternative)
3. Build service
4. Create GHL workflows:
   - Cascade Trigger (fires Custom Webhook to service)
   - Cascade Result Handler (receives match results)
   - Cascade Failure Handler
5. Test end-to-end with a real expired lead
6. Document deployment in README

---

*Awaiting approval before build.*
