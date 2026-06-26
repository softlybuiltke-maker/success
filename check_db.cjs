const { createClient } = require('@libsql/client');

const url = process.env.VITE_TURSO_DB_URL || "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = process.env.VITE_TURSO_DB_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

async function check() {
  const client = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
  const res = await client.execute("SELECT * FROM recovery_codes WHERE code = '735311'");
  console.log("recovery_codes entry:", res.rows);
  
  const all = await client.execute("SELECT handle FROM users");
  console.log("all users:", all.rows.map(r => r.handle));
}

check().catch(console.error);
