// api/pull.js — Vercel Serverless Function
// Pulls all POS data from individual relational tables
import { createClient } from '@libsql/client/web';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) return res.status(500).json({ ok: false, error: 'Database configuration missing on server.' });

  let client;
  try {
    const httpUrl = url.trim().replace(/^libsql:\/\//, 'https://');
    client = createClient({ url: httpUrl, authToken: token.trim() });

    // Ensure all tables exist so SELECT queries don't fail on new databases
    const schemas = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, firebase_uid TEXT UNIQUE, full_name TEXT, email TEXT, role TEXT, business_id TEXT, created_at TEXT, full_json TEXT)`,
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

    const tables = ['users', 'products', 'salesHistory', 'customers', 'debts', 'paidDebts', 'expenses', 'stockHistory', 'settings', 'superAdminSettings'];
    const data = {};
    
    // Use transaction/batch for faster reads
    const stmts = tables.map(t => ({ sql: `SELECT full_json FROM ${t}`, args: [] }));
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
        }
      }

      if (key === 'settings' || key === 'superAdminSettings') {
        data[key] = parsedRows.length > 0 ? parsedRows[0] : null;
      } else {
        data[key] = parsedRows;
      }
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message || 'Pull failed.' });
  } finally {
    try { client?.close(); } catch (_) {}
  }
}
