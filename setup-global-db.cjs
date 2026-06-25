const { createClient } = require('@libsql/client');

const url = "libsql://success-success.aws-ap-northeast-1.turso.io";
const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg";

async function main() {
  const client = createClient({ url, authToken });

  console.log("Creating users table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      handle TEXT PRIMARY KEY,
      db_url TEXT,
      db_token TEXT,
      valid_until TEXT,
      is_blocked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Creating otps table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS otps (
      code TEXT PRIMARY KEY,
      days_value INTEGER,
      is_used INTEGER DEFAULT 0,
      used_by TEXT,
      used_at DATETIME
    )
  `);

  console.log("Creating recovery_codes table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      code TEXT PRIMARY KEY,
      handle TEXT,
      is_used INTEGER DEFAULT 0
    )
  `);

  console.log("Global DB initialized successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
