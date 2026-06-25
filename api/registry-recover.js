import { createClient } from '@libsql/client/web';

const url = "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { handle, code } = req.body || {};
  if (!handle || !code) {
    return res.status(400).json({ ok: false, error: 'Missing handle or recovery code' });
  }

  let client;
  try {
    const httpUrl = url.replace(/^libsql:\/\//, 'https://');
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

    if (recCode.handle !== handle) {
      return res.status(400).json({ ok: false, error: 'Recovery code does not match this store handle' });
    }

    // 2. Fetch the user's DB URL and DB Token
    const userRes = await client.execute({
      sql: `SELECT db_url, db_token FROM users WHERE handle = ?`,
      args: [handle]
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Store handle not found in global registry' });
    }

    const { db_url, db_token } = userRes.rows[0];

    // 3. Mark recovery code as used
    await client.execute({
      sql: `UPDATE recovery_codes SET is_used = 1 WHERE code = ?`,
      args: [code]
    });

    // Return the database credentials so the user can set a new PIN
    res.status(200).json({ 
      ok: true, 
      db_url,
      db_token
    });

  } catch (err) {
    console.error("Recovery error:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (client) client.close();
  }
}
