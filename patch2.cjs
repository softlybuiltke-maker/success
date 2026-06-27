const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const oldRecover = `                    const session = safeJSONParse(localStorage.getItem('sb_session') || '{}');
                    localStorage.setItem('sb_session', JSON.stringify({ ...session, view: 'pin' }));
                    toast.success('Recovery successful! Connecting...', { id: toastId });
                    setTimeout(() => window.location.reload(), 1500);`;

const newRecover = `                    const session = safeJSONParse(localStorage.getItem('sb_session') || '{}');
                    localStorage.setItem('sb_session', JSON.stringify({ ...session, view: 'pin' }));
                    toast.success('Recovery successful! Downloading store data...', { id: toastId });
                    
                    const pulled = await tursoPullAll();
                    if (pulled) {
                      toast.success('Store data fully restored!', { id: toastId });
                    } else {
                      toast.success('Connected, but cloud store is empty.', { id: toastId });
                    }
                    setTimeout(() => window.location.reload(), 1000);`;

code = code.replace(oldRecover, newRecover);
fs.writeFileSync('src/App.jsx', code);
console.log('Patched App.jsx again');
