const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add safeJSONParse at the top
const safeJsonDef = `
// Safe JSON parser to prevent UI crashes
function safeJSONParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error('JSON parse error:', e);
    return fallback;
  }
}
`;
code = code.replace(/import React[^;]+;/, match => match + safeJsonDef);

// 2. Replace JSON.parse( with safeJSONParse(
code = code.replace(/JSON\.parse\(/g, 'safeJSONParse(');

// 3. Replace array methods with optional chaining
// E.g. .map( -> ?.map(
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.map\(/g, '$1?.map(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.filter\(/g, '$1?.filter(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.reduce\(/g, '$1?.reduce(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.some\(/g, '$1?.some(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.every\(/g, '$1?.every(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.forEach\(/g, '$1?.forEach(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.sort\(/g, '$1?.sort(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.find\(/g, '$1?.find(');
code = code.replace(/([a-zA-Z0-9_\]\)]+)\.findIndex\(/g, '$1?.findIndex(');

fs.writeFileSync('src/App.jsx', code);
console.log('App.jsx updated safely.');
