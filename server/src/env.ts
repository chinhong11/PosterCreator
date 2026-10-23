// Loads server/.env into process.env. Imported first by index.ts so settings
// are in place before any module reads them (auth.ts reads APP_PASSWORD at
// import time). Resolved by absolute path, so it works whatever directory the
// server is started from. Variables already set in the shell take precedence,
// and a missing .env file is fine.
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
