import { createClient } from '@libsql/client/web';
import crypto from 'crypto';

const url = process.env.VITE_TURSO_DB_URL;
const authToken = process.env.VITE_TURSO_DB_TOKEN;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY) {
    throw new Error('Server configuration error: ENCRYPTION_KEY is missing.');
  }
  if (!text.includes(':')) return text; // fallback if not encrypted
  const textParts = text.split(':');
  if (textParts[0].length !== 32) return text; // The IV must be exactly 32 hex characters. If not, it's plaintext (e.g. libsql)
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!url || !authToken) {
    return res.status(500).json({ ok: false, error: 'Database configuration is missing' });
  }

  const { handle, adminPassword } = req.body || {};
  if (!handle || !adminPassword) {
    return res.status(400).json({ ok: false, error: 'Missing handle or admin password' });
  }

  // Simple hardcoded check or env var check for Super Admin
  const EXPECTED_ADMIN_PWD = process.env.SUPER_ADMIN_PASSWORD;
  if (!EXPECTED_ADMIN_PWD) {
    console.error('SUPER_ADMIN_PASSWORD environment variable is missing.');
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  if (adminPassword !== EXPECTED_ADMIN_PWD) {
    return res.status(403).json({ ok: false, error: 'Invalid Super Admin Password' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    const userRes = await client.execute({
      sql: `SELECT db_url, db_token FROM users WHERE handle = ?`,
      args: [handle]
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Store handle not found' });
    }

    const db_url = decrypt(userRes.rows[0].db_url);
    const db_token = decrypt(userRes.rows[0].db_token);

    res.status(200).json({ 
      ok: true, 
      db_url,
      db_token
    });

  } catch (err) {
    console.error("Admin Access error:", err);
    res.status(500).json({ ok: false, error: 'Service temporarily unavailable.' });
  } finally {
    if (client) client.close();
  }
}
