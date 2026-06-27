const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf-8');
const old_part = `            if (pulled && pulled.success) {
               toast.success('Store data restored!', { id: 'admin-recovery' });
            } else {
               toast.success('Connected, but no data found in cloud.', { id: 'admin-recovery' });
            }
            setSettings(prev => {`;
const new_part = `            if (pulled && pulled.success) {
               toast.success('Store data restored!', { id: 'admin-recovery' });
            } else {
               toast.success(pulled && pulled.error ? \`Failed: \${pulled.error}\` : 'Connected, but no data found in cloud.', { id: 'admin-recovery' });
            }
            setTimeout(() => window.location.reload(), 1500);
            return;
            setSettings(prev => {`;
if (content.includes(old_part)) {
    content = content.replace(old_part, new_part);
    fs.writeFileSync('src/App.jsx', content, 'utf-8');
    console.log('Patched successfully');
} else {
    console.log('Failed to find target');
}
