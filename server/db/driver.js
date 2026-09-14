/**
 * SQLite driver adapter.
 *
 * Primary driver: better-sqlite3 (installed via npm, works on Windows/macOS/Linux).
 * Fallback driver: the built-in `node:sqlite` module (Node 22.5+), used when the
 * better-sqlite3 native binding is unavailable on the machine. Both expose the
 * same tiny surface used by this app: exec / prepare(get|all|run) / transaction.
 */
export async function openDatabase(dbPath) {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return {
      driver: "better-sqlite3",
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
      transaction: (fn) => db.transaction(fn),
    };
  } catch (error) {
    const { DatabaseSync } = await import("node:sqlite");
    console.warn(
      `[db] better-sqlite3 unavailable (${error.message.split("\n")[0]}) — using built-in node:sqlite`,
    );
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    const prepare = (sql) => {
      const stmt = db.prepare(sql);
      const norm = (args) => args.map((a) => (a === undefined ? null : a));
      return {
        get: (...args) => stmt.get(...norm(args)),
        all: (...args) => stmt.all(...norm(args)),
        run: (...args) => stmt.run(...norm(args)),
      };
    };
    return {
      driver: "node:sqlite",
      exec: (sql) => db.exec(sql),
      prepare,
      transaction:
        (fn) =>
        (...args) => {
          db.exec("BEGIN");
          try {
            const result = fn(...args);
            db.exec("COMMIT");
            return result;
          } catch (error2) {
            db.exec("ROLLBACK");
            throw error2;
          }
        },
    };
  }
}
