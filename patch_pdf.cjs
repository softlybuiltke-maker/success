const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Update signature
code = code.replace(
  'const generateRecoveryPdf = (storeHandle, masterPwd, creds) => {',
  'const generateRecoveryPdf = (storeHandle, masterPwd, creds, settings) => {'
);

// 2. Add Owner PIN & Cashiers
const matchPins = `          y = drawField('Store Handle', storeHandle, y);
          y = drawField('Master Password', masterPwd, y);
          y += 8;`;
const replacePins = `          y = drawField('Store Handle', storeHandle, y);
          y = drawField('Master Password', masterPwd, y);
          if (settings && settings.ownerPin) y = drawField('Owner PIN (4 digits)', settings.ownerPin, y);
          if (settings && settings.ownerPassword) y = drawField('Owner Password', settings.ownerPassword, y);
          if (settings && settings.cashiers && Array.isArray(settings.cashiers)) {
            settings.cashiers.forEach(c => {
              if (c.name && c.pin) y = drawField('Cashier: ' + c.name, 'PIN: ' + c.pin, y);
            });
          }
          y += 8;`;
code = code.replace(matchPins, replacePins);

// 3. Fix Token String (handle authToken fallback)
const matchToken = `          const tokenStr = String((creds && creds.token) ? creds.token : 'N/A');`;
const replaceToken = `          const tokenStr = String((creds && (creds.token || creds.authToken)) ? (creds.token || creds.authToken) : 'N/A');`;
code = code.replace(matchToken, replaceToken);

// 4. Update the caller
const matchCaller = `          generateRecoveryPdf(cleanHandle, pwd, creds);`;
const replaceCaller = `          generateRecoveryPdf(cleanHandle, pwd, creds, settings);`;
code = code.replace(matchCaller, replaceCaller);

fs.writeFileSync('src/App.jsx', code);
console.log('App.jsx patched successfully');
