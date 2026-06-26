const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');
c = c.replace('pattern="\\\\d{6}"', '');
c = c.replace('const code = e.target.code.value.trim();', 'const code = e.target.code.value.replace(/\\s/g, "");');
fs.writeFileSync('src/App.jsx', c);
console.log('Fixed pattern and whitespace parsing');
