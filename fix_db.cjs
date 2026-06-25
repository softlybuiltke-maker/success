const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Strip quotes in handleConnect
code = code.replace(/const trimmedUrl = dbUrl\.trim\(\);/, "const trimmedUrl = dbUrl.replace(/[\"'\\s]/g, '');");
code = code.replace(/const trimmedToken = dbToken\.trim\(\);/, "const trimmedToken = dbToken.replace(/[\"'\\s]/g, '');");

// Add onPaste to dbUrl input
const targetInput = 'onChange={e => setDbUrl(e.target.value)}\n                  autoComplete="off"';
const replacementInput = `onChange={e => setDbUrl(e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    const urlMatch = text.match(/TURSO_DATABASE_URL=["']?([^"'\\s]+)/);
                    const tokenMatch = text.match(/TURSO_AUTH_TOKEN=["']?([^"'\\s]+)/);
                    if (urlMatch && tokenMatch) {
                      e.preventDefault();
                      setDbUrl(urlMatch[1]);
                      setDbToken(tokenMatch[1]);
                    }
                  }}
                  autoComplete="off"`;

code = code.replace(targetInput, replacementInput);
fs.writeFileSync('src/App.jsx', code);
console.log('Fixed DB credentials parsing.');
