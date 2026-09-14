import "dotenv/config";
import { initDb } from "./db/database.js";
import { createApp } from "./app.js";
import { startScheduler } from "./scheduler/reminderScheduler.js";

const PORT = Number(process.env.PORT || 3001);

const dbPath = await initDb();
const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}`);
  console.log(`[server] SQLite database: ${dbPath}`);
  startScheduler();
});
