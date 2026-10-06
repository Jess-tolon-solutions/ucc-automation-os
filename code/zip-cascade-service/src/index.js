/**
 * ZIP Cascade Worker
 *
 * Receives expired/declined lead notifications from GHL, finds nearby doctors
 * in the BD directory, and matches them to the lead via BD API.
 *
 * Environment variables (set as Worker Secrets):
 * - BD_API_KEY: Brilliant Directories API key
 * - GHL_WEBHOOK_URL: GoHighLevel inbound webhook URL for callbacks
 */

import { haversineDistance } from './haversine.js';
import { BDClient } from './bd-api.js';

// Plan IDs by tier
const LEVEL2_PLANS = ['2', '18', '19', '23', '26', '27', '29', '33'];
const ANNUAL_UNVERIFIED_PLANS = ['3', '31'];
const ALL_ELIGIBLE_PLANS = [...LEVEL2_PLANS, ...ANNUAL_UNVERIFIED_PLANS];

// Search radius in miles
const RADIUS_MILES = 50;

// Cache TTL for member list (1 hour)
const MEMBER_CACHE_TTL = 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // GET /r/:lead_id - Short URL, looks up lead data from BD
    const shortMatch = url.pathname.match(/^\/r\/(\d+)$/);
    if (request.method === 'GET' && shortMatch) {
      return handleShortReroute(shortMatch[1], env, ctx);
    }

    // GET /reroute - Patient-facing endpoint with query params (returns HTML)
    if (request.method === 'GET' && url.pathname === '/reroute') {
      return handleRerouteGet(url, env, ctx);
    }

    // POST / - GHL webhook endpoint (returns JSON)
    if (request.method === 'POST') {
      return handlePost(request, env, ctx);
    }

    // Method not allowed
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Handle GET /r/:lead_id - Short URL, looks up lead from BD
 */
async function handleShortReroute(lead_id, env, ctx) {
  if (!lead_id) {
    return new Response(renderErrorPage('Missing lead information'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  try {
    // Look up lead from BD API
    const bdClient = new BDClient(env.BD_API_KEY);
    const lead = await bdClient.getLead(lead_id);

    const result = await handleCascade({
      lead_id,
      lead_email: lead.lead_email,
      lat: lead.lat,
      lng: lead.lng
    }, env, ctx);

    return new Response(renderConfirmationPage(result), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Short reroute error:', error);
    return new Response(renderErrorPage('Something went wrong. Please try again later.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/**
 * Handle GET /reroute - Patient clicks email link
 */
async function handleRerouteGet(url, env, ctx) {
  const lead_id = url.searchParams.get('lead_id');
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const email = url.searchParams.get('email');

  if (!lead_id) {
    return new Response(renderErrorPage('Missing lead information'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  try {
    const result = await handleCascade({
      lead_id,
      lead_email: email,
      lat,
      lng
    }, env, ctx);

    // Return confirmation page regardless of match outcome
    // (GHL callback handles the workflow logic)
    return new Response(renderConfirmationPage(result), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Reroute error:', error);
    return new Response(renderErrorPage('Something went wrong. Please try again later.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/**
 * Handle POST / - GHL webhook
 */
async function handlePost(request, env, ctx) {
  try {
    const payload = await request.json();
    const result = await handleCascade(payload, env, ctx);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Cascade error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      status: 'error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Render confirmation page HTML
 */
function renderConfirmationPage(result) {
  const statusMessage = result.status === 'no_doctors_in_range'
    ? "We're searching our network for doctors in your area. If we find a match, they'll reach out to you directly."
    : "We're reaching out to doctors near you. You should hear from one shortly.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We're On It | Upper Cervical Care</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8f9fa;
      color: #333;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 48px 40px;
      max-width: 480px;
      text-align: center;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #555;
      margin-bottom: 24px;
    }
    .signature {
      font-size: 14px;
      color: #888;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>We're On It</h1>
    <p>${statusMessage}</p>
    <p>Thank you for your patience.</p>
    <div class="signature">
      — The Upper Cervical Care Team
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render error page HTML
 */
function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error | Upper Cervical Care</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8f9fa;
      color: #333;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 48px 40px;
      max-width: 480px;
      text-align: center;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #555;
    }
    .signature {
      font-size: 14px;
      color: #888;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Oops</h1>
    <p>${message}</p>
    <div class="signature">
      — The Upper Cervical Care Team
    </div>
  </div>
</body>
</html>`;
}

/**
 * Main cascade logic
 */
async function handleCascade(payload, env, ctx) {
  const { lead_id, lead_email, lead_name, lead_location, lat, lng } = payload;

  // Validate required fields
  if (!lead_id) {
    throw new Error('Missing required field: lead_id');
  }

  const bdClient = new BDClient(env.BD_API_KEY);

  // Parse coordinates
  let leadLat = parseFloat(lat);
  let leadLng = parseFloat(lng);

  // If coordinates missing or invalid, fetch from lead
  if (!isValidCoordinate(leadLat, leadLng)) {
    console.log(`Fetching coordinates for lead ${lead_id}`);
    const lead = await bdClient.getLead(lead_id);
    leadLat = parseFloat(lead.lat);
    leadLng = parseFloat(lead.lng);

    if (!isValidCoordinate(leadLat, leadLng)) {
      // No valid coordinates - cannot match by distance
      return await sendGHLCallback(env.GHL_WEBHOOK_URL, {
        lead_id,
        email: lead_email,
        lead_email,
        matched_doctor_emails: [],
        has_level2: false,
        match_count: 0,
        status: 'error',
        error_message: 'Lead has no valid coordinates'
      });
    }
  }

  // Get all members (from cache if available)
  const members = await getCachedMembers(bdClient, env, ctx);
  console.log(`Loaded ${members.length} members`);

  // Get existing matches for this lead to exclude
  const existingMatches = await getExistingMatches(bdClient, lead_id);
  const excludeUserIds = new Set(existingMatches.map(m => m.user_id));
  console.log(`Excluding ${excludeUserIds.size} existing matches`);

  // Filter to eligible, active members with valid coordinates
  const eligibleMembers = members.filter(m => {
    // Must be active
    if (m.active !== '2' && m.active !== '1') return false;

    // Must have eligible plan
    const planId = String(m.subscription_id);
    if (!ALL_ELIGIBLE_PLANS.includes(planId)) return false;

    // Must have valid coordinates
    const memberLat = parseFloat(m.lat);
    const memberLon = parseFloat(m.lon);
    if (!isValidCoordinate(memberLat, memberLon)) return false;

    // Must not already be matched to this lead
    if (excludeUserIds.has(String(m.user_id))) return false;

    return true;
  });

  console.log(`${eligibleMembers.length} eligible members after filtering`);

  // Calculate distances and filter to radius
  const membersWithDistance = eligibleMembers.map(m => {
    const memberLat = parseFloat(m.lat);
    const memberLon = parseFloat(m.lon);
    const distance = haversineDistance(leadLat, leadLng, memberLat, memberLon);
    const planId = String(m.subscription_id);

    return {
      user_id: m.user_id,
      email: m.email,
      first_name: m.first_name,
      last_name: m.last_name,
      plan_id: planId,
      is_level2: LEVEL2_PLANS.includes(planId),
      distance_miles: distance
    };
  }).filter(m => m.distance_miles <= RADIUS_MILES);

  console.log(`${membersWithDistance.length} members within ${RADIUS_MILES} miles`);

  // Sort by distance (nearest first)
  membersWithDistance.sort((a, b) => a.distance_miles - b.distance_miles);

  // Apply selection rule
  let selectedMembers = [];
  const level2InRange = membersWithDistance.filter(m => m.is_level2);

  if (level2InRange.length > 0) {
    // Level 2+ available: select EXACTLY ONE (nearest)
    selectedMembers = [level2InRange[0]];
    console.log(`Selected 1 Level 2+ member: ${level2InRange[0].email}`);
  } else {
    // No Level 2+: select up to 5 Annual/Unverified
    const annualInRange = membersWithDistance.filter(m => !m.is_level2);
    selectedMembers = annualInRange.slice(0, 5);
    console.log(`Selected ${selectedMembers.length} Annual/Unverified members`);
  }

  // No doctors in range
  if (selectedMembers.length === 0) {
    console.log('No doctors in range');
    return await sendGHLCallback(env.GHL_WEBHOOK_URL, {
      lead_id,
      email: lead_email,
      lead_email,
      matched_doctor_emails: [],
      has_level2: false,
      match_count: 0,
      status: 'no_doctors_in_range'
    });
  }

  // Match the lead to selected members
  const emailsToMatch = selectedMembers.map(m => m.email);
  console.log(`Matching lead ${lead_id} to: ${emailsToMatch.join(', ')}`);

  try {
    await bdClient.matchLead(lead_id, emailsToMatch);
  } catch (matchError) {
    console.error('Match API error:', matchError);
    return await sendGHLCallback(env.GHL_WEBHOOK_URL, {
      lead_id,
      email: lead_email,
      lead_email,
      matched_doctor_emails: [],
      has_level2: false,
      match_count: 0,
      status: 'error',
      error_message: `BD match API failed: ${matchError.message}`
    });
  }

  // Success - notify each matched doctor (one POST per doctor)
  await sendDoctorNotices(env.DOCTOR_NOTICE_WEBHOOK_URL, lead_id, emailsToMatch);

  // Send callback to GHL
  const hasLevel2 = selectedMembers.some(m => m.is_level2);

  const result = {
    lead_id,
    email: lead_email,
    lead_email,
    matched_doctor_emails: emailsToMatch,
    matched_doctors: selectedMembers.map(m => ({
      email: m.email,
      name: `${m.first_name} ${m.last_name}`.trim(),
      distance_miles: Math.round(m.distance_miles * 10) / 10,
      tier: m.is_level2 ? 'level2' : 'annual'
    })),
    has_level2: hasLevel2,
    match_count: selectedMembers.length,
    status: 'matched'
  };

  await sendGHLCallback(env.GHL_WEBHOOK_URL, result);

  return result;
}

/**
 * Get members with caching
 */
async function getCachedMembers(bdClient, env, ctx) {
  // Check KV cache if available
  if (env.MEMBER_CACHE) {
    const cached = await env.MEMBER_CACHE.get('all_members', { type: 'json' });
    if (cached) {
      console.log('Using cached member list');
      return cached;
    }
  }

  // Fetch from BD API
  console.log('Fetching member list from BD API');
  const members = await bdClient.getAllMembers();

  // Cache for next time
  if (env.MEMBER_CACHE) {
    ctx.waitUntil(
      env.MEMBER_CACHE.put('all_members', JSON.stringify(members), {
        expirationTtl: MEMBER_CACHE_TTL
      })
    );
  }

  return members;
}

/**
 * Get existing matches for a lead
 */
async function getExistingMatches(bdClient, leadId) {
  try {
    const lead = await bdClient.getLead(leadId);
    const matches = lead.lead_matches;

    if (!matches) return [];
    if (Array.isArray(matches)) return matches;
    if (typeof matches === 'object') return [matches];
    return [];
  } catch (error) {
    console.error('Error fetching existing matches:', error);
    return [];
  }
}

/**
 * Send doctor notice to each matched doctor (one POST per doctor)
 */
async function sendDoctorNotices(webhookUrl, lead_id, doctorEmails) {
  if (!webhookUrl) {
    console.log('No doctor notice webhook URL configured, skipping');
    return;
  }

  if (!doctorEmails || doctorEmails.length === 0) {
    return;
  }

  console.log(`Sending doctor notices for lead ${lead_id} to ${doctorEmails.length} doctors`);

  for (const doctorEmail of doctorEmails) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: doctorEmail,
          lead_id: lead_id
        })
      });

      console.log(`Doctor notice to ${doctorEmail}: ${response.status}`);
    } catch (error) {
      console.error(`Doctor notice to ${doctorEmail} failed:`, error);
    }
  }
}

/**
 * Send callback to GHL webhook
 */
async function sendGHLCallback(webhookUrl, data) {
  if (!webhookUrl) {
    console.log('No GHL webhook URL configured, skipping callback');
    return data;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      console.error(`GHL callback failed: ${response.status}`);
    } else {
      console.log('GHL callback sent successfully');
    }
  } catch (error) {
    console.error('GHL callback error:', error);
  }

  return data;
}

/**
 * Validate coordinates
 */
function isValidCoordinate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}
