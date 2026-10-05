# ZIP Cascade Service

Cloudflare Worker that handles the ZIP cascade lead matching for UpperCervicalCare.com.

When a patient chooses to be rerouted to another doctor, this worker finds nearby doctors
in the BD directory and matches them to the lead, then calls back to GHL with the results.

## Endpoints

### GET /reroute (Patient-facing)

Used directly in patient emails as a button link. Avoids GHL trigger link dependency.

```
https://zip-cascade.ucc-automation.workers.dev/reroute?lead_id=123&lat=33.30&lng=-111.84&email=patient@example.com
```

**Query params:** `lead_id` (required), `lat`, `lng`, `email`

**Returns:** HTML confirmation page ("We're On It")

### POST / (GHL webhook)

JSON API for GHL workflow integration.

**Returns:** JSON with match results

## How It Works

1. **Input**: GET /reroute (patient click) or POST / (GHL webhook)
2. **Fetch members**: Pull all BD members (cached for 24 hours)
3. **Filter by distance**: Haversine calculation, keep members within 50 miles
4. **Exclude existing matches**: Don't re-match to doctors already on this lead
5. **Selection rule**:
   - If any Level 2+ doctors in range → match **exactly 1** (nearest)
   - Otherwise → match up to **5 Annual/Unverified** (nearest first)
6. **Match via BD API**: POST /api/v2/leads/match
7. **Callback to GHL**: Report results so GHL can update the opportunity
8. **Response**: HTML page (GET) or JSON (POST)

## Why Level 2+ Gets Only One Match

Level 2+ doctors receive full patient info immediately (auto-accept). If we matched
5 Level 2+ doctors, all 5 practices would call the same patient. That's a bad patient
experience. One doctor = one call.

Annual/Unverified doctors must pay $50 to accept, so only serious interest responds.
Matching up to 5 is fine.

## Why `has_level2` Matters

When a Level 2+ doctor is auto-matched, BD does NOT fire an accept/decline webhook.
GHL would never know the patient was connected. The worker reports `has_level2: true`
so GHL can:
- Mark the opportunity as Accepted
- Stop the patient waiting sequence
- Skip the "we couldn't find anyone" email

## Setup

### 1. Install Wrangler

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Install Dependencies

```bash
cd code/zip-cascade-service
npm install
```

### 4. Set Secrets

```bash
wrangler secret put BD_API_KEY
# Paste the BD API key when prompted

wrangler secret put GHL_WEBHOOK_URL
# Paste the GHL inbound webhook URL when prompted
```

### 5. (Optional) Create KV Cache

For better performance, create a KV namespace to cache the member list:

```bash
wrangler kv:namespace create "MEMBER_CACHE"
```

Copy the ID from the output and add to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MEMBER_CACHE"
id = "<YOUR_KV_NAMESPACE_ID>"
```

### 6. Deploy

```bash
npm run deploy
```

The worker URL will be displayed, e.g.:
`https://zip-cascade.<your-subdomain>.workers.dev`

## Local Development

```bash
npm run dev
```

Test with:
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"9602","lat":"33.3061","lng":"-111.84"}'
```

## Input Payload (from GHL)

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

## Output Payload (to GHL)

### Success - Match Found

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

## Plan IDs

**Level 2+** (full access, auto-accept):
- 2, 18, 19, 23, 26, 27, 29, 33

**Annual/Unverified** ($50 accept/decline):
- 3 (Unverified Doctor)
- 31 (Level 1 Annual)

## Logs

View live logs:

```bash
npm run tail
```

Or in Cloudflare dashboard: Workers & Pages → zip-cascade → Logs
