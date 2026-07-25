#!/usr/bin/env node
/**
 * Export the project's real on-chain participation to `docs/user-activity.csv`.
 *
 * Level 5 asks for proof of users, not a claim of them. Every row here is read
 * live from testnet — the factory's registry, each circle's `members()`, and
 * the feedback registry — so any reviewer can re-run this and get the same
 * numbers, or paste an address into Stellar Expert and see the transactions.
 *
 *   node scripts/export-users.mjs            # writes docs/user-activity.csv
 *   node scripts/export-users.mjs --json     # also writes docs/user-activity.json
 *
 * The Google Form responses live in `docs/user-feedback.xlsx` alongside this;
 * the two together are the user record.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

// The SDK lives with the web app; this script is deliberately dependency-free.
const require = createRequire(resolve(repo, 'web/package.json'));
const { rpc, scValToNative, Contract, TransactionBuilder, Account, nativeToScVal } =
  require('@stellar/stellar-sdk');

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';

const deployments = require('../deployments/testnet.json');
const { factoryId: FACTORY, feedbackId: FEEDBACK, admin: SOURCE } = deployments;

const server = new rpc.Server(RPC_URL);
const u32 = (n) => nativeToScVal(n, { type: 'u32' });

/** Read-only contract call: simulated, never submitted, so nothing is signed. */
async function call(contractId, method, ...args) {
  const tx = new TransactionBuilder(new Account(SOURCE, '0'), {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (sim.error) throw new Error(`${contractId} ${method}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}

const ROLES = ['organizer', 'member', 'exploring'];
const XLM = (stroops) => (Number(stroops) / 10_000_000).toString();
const expert = (id) =>
  `https://stellar.expert/explorer/testnet/${id.startsWith('C') ? 'contract' : 'account'}/${id}`;

const circles = [];
for (const row of await call(FACTORY, 'listing', u32(0), u32(50))) {
  circles.push({
    address: String(row.address),
    name: String(row.name),
    organizer: String(row.organizer),
    private: Boolean(row.private),
    status: ['filling', 'active', 'complete'][Number(row.status)],
    size: Number(row.size),
    round: Number(row.round),
    contribution: XLM(row.contribution),
    collateral: XLM(row.collateral),
    members: (await call(String(row.address), 'members')).map(String),
  });
}

const feedback = (await call(FEEDBACK, 'list', u32(0), u32(200))).map((entry) => ({
  author: String(entry.author),
  sentiment: Number(entry.sentiment),
  role: ROLES[Number(entry.role)] ?? String(entry.role),
  note: String(entry.note),
  at: new Date(Number(entry.at) * 1000).toISOString(),
}));

// One row per wallet: what that person actually did, on chain.
const wallets = new Map();
const touch = (address) =>
  wallets.get(address) ??
  wallets.set(address, { address, joined: [], organized: [], feedback: null }).get(address);

for (const circle of circles) {
  touch(circle.organizer).organized.push(circle.name);
  for (const member of circle.members) touch(member).joined.push(circle.name);
}
for (const entry of feedback) touch(entry.author).feedback = entry;

const rows = [...wallets.values()].sort((a, b) => a.address.localeCompare(b.address));

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const header = [
  'wallet',
  'circles_joined',
  'circles_organized',
  'left_feedback',
  'rating_1_5',
  'self_reported_role',
  'feedback_note',
  'feedback_at_utc',
  'stellar_expert',
];

const csv = [
  header.join(','),
  ...rows.map((r) =>
    [
      r.address,
      r.joined.join(' | '),
      r.organized.join(' | '),
      r.feedback ? 'yes' : 'no',
      r.feedback?.sentiment ?? '',
      r.feedback?.role ?? '',
      r.feedback?.note ?? '',
      r.feedback?.at ?? '',
      expert(r.address),
    ]
      .map(csvCell)
      .join(','),
  ),
].join('\n');

mkdirSync(resolve(repo, 'docs'), { recursive: true });
writeFileSync(resolve(repo, 'docs/user-activity.csv'), `${csv}\n`, 'utf8');

if (process.argv.includes('--json')) {
  writeFileSync(
    resolve(repo, 'docs/user-activity.json'),
    `${JSON.stringify({ factory: FACTORY, feedbackRegistry: FEEDBACK, circles, feedback, wallets: rows }, null, 2)}\n`,
    'utf8',
  );
}

const ratings = feedback.map((f) => f.sentiment);
const average = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : '—';

console.log(`circles        : ${circles.length}`);
console.log(`distinct wallets: ${rows.length}`);
console.log(`feedback entries: ${feedback.length}  (avg ${average}/5)`);
console.log('wrote docs/user-activity.csv');
