const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');
const lines = code.split('\n');

const settingsTabStart = lines.findIndex(l => l.includes('const SettingsTab ='));
console.log('SettingsTab starts at:', settingsTabStart);

for (let i = settingsTabStart; i < settingsTabStart + 500; i++) {
  if (lines[i] && (lines[i].includes('saveDataToDB') || lines[i].includes('tursoSync'))) {
    console.log(i + ': ' + lines[i].trim());
  }
}
