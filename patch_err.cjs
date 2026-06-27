const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

code = code.replace(
  '        if (result.ok && result.data) {',
  "        if (result.ok === false) { return { success: false, error: result.error }; }\n        if (result.ok && result.data) {"
);
code = code.replace(
  '            return true; // Indicates we pulled data',
  "            return { success: true };"
);
code = code.replace(
  '        return false; // Turso is empty or failed',
  "        return { success: false, error: 'Turso is empty' };"
);
code = code.replace(
  '      } catch (err) {',
  "      } catch (err) {\n        return { success: false, error: err.message };"
);
code = code.replace(
  /const p = await tursoPullAll\(\); if\(p\)/g,
  "const p = await tursoPullAll(); if(p && p.success)"
);
code = code.replace(
  /const pulled = await tursoPullAll\(\);\n                    if \(pulled\) \{/g,
  "const pulled = await tursoPullAll();\n                    if (pulled && pulled.success) {"
);
code = code.replace(
  /toast\.success\('Connected, but cloud store is empty\.', \{ id: toastId \}\);/g,
  "toast.success(pulled && pulled.error ? `Failed: ${pulled.error}` : 'Connected, but cloud store is empty.', { id: toastId });"
);

fs.writeFileSync('src/App.jsx', code);
console.log('App.jsx patched for error reporting');
