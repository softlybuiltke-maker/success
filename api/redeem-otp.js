import { createClient } from '@libsql/client/web';

const url = process.env.VITE_TURSO_DB_URL || "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = process.env.VITE_TURSO_DB_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!url || !authToken) {
    return res.status(500).json({ ok: false, error: 'Database configuration is missing' });
  }

  const { handle, code } = req.body || {};
  if (!handle || !code) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken });

    // 1. Check if the OTP is valid and unused
    const otpRes = await client.execute({
      sql: `SELECT days_value, is_used, target_handle FROM otps WHERE code = ?`,
      args: [code]
    });

    if (otpRes.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid activation code' });
    }

    const otp = otpRes.rows[0];
    if (otp.is_used) {
      return res.status(400).json({ ok: false, error: 'Activation code already used' });
    }

    if (otp.target_handle && otp.target_handle !== handle) {
      return res.status(400).json({ ok: false, error: 'Activation code is not valid for this store' });
    }

    // 2. Fetch the user's current valid_until
    const userRes = await client.execute({
      sql: `SELECT valid_until FROM users WHERE handle = ?`,
      args: [handle]
    });

    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Store handle not found in global registry' });
    }

    let currentValidUntil = new Date(userRes.rows[0].valid_until);
    const now = new Date();
    
    // If the subscription is already expired, start adding days from today.
    // If it's still active, add days to the existing expiration date.
    if (currentValidUntil < now) {
      currentValidUntil = now;
    }

    currentValidUntil.setDate(currentValidUntil.getDate() + otp.days_value);
    const newValidUntilIso = currentValidUntil.toISOString();

    // 3. Mark OTP as used and update user's valid_until
    await client.execute({
      sql: `UPDATE otps SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE code = ?`,
      args: [handle, code]
    });

    await client.execute({
      sql: `UPDATE users SET valid_until = ?, is_blocked = 0 WHERE handle = ?`,
      args: [newValidUntilIso, handle]
    });

    res.status(200).json({ ok: true, message: 'Subscription activated!', valid_until: newValidUntilIso, added_days: otp.days_value });
  } catch (err) {
    console.error("OTP redeem error:", err);
    res.status(500).json({ ok: false, error: 'Service temporarily unavailable. Please try again later.' });
  } finally {
    if (client) client.close();
  }
}
