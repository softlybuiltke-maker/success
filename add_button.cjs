const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const searchStr = '<h2 className="text-2xl font-bold text-slate-800">Shop Settings</h2>';
const replaceStr = '<h2 className="text-2xl font-bold text-slate-800">Shop Settings</h2>\n<button onClick={async () => { toast.loading(\'Force uploading data...\', {id:\'upload\'}); await tursoSyncAll(); toast.success(\'Data successfully uploaded to cloud!\', {id:\'upload\'}); }} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl mb-6 shadow-lg uppercase tracking-wide">🚀 FORCE UPLOAD ALL LOCAL DATA TO CLOUD 🚀</button>';
code = code.replace(searchStr, replaceStr);
fs.writeFileSync('src/App.jsx', code);
console.log('App.jsx patched with Force Upload button');
