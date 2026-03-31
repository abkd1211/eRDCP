import { createClient } from 'redis';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("REDIS_URL not found in .env");
  process.exit(1);
}

const client = createClient({ url: REDIS_URL });

async function reset() {
  await client.connect();
  const key = `gateway:circuit:agent`;
  await client.del(key);
  console.log(`Circuit Breaker RESET for agent (Deleted key: ${key})`);
  await client.disconnect();
}

reset().catch(console.error);
