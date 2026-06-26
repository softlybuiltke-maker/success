const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(targetFile, 'utf8');

// Replace Network error messages
content = content.replace(/Network error — could not reach the server\. Please try again\./g, 'No internet connection. Please check your network and try again.');
content = content.replace(/Network error/g, 'No internet connection');
content = content.replace(/Network Error/g, 'No internet connection');

// Let's replace raw err.message in toasts
content = content.replace(/toast\.error\(err\.message/g, "toast.error('Service temporarily unavailable. Please try again later.'");
content = content.replace(/toast\.error\(error\.message/g, "toast.error('Service temporarily unavailable. Please try again later.'");
content = content.replace(/toast\.error\(err\.message \|\| 'Recovery failed'/g, "toast.error('Recovery failed. Please try again.'");

// Wrap console.error and console.warn carefully
content = content.replace(/console\.error\(/g, 'if (import.meta.env.DEV) console.error(');
content = content.replace(/console\.warn\(/g, 'if (import.meta.env.DEV) console.warn(');

content = content.replace(/=> if \(import\.meta\.env\.DEV\) console\.error\(([^)]*)\)/g, '=> { if (import.meta.env.DEV) console.error($1); }');
content = content.replace(/=> if \(import\.meta\.env\.DEV\) console\.warn\(([^)]*)\)/g, '=> { if (import.meta.env.DEV) console.warn($1); }');

fs.writeFileSync(targetFile, content, 'utf8');
console.log('App.jsx refactored successfully.');
