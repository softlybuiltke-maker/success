import { createClient } from '@libsql/client/web';
import crypto from 'crypto';

const url = process.env.VITE_TURSO_DB_URL;
const authToken = process.env.VITE_TURSO_DB_TOKEN;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('Server configuration error: ENCRYPTION_KEY is missing.');
  }
  if (!text.includes(':')) return text; // fallback if not encrypted
  const textParts = text.split(':');
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

  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Missing recovery code' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    // 1. Check if the recovery code is valid
    const codeRes = await client.execute({
      sql: `SELECT is_used, handle FROM recovery_codes WHERE code = ?`,
      args: [code]
    });

    if (codeRes.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid recovery code' });
    }

    const recCode = codeRes.rows[0];
    if (recCode.is_used) {
      return res.status(400).json({ ok: false, error: 'Recovery code already used' });
    }

    const handle = recCode.handle;

    // 2. Fetch the user's DB URL and DB Token
    const userRes = await client.execute({
      sql: `SELECT db_url, db_token FROM users WHERE handle = ?`,
      args: [handle]
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Store handle not found in global registry' });
    }

    const db_url = decrypt(userRes.rows[0].db_url);
    const db_token = decrypt(userRes.rows[0].db_token);

    // 3. Mark recovery code as used
    await client.execute({
      sql: `UPDATE recovery_codes SET is_used = 1 WHERE code = ?`,
      args: [code]
    });

    // Return the database credentials so the user can set a new PIN
    res.status(200).json({ 
      ok: true, 
      handle,
      db_url,
      db_token
    });

  } catch (err) {
    console.error("Recovery error:", err);
    res.status(500).json({ ok: false, error: 'Service temporarily unavailable. Please try again later.' });
  } finally {
    if (client) client.close();
  }
}
