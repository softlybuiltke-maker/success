const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add useEffect for autoLock
const stateBlock = 'const [settings, setSettings] = useState(DEFAULT_SETTINGS);';
const autoLockEffect = `
        useEffect(() => {
          if (settings && settings.autoLock) {
            const handleUnload = () => {
              try {
                const s = JSON.parse(localStorage.getItem('sb_session') || '{}');
                if (s.currentUser) {
                  delete s.currentUser;
                  s.view = 'pin';
                  localStorage.setItem('sb_session', JSON.stringify(s));
                }
              } catch (e) {}
            };
            window.addEventListener('beforeunload', handleUnload);
            return () => window.removeEventListener('beforeunload', handleUnload);
          }
        }, [settings]);
`;
if (!code.includes('handleUnload')) {
    code = code.replace(stateBlock, stateBlock + '\n' + autoLockEffect);
}

// 2. Replace CloudRecoverySection usage in SettingsPanel
const targetUsage = '<CloudRecoverySection />';
const newAutoLockUI = `
        <div className="pt-6 border-t mt-6">
          <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><Lock className="w-5 h-5 text-indigo-600" /> System Auto Lock</h3>
          <p className="text-sm text-slate-500 mb-4">Automatically lock the system when you exit or refresh the app. Users will be required to re-enter their PIN or password to gain access again.</p>
          <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="text-slate-700 font-medium">Enable Auto Lock on Exit</span>
            <button onClick={() => { 
                const newAutoLock = !settings.autoLock;
                setSettings({...settings, autoLock: newAutoLock});
                if (typeof saveDataToDB !== 'undefined') saveDataToDB('settings', {...settings, autoLock: newAutoLock});
              }} className={\`w-12 h-6 rounded-full relative transition-colors \${settings.autoLock ? 'bg-indigo-500' : 'bg-slate-200'}\`}>
              <div className={\`w-4 h-4 bg-white rounded-full absolute top-1 transition-all \${settings.autoLock ? 'left-7' : 'left-1'}\`}></div>
            </button>
          </div>
        </div>`;
code = code.replace(targetUsage, newAutoLockUI);

fs.writeFileSync('src/App.jsx', code);
console.log('Modifications applied');
