// api/poll.js — Lightweight polling endpoint
// Returns only the last_modified timestamp from the meta table.
// Called every 5 seconds by connected devices to detect changes without transferring all data.
import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) return res.status(500).json({ ok: false, error: 'Database configuration missing on server.' });

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken: token.trim() });

    // Ensure meta table exists
    await client.execute(`CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY, last_modified INTEGER NOT NULL DEFAULT 0)`);
    await client.execute(`INSERT OR IGNORE INTO meta (id, last_modified) VALUES (1, 0)`);

    const result = await client.execute(`SELECT last_modified FROM meta WHERE id = 1`);
    const ts = result.rows[0]?.last_modified ?? 0;

    return res.status(200).json({ ok: true, last_modified: Number(ts) });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message || 'Poll failed.' });
  } finally {
    try { client?.close(); } catch (_) {}
  }
}
