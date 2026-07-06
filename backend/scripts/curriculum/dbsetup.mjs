// Create the local `fahim` database if it does not exist. Tries a few common
// local-Postgres connection defaults (trust/peer auth on macOS Homebrew).
import pg from "pg";
const { Client } = pg;

const user = process.env.USER || "postgres";
const candidates = [
  `postgresql://${user}@localhost:5432/postgres`,
  `postgresql://${user}@localhost:5432/${user}`,
  `postgresql://postgres@localhost:5432/postgres`,
];

let connected = null;
for (const cs of candidates) {
  const c = new Client({ connectionString: cs, connectionTimeoutMillis: 4000 });
  try {
    await c.connect();
    connected = { c, cs };
    break;
  } catch (e) {
    try { await c.end(); } catch {}
  }
}
if (!connected) {
  console.error("COULD_NOT_CONNECT");
  process.exit(2);
}
const { c } = connected;
const { rows } = await c.query("SELECT 1 FROM pg_database WHERE datname='fahim'");
if (!rows.length) {
  await c.query("CREATE DATABASE fahim");
  console.log("CREATED fahim");
} else {
  console.log("EXISTS fahim");
}
await c.end();
console.log("ADMIN_CS " + connected.cs);
