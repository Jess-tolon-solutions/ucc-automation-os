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

// Timeout for outbound webhook calls (ms)
const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Plan IDs for Level 2+ (full access, auto-accept)
// Only these tiers are eligible for cascade matching
const LEVEL2_PLANS = ['2', '18', '19', '23', '26', '27', '29', '33'];

// Search radius in miles
const RADIUS_MILES = 50;

// Bounding box padding in degrees (1 degree ≈ 69 miles latitude, ~53 miles longitude at 40°N)
// Using 1.0 degrees gives ~70 mile box, safely larger than 50 mile radius
const BBOX_PADDING_DEG = 1.0;

// Cache TTL for member list (25 hours - overlaps daily cron)
const MEMBER_CACHE_TTL = 25 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // POST /cache/rebuild - Manual cache rebuild (for initial population)
    if (request.method === 'POST' && url.pathname === '/cache/rebuild') {
      return handleCacheRebuild(env);
    }

    // GET /cache/status - Check cache status
    if (request.method === 'GET' && url.pathname === '/cache/status') {
      return handleCacheStatus(env);
    }

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
  },

  // Cron trigger - runs daily at 3am UTC
  async scheduled(event, env, ctx) {
    console.log('Cron trigger: rebuilding member cache');
    await rebuildMemberCache(env);
    console.log('Cron trigger: cache rebuild complete');
  }
};

/**
 * Handle GET /r/:lead_id - Short URL, looks up lead from BD
 * Returns confirmation page immediately, runs cascade in background
 */
async function handleShortReroute(lead_id, env, ctx) {
  if (!lead_id) {
    return new Response(renderErrorPage('Missing lead information'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Return confirmation immediately - cascade runs in background
  ctx.waitUntil(runShortRouteCascade(lead_id, env, ctx));

  return new Response(renderConfirmationPage({ status: 'processing' }), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/**
 * Background cascade for /r/:lead_id route
 */
async function runShortRouteCascade(lead_id, env, ctx) {
  try {
    console.log(`Background cascade starting for lead ${lead_id}`);
    const bdClient = new BDClient(env.BD_API_KEY);
    const lead = await bdClient.getLead(lead_id);

    await handleCascade({
      lead_id,
      lead_email: lead.lead_email,
      lat: lead.lat,
      lng: lead.lng
    }, env, ctx);

    console.log(`Background cascade completed for lead ${lead_id}`);
  } catch (error) {
    console.error(`Background cascade failed for lead ${lead_id}:`, error.message);
  }
}

/**
 * Handle GET /reroute - Patient clicks email link
 * Returns confirmation page immediately, runs cascade in background
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

  // Return confirmation immediately - cascade runs in background
  ctx.waitUntil(handleCascade({
    lead_id,
    lead_email: email,
    lat,
    lng
  }, env, ctx).catch(err => {
    console.error(`Background cascade failed for lead ${lead_id}:`, err.message);
  }));

  return new Response(renderConfirmationPage({ status: 'processing' }), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
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
  // Page always shows optimistic message - actual matching happens in background
  const statusMessage = "We're reaching out to doctors near you. If we find a match, they'll be in touch shortly.";

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

  // Get members from KV cache (never crawls BD inline)
  const members = await getCachedMembers(env);
  if (!members) {
    // Cache empty - cannot proceed with cascade
    return await sendGHLCallback(env.GHL_WEBHOOK_URL, {
      lead_id,
      email: lead_email,
      lead_email,
      matched_doctor_emails: [],
      has_level2: false,
      match_count: 0,
      status: 'error',
      error_message: 'Member cache is empty - run POST /cache/rebuild'
    });
  }
  console.log(`Loaded ${members.length} members from cache`);

  // Get existing matches for this lead to exclude
  const existingMatches = await getExistingMatches(bdClient, lead_id);
  const excludeUserIds = new Set(existingMatches.map(m => m.user_id));
  console.log(`Excluding ${excludeUserIds.size} existing matches`);

  // Bounding box for fast geographic pre-filter (avoids haversine on distant members)
  const minLat = leadLat - BBOX_PADDING_DEG;
  const maxLat = leadLat + BBOX_PADDING_DEG;
  const minLng = leadLng - BBOX_PADDING_DEG;
  const maxLng = leadLng + BBOX_PADDING_DEG;

  // Filter to eligible, active members within bounding box
  const eligibleMembers = members.filter(m => {
    // Must be active
    if (m.active !== '2' && m.active !== '1') return false;

    // Must be Level 2+ plan
    const planId = String(m.subscription_id);
    if (!LEVEL2_PLANS.includes(planId)) return false;

    // Must have valid coordinates
    const memberLat = parseFloat(m.lat);
    const memberLon = parseFloat(m.lon);
    if (!isValidCoordinate(memberLat, memberLon)) return false;

    // Bounding box pre-filter (fast, avoids haversine on most members)
    if (memberLat < minLat || memberLat > maxLat) return false;
    if (memberLon < minLng || memberLon > maxLng) return false;

    // Must not already be matched to this lead
    if (excludeUserIds.has(String(m.user_id))) return false;

    return true;
  });

  console.log(`${eligibleMembers.length} members in bounding box after filtering`);

  // Calculate exact distances using haversine (now on smaller subset)
  const membersWithDistance = eligibleMembers.map(m => {
    const memberLat = parseFloat(m.lat);
    const memberLon = parseFloat(m.lon);
    const distance = haversineDistance(leadLat, leadLng, memberLat, memberLon);

    return {
      user_id: m.user_id,
      email: m.email,
      first_name: m.first_name,
      last_name: m.last_name,
      plan_id: String(m.subscription_id),
      distance_miles: distance
    };
  }).filter(m => m.distance_miles <= RADIUS_MILES);

  console.log(`${membersWithDistance.length} Level 2+ members within ${RADIUS_MILES} miles`);

  // Sort by distance (nearest first)
  membersWithDistance.sort((a, b) => a.distance_miles - b.distance_miles);

  // Select exactly ONE Level 2+ member (nearest)
  const selectedMembers = membersWithDistance.slice(0, 1);

  if (selectedMembers.length > 0) {
    console.log(`Selected Level 2+ member: ${selectedMembers[0].email}`);
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
  await sendDoctorNotices(env.DOCTOR_NOTICE_WEBHOOK_URL, lead_id, selectedMembers);

  // Send callback to GHL
  // All matched doctors are Level 2+ (only tier eligible for cascade)
  const result = {
    lead_id,
    email: lead_email,
    lead_email,
    matched_doctor_emails: emailsToMatch,
    matched_doctors: selectedMembers.map(m => ({
      email: m.email,
      name: `${m.first_name} ${m.last_name}`.trim(),
      distance_miles: Math.round(m.distance_miles * 10) / 10,
      tier: 'level2'
    })),
    has_level2: true,
    match_count: selectedMembers.length,
    status: 'matched'
  };

  await sendGHLCallback(env.GHL_WEBHOOK_URL, result);

  return result;
}

/**
 * Get members from KV cache ONLY - never crawls BD inline
 * Returns null if cache is empty/expired
 */
async function getCachedMembers(env) {
  if (!env.MEMBER_CACHE) {
    console.error('MEMBER_CACHE KV namespace not bound');
    return null;
  }

  const cached = await env.MEMBER_CACHE.get('all_members', { type: 'json' });
  if (cached) {
    console.log(`Using cached member list (${cached.length} members)`);
    return cached;
  }

  console.error('Member cache is empty or expired - cascade cannot proceed');
  return null;
}

/**
 * Rebuild member cache from BD API (used by cron and manual trigger)
 * Stores only fields needed for cascade to stay under KV 25MB limit
 */
async function rebuildMemberCache(env) {
  if (!env.MEMBER_CACHE) {
    throw new Error('MEMBER_CACHE KV namespace not bound');
  }

  const bdClient = new BDClient(env.BD_API_KEY);
  console.log('Fetching member list from BD API...');
  const members = await bdClient.getAllMembers();
  console.log(`Fetched ${members.length} members from BD API`);

  // Trim to only fields needed for cascade (reduces ~28MB to ~200KB)
  const slimMembers = members.map(m => ({
    user_id: m.user_id,
    email: m.email,
    first_name: m.first_name || '',
    lat: m.lat,
    lon: m.lon,
    subscription_id: m.subscription_id,
    active: m.active
  }));

  const payload = JSON.stringify(slimMembers);
  console.log(`Slim payload size: ${(payload.length / 1024).toFixed(1)} KB`);

  await env.MEMBER_CACHE.put('all_members', payload, {
    expirationTtl: MEMBER_CACHE_TTL
  });

  console.log(`Cached ${slimMembers.length} members with TTL ${MEMBER_CACHE_TTL}s`);
  return slimMembers.length;
}

/**
 * Handle POST /cache/rebuild - Manual cache rebuild
 */
async function handleCacheRebuild(env) {
  try {
    const count = await rebuildMemberCache(env);
    return new Response(JSON.stringify({
      status: 'success',
      member_count: count,
      ttl_seconds: MEMBER_CACHE_TTL
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Cache rebuild failed:', error.message);
    return new Response(JSON.stringify({
      status: 'error',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle GET /cache/status - Check cache status
 */
async function handleCacheStatus(env) {
  if (!env.MEMBER_CACHE) {
    return new Response(JSON.stringify({
      status: 'error',
      error: 'MEMBER_CACHE not bound'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cached = await env.MEMBER_CACHE.get('all_members', { type: 'json' });
  return new Response(JSON.stringify({
    status: 'ok',
    cached: cached !== null,
    member_count: cached ? cached.length : 0
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
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
async function sendDoctorNotices(webhookUrl, lead_id, doctors) {
  if (!webhookUrl) {
    console.log('No doctor notice webhook URL configured, skipping');
    return;
  }

  if (!doctors || doctors.length === 0) {
    return;
  }

  console.log(`Sending doctor notices for lead ${lead_id} to ${doctors.length} doctors`);

  for (const doctor of doctors) {
    try {
      const response = await fetchWithTimeout(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: doctor.email,
          first_name: doctor.first_name || '',
          lead_id: lead_id
        })
      });

      console.log(`Doctor notice to ${doctor.email}: ${response.status}`);
    } catch (error) {
      console.error(`Doctor notice to ${doctor.email} failed:`, error.message);
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
    const response = await fetchWithTimeout(webhookUrl, {
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
    console.error('GHL callback error:', error.message);
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
