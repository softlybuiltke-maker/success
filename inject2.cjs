const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

// Replace admin_recovery view
const oldAdminRecovery = `{view === 'admin_recovery' && (<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center"><div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><Key className="w-8 h-8 text-blue-600" /></div><h2 className="text-xl font-bold mb-2 text-slate-800">Admin Recovery</h2><p className="text-sm text-slate-500 mb-6">Enter the 6-digit OTP from Super Admin.</p><div className="flex justify-center gap-3 mb-8">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={\`w-3 h-3 rounded-full transition-all \${pin.length > i ? 'bg-blue-600 scale-125' : 'bg-slate-200'}\`}></div>)}</div><div className="grid grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => checkAdminOTP(pin + n)} className="p-4 bg-slate-50 rounded-xl font-bold text-xl text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md transition-all border border-slate-100">{n}</button>)}<div /><button onClick={() => checkAdminOTP(pin + '0')} className="p-4 bg-slate-50 rounded-xl font-bold text-xl text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md transition-all border border-slate-100">0</button><button onClick={() => setPin(pin.slice(0, -1))} className="p-4 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Delete className="w-6 h-6" /></button></div><button onClick={() => { setPin(''); setView('pin'); }} className="mt-8 text-sm text-slate-400 hover:text-slate-700 font-medium">Back to Login</button></div></div>)}`;

const newAdminRecovery = `{view === 'admin_recovery' && (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><Key className="w-8 h-8 text-blue-600" /></div>
      <h2 className="text-xl font-bold mb-2 text-slate-800">Admin Recovery</h2>
      <p className="text-sm text-slate-500 mb-6">Enter your Store Handle and the 6-digit OTP from Super Admin.</p>
      <form onSubmit={async (e) => { 
        e.preventDefault();
        const handle = e.target.handle.value.trim().replace(/^@/, '');
        const code = e.target.code.value.trim();
        
        if (!handle || !code) return toast.error('Both fields required');
        
        try {
          const res = await fetch('/api/registry-recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle, code })
          });
          const data = await res.json();
          if (data.ok) {
            toast.success('Admin OTP verified! Access granted.');
            setSettings(prev => {
              const newSettings = { ...prev, storeHandle: handle };
              if (typeof saveDataToDB !== 'undefined') saveDataToDB('settings', newSettings);
              return newSettings;
            });
            setCurrentUser({ role: 'owner' });
            setInitialTab('settings');
            setView('dash');
          } else {
            toast.error(data.error || 'Invalid OTP');
          }
        } catch(err) {
          toast.error('Network error checking OTP');
        }
      }} className="text-left mb-4">
        <label className="text-xs font-semibold text-slate-500 block mb-1">Store Handle</label>
        <input name="handle" defaultValue={settings?.storeHandle || ''} className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 focus:bg-white focus:ring-2 ring-blue-500 outline-none" placeholder="@JohnsMart" required autoFocus={!settings?.storeHandle} />
        <label className="text-xs font-semibold text-slate-500 block mb-1">6-Digit OTP</label>
        <input name="code" type="text" maxLength="6" pattern="\\\\d{6}" className="w-full p-3 border border-slate-200 rounded-xl mb-4 bg-slate-50 focus:bg-white focus:ring-2 ring-blue-500 outline-none tracking-[0.2em]" placeholder="123456" required autoFocus={!!settings?.storeHandle} />
        <button type="submit" className="w-full mt-2 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">Verify OTP & Login</button>
      </form>
      <button type="button" onClick={() => setView('pin')} className="mt-4 text-sm text-slate-400 hover:text-slate-700 font-medium">Back to Login</button>
    </div>
  </div>
)}`;

content = content.replace(oldAdminRecovery, newAdminRecovery);

// Add sync-user to cloud_recovery
const cloudRecoverySyncTarget = `localStorage.setItem('db_session', JSON.stringify(creds));`;
const cloudRecoverySyncCode = `localStorage.setItem('db_session', JSON.stringify(creds));
                    
                    fetch('/api/sync-user', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ handle })
                    }).catch(console.error);`;
content = content.replace(cloudRecoverySyncTarget, cloudRecoverySyncCode);

fs.writeFileSync(appFile, content);
console.log("Updated App.jsx successfully");
