import "dotenv/config";
import { initDb } from "../db/database.js";

const dbPath = await initDb();
console.log(`✓ SQLite database initialised at ${dbPath}`);
console.log("✓ Seeded email templates and the test batch (V001 Rahul Sharma, V002 Priya Verma)");
console.log("Next: copy .env.example to .env, add GMAIL_USER / GMAIL_APP_PASSWORD, then run npm run dev");
