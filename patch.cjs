const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const oldConnect = `          if (raw) {
            const parsed = safeJSONParse(raw);
            if (parsed && parsed.url && parsed.token) {
              setDbUrl(parsed.url);
              setDbToken(parsed.token);
              setIsConnected(true);
            }
          }`;

const newConnect = `          if (raw) {
            const parsed = safeJSONParse(raw);
            const tkn = parsed?.token || parsed?.authToken;
            if (parsed && parsed.url && tkn) {
              setDbUrl(parsed.url);
              setDbToken(tkn);
              setIsConnected(true);
            }
          }`;

const oldAdmin = `            toast.success('Admin OTP verified! Access granted.');
            setSettings(prev => {
              const newSettings = { ...prev, storeHandle: data.handle || prev?.storeHandle };
              if (typeof saveDataToDB !== 'undefined') saveDataToDB('settings', newSettings);
              return newSettings;
            });
            setCurrentUser({ role: 'owner' });
            setInitialTab('settings');
            setView('dash');`;

const newAdmin = `            toast.success('Admin OTP verified! Access granted.');
            
            toast.loading('Restoring your store data...', { id: 'admin-recovery' });
            const pulled = await tursoPullAll();
            if (pulled) {
               toast.success('Store data restored!', { id: 'admin-recovery' });
               setTimeout(() => window.location.reload(), 500);
               return;
            } else {
               toast.success('Connected, but no data found in cloud.', { id: 'admin-recovery' });
            }

            setSettings(prev => {
              const newSettings = { ...prev, storeHandle: data.handle || prev?.storeHandle };
              if (typeof saveDataToDB !== 'undefined') saveDataToDB('settings', newSettings);
              return newSettings;
            });
            setCurrentUser({ role: 'owner' });
            setInitialTab('settings');
            setView('dash');`;

code = code.replace(oldConnect, newConnect);
code = code.replace(oldAdmin, newAdmin);
fs.writeFileSync('src/App.jsx', code);
console.log('Patched App.jsx');
