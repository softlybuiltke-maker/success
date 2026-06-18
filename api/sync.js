// api/sync.js — Vercel Serverless Function
// Completely rebuilds individual tables to give a relational structure
import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { url, token, key, value } = req.body || {};
  if (!url || !token || !key || value === undefined) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken: token.trim() });

    // 1. Table Schemas for all collections
    const schemas = {
      products: `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, price REAL, costPrice REAL, barcode TEXT, expiryDate TEXT, quantity REAL, category TEXT, full_json TEXT)`,
      salesHistory: `CREATE TABLE IF NOT EXISTS salesHistory (id TEXT PRIMARY KEY, date TEXT, total REAL, full_json TEXT)`,
      customers: `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, phone TEXT, full_json TEXT)`,
      debts: `CREATE TABLE IF NOT EXISTS debts (id TEXT PRIMARY KEY, customerName TEXT, amount REAL, date TEXT, full_json TEXT)`,
      paidDebts: `CREATE TABLE IF NOT EXISTS paidDebts (id TEXT PRIMARY KEY, customerName TEXT, amount REAL, date TEXT, full_json TEXT)`,
      expenses: `CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, category TEXT, amount REAL, date TEXT, full_json TEXT)`,
      stockHistory: `CREATE TABLE IF NOT EXISTS stockHistory (id TEXT PRIMARY KEY, productName TEXT, addedQuantity REAL, date TEXT, full_json TEXT)`,
      settings: `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, full_json TEXT)`,
      superAdminSettings: `CREATE TABLE IF NOT EXISTS superAdminSettings (id INTEGER PRIMARY KEY, full_json TEXT)`
    };

    if (!schemas[key]) return res.status(400).json({ ok: false, error: 'Unknown collection' });

    // 2. Create the specific table if it doesn't exist
    await client.execute(schemas[key]);

    // 3. Prepare the batch transaction (Full replace to perfectly sync deletions/updates)
    let parsedData = [];
    try {
      parsedData = JSON.parse(value);
    } catch(e) {
      return res.status(400).json({ ok: false, error: 'Invalid JSON' });
    }

    const stmts = [];
    stmts.push({ sql: `DELETE FROM ${key}`, args: [] }); // Clear table

    if (key === 'settings' || key === 'superAdminSettings') {
      // It's a single object
      stmts.push({
        sql: `INSERT INTO ${key} (id, full_json) VALUES (1, ?)`,
        args: [JSON.stringify(parsedData)]
      });
    } else {
      // It's an array of items
      if (Array.isArray(parsedData)) {
        parsedData.forEach((item, index) => {
          const id = String(item.id || item.date || index);
          
          if (key === 'products') {
            stmts.push({ sql: `INSERT INTO products (id, name, price, costPrice, barcode, expiryDate, quantity, category, full_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [id, item.name||'', item.price||0, item.costPrice||0, item.barcode||'', item.expiryDate||'', item.quantity||0, item.category||'', JSON.stringify(item)] });
          } else if (key === 'salesHistory') {
            stmts.push({ sql: `INSERT INTO salesHistory (id, date, total, full_json) VALUES (?, ?, ?, ?)`, args: [id, item.date||'', item.total||0, JSON.stringify(item)] });
          } else if (key === 'customers') {
            stmts.push({ sql: `INSERT INTO customers (id, name, phone, full_json) VALUES (?, ?, ?, ?)`, args: [id, item.name||'', item.phone||'', JSON.stringify(item)] });
          } else if (key === 'debts') {
            stmts.push({ sql: `INSERT INTO debts (id, customerName, amount, date, full_json) VALUES (?, ?, ?, ?, ?)`, args: [id, item.customerName||item.name||'', item.amount||0, item.date||'', JSON.stringify(item)] });
          } else if (key === 'paidDebts') {
            stmts.push({ sql: `INSERT INTO paidDebts (id, customerName, amount, date, full_json) VALUES (?, ?, ?, ?, ?)`, args: [id, item.customerName||item.name||'', item.amount||0, item.date||'', JSON.stringify(item)] });
          } else if (key === 'expenses') {
            stmts.push({ sql: `INSERT INTO expenses (id, category, amount, date, full_json) VALUES (?, ?, ?, ?, ?)`, args: [id, item.category||item.name||'', item.amount||0, item.date||'', JSON.stringify(item)] });
          } else if (key === 'stockHistory') {
            stmts.push({ sql: `INSERT INTO stockHistory (id, productName, addedQuantity, date, full_json) VALUES (?, ?, ?, ?, ?)`, args: [id, item.productName||'', item.addedQuantity||0, item.date||'', JSON.stringify(item)] });
          }
        });
      }
    }

    // Execute all deletes and inserts in one transaction
    await client.batch(stmts, 'write');

    // ✅ Update last_modified timestamp so polling devices detect the change instantly
    await client.execute(`CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY, last_modified INTEGER NOT NULL DEFAULT 0)`);
    await client.execute(`INSERT OR REPLACE INTO meta (id, last_modified) VALUES (1, ${Date.now()})`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message || 'Sync failed.' });
  } finally {
    try { client?.close(); } catch (_) {}
  }
}
