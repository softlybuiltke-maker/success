const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Update LockScreen signature
content = content.replace(
  'const LockScreen = ({ correctPin, onUnlock, isPeriodExpired, isBlockedByAdmin, recoveryPin, storeHandle }) => {',
  'const LockScreen = ({ correctPin, onUnlock, isPeriodExpired, isBlockedByAdmin, recoveryPin, storeHandle, onForceLogout }) => {'
);

// 2. Add the Forgot PIN button inside LockScreen
const oldKeypadEnd = `              <button onClick={() => setPin(pin.slice(0, -1))} className="p-4 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Delete className="w-6 h-6" /></button>
            </div>
          </div>
        </div>`;
const newKeypadEnd = `              <button onClick={() => setPin(pin.slice(0, -1))} className="p-4 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Delete className="w-6 h-6" /></button>
            </div>
            {onForceLogout && (
              <button onClick={onForceLogout} className="mt-8 text-sm text-slate-400 hover:text-slate-700 font-medium">Switch User / Forgot PIN?</button>
            )}
          </div>
        </div>`;
content = content.replace(oldKeypadEnd, newKeypadEnd);

// 3. Pass onForceLogout to LockScreen usage
// There are multiple usages of LockScreen in App.jsx. Let's find them all.
// e.g. <LockScreen correctPin={superAdminSettings.lockPin} onUnlock={() => { setIsLocked(false); setLastInteraction(Date.now()); }} ... />
// The simplest way is to replace `<LockScreen ` with `<LockScreen onForceLogout={() => { setIsLocked(false); logout(); }} `
// But wait, there's `const LockScreen = ` which we shouldn't replace.
const oldLockScreenUsage = 'recoveryPin={superAdminSettings?.recoveryPin} storeHandle={settings?.storeHandle} />';
const newLockScreenUsage = 'recoveryPin={superAdminSettings?.recoveryPin} storeHandle={settings?.storeHandle} onForceLogout={() => { setIsLocked(false); logout(); }} />';
content = content.split(oldLockScreenUsage).join(newLockScreenUsage);

fs.writeFileSync(appFile, content);
console.log('Successfully updated LockScreen to include Forgot PIN button');
