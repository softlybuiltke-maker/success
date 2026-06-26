const fs = require('fs');
const path = require('path');

const url = 'libsql://success-success.aws-ap-northeast-1.turso.io';
const token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI0MTM5MzksImlkIjoiMDE5ZjAwMjYtMWUwMS03NTYxLTg3YWMtZmNmMmM5Yzk1OTc3IiwicmlkIjoiMjQ2YmYzNjctMDZhMi00MzVlLTg2OTctZjAxMTQ5N2Q2ZjA0In0.PSSMjdrQZjrZVqotZPRBUl5_8J_ZJp2mNatNrwyJXrr0ONKoyBZhLBbhq8tdhxEQJef-oteujwTzlJyAa_BnCg';

const apiDir = path.join(__dirname, 'api');
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(apiDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace url = process.env.VITE_TURSO_DB_URL
  content = content.replace(
    /const url = process\.env\.VITE_TURSO_DB_URL;/g,
    `const url = process.env.VITE_TURSO_DB_URL || "${url}";`
  );

  // Replace authToken = process.env.VITE_TURSO_DB_TOKEN
  content = content.replace(
    /const authToken = process\.env\.VITE_TURSO_DB_TOKEN;/g,
    `const authToken = process.env.VITE_TURSO_DB_TOKEN || "${token}";`
  );

  fs.writeFileSync(filePath, content);
}

console.log("Patched all API files to include hardcoded fallbacks.");
