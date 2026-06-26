const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'api');
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(apiDir, file);
  let code = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Remove Hardcoded Turso Token fallback
  const tokenRegex = /const authToken = process\.env\.VITE_TURSO_DB_TOKEN \|\| "eyJhbGci[^"]+";/g;
  if (tokenRegex.test(code)) {
    code = code.replace(tokenRegex, 'const authToken = process.env.VITE_TURSO_DB_TOKEN;');
    changed = true;
  }

  // Also remove hardcoded DB URL fallback if present
  const urlRegex = /const url = process\.env\.VITE_TURSO_DB_URL \|\| "libsql:\/\/success-success[^"]+";/g;
  if (urlRegex.test(code)) {
    code = code.replace(urlRegex, 'const url = process.env.VITE_TURSO_DB_URL;');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, code);
    console.log(`Updated ${file}`);
  }
}

console.log('Done fixing hardcoded DB tokens.');
