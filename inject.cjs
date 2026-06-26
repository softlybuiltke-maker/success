const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

if (!content.includes('const checkAdminOTP = async')) {
  const insertIndex = content.indexOf('const checkRecoveryPin = (v) => {');
  
  if (insertIndex !== -1) {
    const adminOtpFunc = `const checkAdminOTP = async (v) => {
        if (v.length > 6) return;
        setPin(v);
        
        if (v.length === 6) {
          try {
            const res = await fetch('/api/registry-recover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ handle: settings?.storeHandle, code: v })
            });
            const data = await res.json();
            if (data.ok) {
              toast.success('Admin OTP verified! Access granted.');
              setCurrentUser({ role: 'owner' });
              setInitialTab('settings');
              setView('dash');
              setPin('');
            } else {
              toast.error(data.error || 'Invalid OTP');
              setPin('');
            }
          } catch(err) {
            toast.error('Network error checking OTP');
            setPin('');
          }
        }
      };\n\n      `;
      
    content = content.slice(0, insertIndex) + adminOtpFunc + content.slice(insertIndex);
    fs.writeFileSync(appFile, content);
    console.log("Successfully injected checkAdminOTP.");
  } else {
    console.error("Could not find checkRecoveryPin.");
  }
} else {
  console.log("Function already exists.");
}
