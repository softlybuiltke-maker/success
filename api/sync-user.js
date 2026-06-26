import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { handle } = req.body || {};
  if (!handle) return res.status(400).json({ ok: false, error: 'Handle required' });

  const url = process.env.VITE_TURSO_DB_URL || "libsql://success-success.aws-ap-northeast-1.turso.io";
  const authToken = process.env.VITE_TURSO_DB_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    const existing = await client.execute({
      sql: `SELECT handle FROM users WHERE LOWER(handle) = LOWER(?)`,
      args: [handle]
    });

    if (existing.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO users (handle, password, valid_until, is_blocked) VALUES (?, 'recovered', CURRENT_TIMESTAMP, 0)`,
        args: [handle]
      });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (client) client.close();
  }
}
