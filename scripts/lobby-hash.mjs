#!/usr/bin/env node
// Lobby login values for the server environment (docs/OPERATIONS.md, ARCHITECTURE.md § 4.4). node:crypto only.
//
//   node scripts/lobby-hash.mjs <password>            one scrypt hash: scrypt$N$r$p$salt$hash
//   node scripts/lobby-hash.mjs --users <password>    LOBBY_USERS=… for the five accounts, base64url JSON
//   node scripts/lobby-hash.mjs --users-json <pw>     the same as plain JSON (for the Vercel settings page)
//   node scripts/lobby-hash.mjs --secret              LOBBY_AUTH_SECRET=… (32 random bytes)
//
// Pass "-" as the password to read it from stdin instead of the command line (keeps it out of shell history).
// Why base64url: Next's .env loader expands "$1"-style sequences, which would eat the $ separators of a hash.
// Same format and cost as src/features/auth/password.ts (a test keeps the two in step). Prints nothing else.
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";

const COST = { N: 2 ** 17, r: 8, p: 1 };
const ACCOUNTS = [
  { u: "hamad", name: "Hamad", role: "admin" },
  { u: "shiraz", name: "Shiraz", role: "admin" },
  { u: "resepsjon", name: "Resepsjonist", role: "receptionist" },
  { u: "robot", name: "Robotansvarlig", role: "robot" },
  // The Airbnb host: their own app under /vert, no hotel screens, no view switcher.
  { u: "vert", name: "Ingrid Berge", role: "host" },
];

function hash(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, 32, { ...COST, maxmem: 2 * 128 * COST.N * COST.r }, (error, key) => {
      if (error) reject(error);
      else resolve(["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$"));
    });
  });
}

function usage(message) {
  if (message) console.error(message);
  console.error("usage: node scripts/lobby-hash.mjs <password> | --users <password> | --users-json <password> | --secret");
  process.exit(2);
}

function readPassword(arg) {
  const password = arg === "-" ? readFileSync(0, "utf8").replace(/\r?\n$/, "") : arg;
  if (!password) usage("a password is required");
  if (password.length > 128) usage("the password is longer than 128 characters (the login form's limit)");
  return password;
}

const [first, second] = process.argv.slice(2);

if (first === "--secret") {
  console.log(`LOBBY_AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
} else if (first === "--users" || first === "--users-json") {
  const password = readPassword(second);
  const users = [];
  for (const account of ACCOUNTS) users.push({ ...account, hash: await hash(password) });
  const json = JSON.stringify(users);
  console.log(first === "--users" ? `LOBBY_USERS=${Buffer.from(json).toString("base64url")}` : json);
} else if (first && !first.startsWith("--")) {
  console.log(await hash(readPassword(first)));
} else {
  usage(first ? `unknown option ${first}` : undefined);
}
