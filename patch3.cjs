const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Fix ConnectDatabaseSection
const connectMatch = /if \(parsed && parsed\.url && parsed\.token\) {/;
if (code.match(connectMatch)) {
  code = code.replace(
    /const parsed = safeJSONParse\(raw\);\s+if \(parsed && parsed\.url && parsed\.token\) {/,
    'const parsed = safeJSONParse(raw);\n            const tkn = parsed?.token || parsed?.authToken;\n            if (parsed && parsed.url && tkn) {\n              parsed.token = tkn;'
  );
  console.log('Fixed ConnectDatabaseSection');
}

// 2. Fix admin_recovery
const adminMatch = /toast\.success\('Admin OTP verified! Access granted\.'\);\s+setSettings/;
if (code.match(adminMatch)) {
  code = code.replace(
    /toast\.success\('Admin OTP verified! Access granted\.'\);\s+setSettings/,
    "toast.success('Admin OTP verified! Access granted.');\n            toast.loading('Restoring your store data...', { id: 'admin-recovery' });\n            const pulled = await tursoPullAll();\n            if (pulled) {\n               toast.success('Store data restored!', { id: 'admin-recovery' });\n               setTimeout(() => window.location.reload(), 500);\n               return;\n            } else {\n               toast.success('Connected, but no data found in cloud.', { id: 'admin-recovery' });\n            }\n            setSettings"
  );
  console.log('Fixed admin_recovery');
}

// 3. Fix regular recover
const recoverMatch = /toast\.success\('Recovery successful! Connecting\.\.\.', \{ id: toastId \}\);\s+setTimeout/;
if (code.match(recoverMatch)) {
  code = code.replace(
    /toast\.success\('Recovery successful! Connecting\.\.\.', \{ id: toastId \}\);\s+setTimeout\(\(\) => window\.location\.reload\(\), 1500\);/,
    "toast.success('Recovery successful! Downloading store data...', { id: toastId });\n                    const pulled = await tursoPullAll();\n                    if (pulled) {\n                      toast.success('Store data fully restored!', { id: toastId });\n                    } else {\n                      toast.success('Connected, but cloud store is empty.', { id: toastId });\n                    }\n                    setTimeout(() => window.location.reload(), 1000);"
  );
  console.log('Fixed recover');
}

fs.writeFileSync('src/App.jsx', code);
