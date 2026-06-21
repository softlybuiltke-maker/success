import CryptoJS from 'crypto-js';

const CLOUD_KV_API = "https://keyvalue.immanuel.co/api/KeyVal";
const APP_NAMESPACE = "SoftlyPOS_Cloud_Registry";

const testHandle = "TestStore_" + Date.now();
const testPassword = "SuperSecret123";
const testPayload = { url: "libsql://test-db.turso.io", token: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.test_token_value_here" };

console.log("=== CLOUD REGISTRY END-TO-END TEST ===");
console.log("Handle:", testHandle);
console.log("Password:", testPassword);
console.log("Payload:", JSON.stringify(testPayload));

// --- UPLOAD ---
console.log("\n--- UPLOADING ---");
const payloadStr = JSON.stringify(testPayload);
const ciphertext = CryptoJS.AES.encrypt(payloadStr, testPassword).toString();
const hexCiphertext = CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(ciphertext));
const chunks = hexCiphertext.match(/.{1,100}/g) || [];
console.log("Ciphertext length:", ciphertext.length);
console.log("Hex length:", hexCiphertext.length);
console.log("Chunk count:", chunks.length);

const countRes = await fetch(`${CLOUD_KV_API}/UpdateValue/${APP_NAMESPACE}/${encodeURIComponent(testHandle)}_count/${chunks.length}`, { method: 'POST' });
console.log("Count upload status:", countRes.status);

for (let i = 0; i < chunks.length; i++) {
  const res = await fetch(`${CLOUD_KV_API}/UpdateValue/${APP_NAMESPACE}/${encodeURIComponent(testHandle)}_${i}/${chunks[i]}`, { method: 'POST' });
  console.log(`Chunk ${i} upload status:`, res.status, `(${chunks[i].length} chars)`);
}

// --- DOWNLOAD ---
console.log("\n--- DOWNLOADING ---");
const countGetRes = await fetch(`${CLOUD_KV_API}/GetValue/${APP_NAMESPACE}/${encodeURIComponent(testHandle)}_count`);
const countText = await countGetRes.text();
console.log("Raw count response:", JSON.stringify(countText));
const count = parseInt(countText.replace(/["\s]/g, ''));
console.log("Parsed count:", count);

let hexResult = '';
for (let i = 0; i < count; i++) {
  const res = await fetch(`${CLOUD_KV_API}/GetValue/${APP_NAMESPACE}/${encodeURIComponent(testHandle)}_${i}`);
  const chunk = await res.text();
  console.log(`Chunk ${i} raw:`, JSON.stringify(chunk).substring(0, 60) + "...");
  hexResult += chunk.replace(/["\s]/g, '');
}

console.log("\nHex matches:", hexResult === hexCiphertext ? "✅ YES" : "❌ NO");

// --- DECRYPT ---
console.log("\n--- DECRYPTING ---");
const recoveredCiphertext = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Hex.parse(hexResult));
console.log("Recovered ciphertext matches:", recoveredCiphertext === ciphertext ? "✅ YES" : "❌ NO");

const bytes = CryptoJS.AES.decrypt(recoveredCiphertext, testPassword);
const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
console.log("Decrypted:", decryptedStr);

const result = JSON.parse(decryptedStr);
console.log("\n=== RESULT ===");
console.log("URL matches:", result.url === testPayload.url ? "✅" : "❌", result.url);
console.log("Token matches:", result.token === testPayload.token ? "✅" : "❌", result.token);
console.log("\n🎉 TEST", result.url === testPayload.url && result.token === testPayload.token ? "PASSED" : "FAILED");
