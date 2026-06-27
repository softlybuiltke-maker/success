const { createClient } = require('@libsql/client');
async function test() {
  const client = createClient({ url: 'file:test_case.db' });
  await client.execute('CREATE TABLE IF NOT EXISTS Products (id TEXT, name TEXT)');
  await client.execute('INSERT INTO Products VALUES ("1", "Apple")');
  const res = await client.execute('SELECT * FROM products');
  console.log('Rows:', res.rows.length);
}
test().catch(console.error);
