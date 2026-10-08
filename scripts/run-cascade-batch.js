#!/usr/bin/env node

/**
 * Batch ZIP Cascade Runner
 *
 * Runs the ZIP cascade for a list of lead IDs by:
 * 1. Fetching each lead's lat/lng/email from BD API
 * 2. POSTing to the Worker (which returns JSON with results)
 * 3. Logging results to a file
 *
 * Usage:
 *   node run-cascade-batch.js <lead-ids-file> [results-file]
 *
 * Example:
 *   node run-cascade-batch.js leads-to-process.txt results.json
 *
 * Lead IDs file format (one ID per line):
 *   9602
 *   9603
 *   9604
 *
 * Required environment variables:
 *   BD_API_KEY - Brilliant Directories API key
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = 'https://zip-cascade.ucc-automation.workers.dev';
const BD_API_BASE = 'https://uppercervicalcare.com/api/v2';
const DELAY_MS = 2000; // 2 seconds between requests

async function fetchLead(leadId, apiKey) {
  const response = await fetch(`${BD_API_BASE}/leads/${leadId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`BD API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data || data;
}

async function runCascade(leadId, lat, lng, email) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      lead_id: String(leadId),
      lat: String(lat),
      lng: String(lng),
      lead_email: email
    })
  });

  if (!response.ok) {
    throw new Error(`Worker error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node run-cascade-batch.js <lead-ids-file> [results-file]');
    console.error('');
    console.error('Environment variables:');
    console.error('  BD_API_KEY - Required. Your Brilliant Directories API key.');
    process.exit(1);
  }

  const leadsFile = args[0];
  const resultsFile = args[1] || 'cascade-results.json';

  const apiKey = process.env.BD_API_KEY;
  if (!apiKey) {
    console.error('Error: BD_API_KEY environment variable is required');
    process.exit(1);
  }

  // Read lead IDs from file
  if (!fs.existsSync(leadsFile)) {
    console.error(`Error: File not found: ${leadsFile}`);
    process.exit(1);
  }

  const leadIds = fs.readFileSync(leadsFile, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments

  console.log(`Found ${leadIds.length} lead IDs to process`);
  console.log(`Results will be written to: ${resultsFile}`);
  console.log('');

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];
    const timestamp = new Date().toISOString();

    console.log(`[${i + 1}/${leadIds.length}] Processing lead ${leadId}...`);

    try {
      // Fetch lead data from BD
      const lead = await fetchLead(leadId, apiKey);

      if (!lead.lat || !lead.lng) {
        throw new Error('Lead has no coordinates');
      }

      // Run cascade
      const cascadeResult = await runCascade(
        leadId,
        lead.lat,
        lead.lng,
        lead.lead_email || lead.email
      );

      const result = {
        lead_id: leadId,
        timestamp,
        status: cascadeResult.status,
        match_count: cascadeResult.match_count,
        has_level2: cascadeResult.has_level2,
        matched_doctor_emails: cascadeResult.matched_doctor_emails || []
      };

      results.push(result);
      successCount++;

      console.log(`    status: ${result.status}, match_count: ${result.match_count}, has_level2: ${result.has_level2}`);

    } catch (error) {
      const result = {
        lead_id: leadId,
        timestamp,
        status: 'script_error',
        match_count: 0,
        has_level2: false,
        error: error.message
      };

      results.push(result);
      errorCount++;

      console.log(`    ERROR: ${error.message}`);
    }

    // Write results after each lead (in case of interruption)
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

    // Pause before next request (unless this is the last one)
    if (i < leadIds.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Complete. ${successCount} succeeded, ${errorCount} failed.`);
  console.log(`Results saved to: ${resultsFile}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
