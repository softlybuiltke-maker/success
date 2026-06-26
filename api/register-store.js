import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { handle, password } = req.body || {};

  if (!handle || !password) {
    return res.status(400).json({ ok: false, error: 'Handle and password are required' });
  }

  // Basic handle validation (alphanumeric, no spaces)
  if (!/^[a-zA-Z0-9_-]+$/.test(handle)) {
    return res.status(400).json({ ok: false, error: 'Handle can only contain letters, numbers, underscores, and hyphens' });
  }

  const url = process.env.VITE_TURSO_DB_URL;
  const authToken = process.env.VITE_TURSO_DB_TOKEN;

  if (!url || !authToken) {
    return res.status(500).json({ ok: false, error: 'Database configuration is missing' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    // Check if handle already exists
    const existing = await client.execute({
      sql: `SELECT handle FROM users WHERE LOWER(handle) = LOWER(?)`,
      args: [handle]
    });

    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'Store handle is already taken' });
    }

    // Expire immediately to require admin token
    const validUntil = new Date();

    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashedPassword = `${salt}:${hash}`;

    await client.execute({
      sql: `INSERT INTO users (handle, password, valid_until, is_blocked) VALUES (?, ?, ?, 0)`,
      args: [handle, hashedPassword, validUntil.toISOString()]
    });

    res.status(200).json({ ok: true, message: 'Store registered successfully' });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ ok: false, error: 'Service temporarily unavailable. Please try again later.' });
  } finally {
    if (client) {
      client.close();
    }
  }
};
