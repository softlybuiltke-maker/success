import { createClient } from '@libsql/client/web';

const url = "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { handle, dbUrl } = req.query || {};
  if (!handle && !dbUrl) {
    return res.status(400).json({ ok: false, error: 'Missing handle or dbUrl' });
  }

  let client;
  try {
    const httpUrl = url.replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    let sql, args;
    if (dbUrl) {
      sql = `SELECT valid_until, is_blocked FROM users WHERE db_url = ?`;
      args = [dbUrl];
    } else {
      sql = `SELECT valid_until, is_blocked FROM users WHERE LOWER(handle) = LOWER(?)`;
      args = [handle];
    }

    const result = await client.execute({ sql, args });

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const user = result.rows[0];
    res.status(200).json({ 
      ok: true, 
      valid_until: user.valid_until, 
      is_blocked: !!user.is_blocked 
    });
  } catch (err) {
    console.error("Subscription check error:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (client) client.close();
  }
}
