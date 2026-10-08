/**
 * Brilliant Directories API Client
 *
 * Handles all communication with the BD API for the ZIP Cascade service.
 */

const BD_BASE_URL = 'https://www.uppercervicalcare.com/api/v2';
const FETCH_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
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
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class BDClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('BD API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Make an authenticated request to BD API
   */
  async request(method, endpoint, body = null) {
    const url = `${BD_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'X-Api-Key': this.apiKey,
        'Accept': 'application/json'
      }
    };

    if (body && method !== 'GET') {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = new URLSearchParams(body).toString();
    }

    console.log(`BD API ${method} ${endpoint}`);
    const response = await fetchWithTimeout(url, options);

    if (!response.ok) {
      throw new Error(`BD API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error(`BD API returned error: ${JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Get a single lead by ID
   */
  async getLead(leadId) {
    const data = await this.request('GET', `/leads/get/${leadId}`);
    const leads = data.message || [];

    if (leads.length === 0) {
      throw new Error(`Lead ${leadId} not found`);
    }

    return leads[0];
  }

  /**
   * Get all members with pagination
   *
   * BD API uses property-based pagination: fetch where user_id > last_id
   */
  async getAllMembers() {
    const allMembers = [];
    let lastId = 0;
    let batchNum = 0;
    const maxBatches = 100; // Safety limit

    while (batchNum < maxBatches) {
      batchNum++;
      const endpoint = lastId > 0
        ? `/user/get?property=user_id&property_value=${lastId}&property_operator=%3E`
        : '/user/get';

      const data = await this.request('GET', endpoint);
      const members = data.message || [];

      if (members.length === 0) {
        break;
      }

      allMembers.push(...members);

      // Find max ID in this batch
      const maxId = Math.max(...members.map(m => parseInt(m.user_id) || 0));

      if (maxId <= lastId) {
        break;
      }

      lastId = maxId;

      // BD returns 25 per page by default
      if (members.length < 25) {
        break;
      }
    }

    return allMembers;
  }

  /**
   * Match a lead to one or more members
   *
   * @param {string} leadId - The lead ID
   * @param {string[]} emails - Array of member emails to match
   */
  async matchLead(leadId, emails) {
    if (!emails || emails.length === 0) {
      throw new Error('No emails provided for matching');
    }

    const data = await this.request('POST', '/leads/match', {
      lead_id: leadId,
      users_to_match: emails.join(',')
    });

    // Check for failures
    const result = data.message || {};
    if (result.fail_matches && result.fail_matches.length > 0) {
      console.warn(`Some matches failed: ${result.fail_matches}`);
    }

    return result;
  }
}
