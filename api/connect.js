// api/connect.js — Vercel Serverless Function (ES Module)
// Validates a Turso (libSQL) connection using the HTTP-only client.
// Uses @libsql/client/web — no native Node bindings, works in Vercel serverless.
// Stateless — no credentials are stored on the server.

import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { url, token } = req.body || {};

  if (!url || typeof url !== 'string' || !token || typeof token !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Both "url" and "token" fields are required.',
    });
  }

  let client;
  try {
    // Convert libsql:// to https:// for the HTTP transport
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');

    client = createClient({
      url: httpUrl,
      authToken: token.trim(),
    });

    // Run a safe, read-only test query
    await client.execute('SELECT 1');

    return res.status(200).json({ ok: true });
  } catch (err) {
    const message =
      err?.message || 'Connection failed. Please check your URL and token.';
    return res.status(200).json({ ok: false, error: message });
  } finally {
    try { client?.close(); } catch (_) {}
  }
}
