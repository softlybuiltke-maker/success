const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const superAdminUiMatch = `                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1">Period (Days)</label>
                    <input type="number" className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200" value={settings.periodInDays || ''} onChange={e => updateSettings({ ...settings, periodInDays: parseInt(e.target.value) || 0 })} placeholder="e.g. 30" />
                    <p className="text-xs text-amber-700 mt-2">Set the period in days.</p>
                  </div>`;

const superAdminUiReplace = `                  <div>
                    <label className="block text-sm font-semibold text-amber-900 mb-1">Period Duration</label>
                    <div className="flex gap-2">
                      <input type="number" className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200 flex-1" value={settings.periodInDays || ''} onChange={e => updateSettings({ ...settings, periodInDays: parseInt(e.target.value) || 0 })} placeholder="e.g. 30" />
                      <select className="input-field border-amber-200 focus:border-amber-500 focus:ring-amber-200 w-32" value={settings.periodUnit || 'days'} onChange={e => updateSettings({ ...settings, periodUnit: e.target.value })}>
                        <option value="days">Days</option>
                        <option value="seconds">Seconds</option>
                      </select>
                    </div>
                    <p className="text-xs text-amber-700 mt-2">Set the duration for the lock period.</p>
                  </div>
                  {settings.periodStartDate && (
                    <div className="flex justify-between items-center bg-amber-50 p-3 rounded-lg border border-amber-100">
                      <div>
                        <div className="text-sm font-semibold text-amber-900">Reset Timer</div>
                        <div className="text-xs text-amber-700">Restart the period from right now.</div>
                      </div>
                      <button onClick={() => updateSettings({ ...settings, periodStartDate: Date.now() })} className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600">
                        Reset Now
                      </button>
                    </div>
                  )}`;

const maxElapsedMatch = `const maxElapsed = superAdminSettings.periodInDays * 24 * 60 * 60 * 1000;`;
const maxElapsedReplace = `const maxElapsed = superAdminSettings.periodUnit === 'seconds' ? superAdminSettings.periodInDays * 1000 : superAdminSettings.periodInDays * 24 * 60 * 60 * 1000;`;

const depsMatch = `}, [superAdminSettings.enablePeriodLock, superAdminSettings.periodInDays, superAdminSettings.periodStartDate]);`;
const depsReplace = `}, [superAdminSettings.enablePeriodLock, superAdminSettings.periodInDays, superAdminSettings.periodUnit, superAdminSettings.periodStartDate]);`;

code = code.replace(superAdminUiMatch, superAdminUiReplace);
code = code.replace(maxElapsedMatch, maxElapsedReplace);
code = code.replace(depsMatch, depsReplace);

fs.writeFileSync('src/App.jsx', code);
console.log('Done replacing superadmin stuff');
