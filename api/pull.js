// api/pull.js — Vercel Serverless Function (ES Module)
// Pulls all POS data collections from the Turso pos_data table.
// Stateless — no credentials stored. Called when connecting a new device.

import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { url, token } = req.body || {};

  if (!url || !token) {
    return res.status(400).json({
      ok: false,
      error: 'Fields url and token are required.',
    });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken: token.trim() });

    // Ensure the table exists before querying, so we don't get an error on empty DBs
    await client.execute(`
      CREATE TABLE IF NOT EXISTS pos_data (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Fetch all records
    const result = await client.execute('SELECT key, value FROM pos_data');
    
    // Convert array of rows into a key-value object
    const data = {};
    for (const row of result.rows) {
      try {
        data[row.key] = JSON.parse(row.value);
      } catch (e) {
        // Skip invalid JSON
      }
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err?.message || 'Pull failed.',
    });
  } finally {
    try { client?.close(); } catch (_) {}
  }
}
