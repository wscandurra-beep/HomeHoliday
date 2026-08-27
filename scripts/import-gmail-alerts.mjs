import fs from 'node:fs/promises';
import path from 'node:path';
import { getAccessToken, getMessage, listMessageIds, messageHash } from './gmail/gmail-client.mjs';
import { parseAlertMessage } from './gmail/alert-parsers.mjs';
import { unresolvedHash, updateStores } from './gmail/importer.mjs';

const configPath = path.resolve('config/email-alerts.json');
const statePath = path.resolve('config/gmail-import-state.json');
const archivePath = path.resolve('config/email-alert-listings.json');
const storePath = path.resolve('public/data/listings.json');
const unresolvedPath = path.resolve('config/gmail-unresolved.json');

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

const config = await readJson(configPath, null);
if (!config) throw new Error('Missing config/email-alerts.json');
const state = await readJson(statePath, { lastProcessedAt: null, processedMessageHashes: [] });
const processed = new Set(state.processedMessageHashes ?? []);
const accessToken = await getAccessToken();
const afterEpoch = Math.max(0, Math.floor((Date.parse(state.lastProcessedAt ?? '1970-01-01T00:00:00.000Z') - 86400000) / 1000));
const query = `${config.gmailQuery} after:${afterEpoch} -in:spam -in:trash`;
const messageIds = await listMessageIds(accessToken, query, Number(config.maxMessagesPerRun ?? 100));

const parsedListings = [];
const unresolved = [];
const seenMessages = [];
let latestProcessedAt = state.lastProcessedAt;
let alertMessages = 0;
let excludedListings = 0;

for (const id of messageIds.reverse()) {
  const hash = messageHash(id);
  if (processed.has(hash)) continue;
  const message = await getMessage(accessToken, id);
  const result = await parseAlertMessage(message, config);
  seenMessages.push(hash);
  latestProcessedAt = [latestProcessedAt, message.internalDate].filter(Boolean).sort().at(-1);
  if (!result.provider) continue;
  if (result.candidateCount) alertMessages += 1;
  excludedListings += result.excluded ?? 0;
  parsedListings.push(...result.listings);
  unresolved.push(...result.unresolved.map((entry) => ({ ...entry, hash: unresolvedHash(entry) })));
}

const store = await readJson(storePath, { listings: [], refreshedAt: null, providerStatus: {} });
const emailArchive = await readJson(archivePath, []);
const previousUnresolved = await readJson(unresolvedPath, []);
const observedAt = latestProcessedAt ?? new Date().toISOString();
const summary = {
  messages: alertMessages,
  imported: parsedListings.length,
  unresolved: unresolved.length,
  excluded: excludedListings
};
const updated = updateStores(store, emailArchive, parsedListings, observedAt, summary);
const unresolvedByHash = new Map(previousUnresolved.map((entry) => [entry.hash, entry]));
for (const entry of unresolved) unresolvedByHash.set(entry.hash, entry);

await writeJson(storePath, updated.store);
await writeJson(archivePath, updated.archiveListings);
await writeJson(unresolvedPath, [...unresolvedByHash.values()].slice(-100));
await writeJson(statePath, {
  lastProcessedAt: latestProcessedAt ?? state.lastProcessedAt,
  processedMessageHashes: [...processed, ...seenMessages].slice(-1000)
});

console.log(`Gmail alerts: ${summary.messages} messages, ${summary.imported} listings imported/updated, ${summary.unresolved} unresolved.`);
if (unresolved.length) {
  console.warn('Unresolved Immobiliare.it alerts were retained in config/gmail-unresolved.json without inventing an ID or URL.');
}
