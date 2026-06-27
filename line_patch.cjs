const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const lines = code.split('\n');
const index = lines.findIndex(l => l.includes('const interval = setInterval(checkPeriod, 60000);'));
if (index !== -1) {
  lines[index] = "        const checkIntervalMs = superAdminSettings.periodUnit === 'seconds' ? 1000 : 60000;\n        const interval = setInterval(checkPeriod, checkIntervalMs);";
  fs.writeFileSync('src/App.jsx', lines.join('\n'));
  console.log('Fixed interval');
} else {
  console.log('Not found');
}
