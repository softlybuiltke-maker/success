import { createClient } from '@libsql/client';

async function test() {
  const client = createClient({ url: 'file:test.db' });
  
  const schemas = [
    `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, price REAL, costPrice REAL, barcode TEXT, expiryDate TEXT, quantity REAL, category TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS salesHistory (id TEXT PRIMARY KEY, date TEXT, total REAL, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, phone TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS debts (id TEXT PRIMARY KEY, customerName TEXT, amount REAL, date TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS paidDebts (id TEXT PRIMARY KEY, customerName TEXT, amount REAL, date TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, category TEXT, amount REAL, date TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS stockHistory (id TEXT PRIMARY KEY, productName TEXT, addedQuantity REAL, date TEXT, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, full_json TEXT)`,
    `CREATE TABLE IF NOT EXISTS superAdminSettings (id INTEGER PRIMARY KEY, full_json TEXT)`
  ];
  for (const schema of schemas) {
    await client.execute(schema);
  }

  // Insert some data WITHOUT full_json
  await client.execute(`INSERT OR REPLACE INTO products (id, name, price) VALUES ('1', 'Apple', 1.5)`);

  const tables = ['products', 'salesHistory', 'customers', 'debts', 'paidDebts', 'expenses', 'stockHistory', 'settings', 'superAdminSettings'];
  const data = {};
  
  // Use transaction/batch for faster reads
  const stmts = tables.map(t => ({ sql: `SELECT * FROM ${t}`, args: [] }));
  const results = await client.batch(stmts, 'read');

  results.forEach((result, idx) => {
    const key = tables[idx];
    const parsedRows = [];
    for (const row of result.rows) {
      if (row.full_json) {
        try {
          const item = JSON.parse(row.full_json);
          if (item && typeof item === 'object') {
            parsedRows.push(item);
          }
        } catch(e) {}
      } else {
        const fallback = { ...row };
        delete fallback.full_json;
        if (Object.keys(fallback).length > 0) {
          parsedRows.push(fallback);
        }
      }
    }

    if (key === 'settings' || key === 'superAdminSettings') {
      data[key] = parsedRows.length > 0 ? parsedRows[0] : null;
    } else {
      data[key] = parsedRows;
    }
  });

  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
