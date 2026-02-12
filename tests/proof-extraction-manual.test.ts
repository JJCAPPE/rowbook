import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Define __dirname (not available in ES modules)
const __dirname = new URL('.', import.meta.url).pathname;

// Load .env manually
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Import the service
// @ts-ignore - Importing from outside root might need explicit path if alias not handled
import { extractProofWithGemini } from '../apps/web/src/server/services/proof-extraction-service.ts';

test('Proof Extraction Manual Test', async (t) => {
  const processImage = async (filename: string, expectedMinutes: number, expectedDate: string) => {
    const filePath = path.join(__dirname, filename);
    const buffer = fs.readFileSync(filePath);

    console.log(`\nProcessing ${filename}...`);
    try {
      const result = await extractProofWithGemini(buffer);
      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result, 'Result should not be null');
      
      // Validate Date
      // We expect the date to match closely or exactly
      assert.strictEqual(result.date, expectedDate, `Date mismatch for ${filename}. Expected ${expectedDate}, got ${result.date}`);

      // Validate Minutes
      assert.ok(result.minutes !== null, 'Minutes should not be null');
      if (result.minutes !== null) {
          const diff = Math.abs(result.minutes - expectedMinutes);
          assert.ok(diff <= 1, `Minutes mismatch for ${filename}. Expected ${expectedMinutes} (+/- 1), got ${result.minutes}. Diff: ${diff}`);
      }
    } catch (error) {
       console.error(`Error processing ${filename}:`, error);
       throw error;
    }
  };

  await t.test('Garmin Proof', async () => {
    // Jan 29th -> 2026-01-29
    await processImage('garmin.PNG', 92, '2026-01-29');
  });

  await t.test('Strava Proof', async () => {
    // Jan 29th -> 2026-01-29
    await processImage('strava.PNG', 92, '2026-01-29');
  });
});
