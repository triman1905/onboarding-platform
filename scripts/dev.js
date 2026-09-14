/**
 * Starts the Vite frontend and the local Express backend together.
 *
 * Any extra CLI args (e.g. `--port 8080` injected by a hosted sandbox) are
 * forwarded to Vite, so `npm run dev` works both locally and in Lovable.
 */
import { spawn } from "node:child_process";

const passthrough = process.argv.slice(2);
const hasPort = passthrough.includes("--port");
const viteArgs = ["vite", "dev", ...passthrough, ...(hasPort ? [] : ["--port", "5173"])];

const children = [
  spawn("npx", viteArgs, { stdio: "inherit", shell: process.platform === "win32" }),
  spawn("node", ["server/index.js"], { stdio: "inherit", shell: process.platform === "win32" }),
];

const shutdown = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
children.forEach((child) =>
  child.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  }),
);
