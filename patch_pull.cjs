const fs = require('fs');
let code = fs.readFileSync('api/pull.js', 'utf8');

code = code.replace(
  'const stmts = tables.map(t => ({ sql: `SELECT full_json FROM ${t}`, args: [] }));',
  'const stmts = tables.map(t => ({ sql: `SELECT * FROM ${t}`, args: [] }));'
);

code = code.replace(
  /for \(const row of result\.rows\) \{\n\s*if \(row\.full_json\) \{[\s\S]*?\} catch\(e\) \{\}\n\s*\}/,
  `for (const row of result.rows) {
        if (row.full_json) {
          try {
            const item = JSON.parse(row.full_json);
            if (item && typeof item === 'object') {
              parsedRows.push(item);
            }
          } catch(e) {}
        } else {
          // Fallback if full_json is missing (e.g. manually entered data)
          const fallback = { ...row };
          delete fallback.full_json;
          if (Object.keys(fallback).length > 0) {
            parsedRows.push(fallback);
          }
        }
      }`
);

fs.writeFileSync('api/pull.js', code);
console.log('api/pull.js updated for fallback parsing');
