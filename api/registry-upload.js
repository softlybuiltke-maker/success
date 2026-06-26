import { createClient } from '@libsql/client/web';
import crypto from 'crypto';

const url = process.env.VITE_TURSO_DB_URL || "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = process.env.VITE_TURSO_DB_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function encrypt(text) {
  if (!ENCRYPTION_KEY) return text; // fallback if key not set
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
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

  const { handle, db_url, db_token } = req.body || {};
  if (!handle || !db_url || !db_token) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    // 14 day trial by default
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);
    const validUntilIso = validUntil.toISOString();

    const encDbUrl = encrypt(db_url);
    const encDbToken = encrypt(db_token);

    await client.execute({
      sql: `
        INSERT INTO users (handle, db_url, db_token, valid_until, is_blocked) 
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(handle) DO UPDATE SET 
          db_url = excluded.db_url,
          db_token = excluded.db_token
      `,
      args: [handle, encDbUrl, encDbToken, validUntilIso]
    });

    res.status(200).json({ ok: true, message: 'Registry updated successfully', valid_until: validUntilIso });
  } catch (err) {
    console.error("Registry upload error:", err);
    res.status(500).json({ ok: false, error: 'Service temporarily unavailable. Please try again later.' });
  } finally {
    if (client) client.close();
  }
}
