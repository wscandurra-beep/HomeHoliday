import crypto from 'node:crypto';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function requireValue(name, value) {
  if (!value) throw new Error(`Missing required Gmail OAuth secret: ${name}`);
  return value;
}

export function messageHash(messageId) {
  return crypto.createHash('sha256').update(String(messageId)).digest('hex');
}

export async function getAccessToken(credentials = process.env) {
  const body = new URLSearchParams({
    client_id: requireValue('GMAIL_CLIENT_ID', credentials.GMAIL_CLIENT_ID),
    client_secret: requireValue('GMAIL_CLIENT_SECRET', credentials.GMAIL_CLIENT_SECRET),
    refresh_token: requireValue('GMAIL_REFRESH_TOKEN', credentials.GMAIL_REFRESH_TOKEN),
    grant_type: 'refresh_token'
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`Gmail OAuth token refresh failed (${response.status})`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Gmail OAuth response did not include an access token');
  return payload.access_token;
}

async function gmailRequest(path, accessToken) {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Gmail API request failed (${response.status})`);
  return response.json();
}

export async function listMessageIds(accessToken, query, maxMessages = 100) {
  const ids = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(100, maxMessages - ids.length)) });
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await gmailRequest(`/messages?${params}`, accessToken);
    ids.push(...(payload.messages ?? []).map((message) => message.id));
    pageToken = payload.nextPageToken;
  } while (pageToken && ids.length < maxMessages);
  return ids.slice(0, maxMessages);
}

export function decodeBase64Url(value = '') {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function collectMimeBodies(part, output) {
  if (!part) return;
  const mimeType = String(part.mimeType ?? '').toLowerCase();
  if (part.body?.data && (mimeType === 'text/html' || mimeType === 'text/plain')) {
    output.push({ mimeType, content: decodeBase64Url(part.body.data) });
  }
  for (const child of part.parts ?? []) collectMimeBodies(child, output);
}

export function normalizeGmailMessage(payload) {
  const headers = Object.fromEntries(
    (payload.payload?.headers ?? []).map((header) => [String(header.name).toLowerCase(), header.value])
  );
  const bodies = [];
  collectMimeBodies(payload.payload, bodies);
  const html = bodies.find((body) => body.mimeType === 'text/html')?.content ?? '';
  const text = bodies.find((body) => body.mimeType === 'text/plain')?.content ?? '';
  return {
    id: payload.id,
    threadId: payload.threadId,
    internalDate: new Date(Number(payload.internalDate)).toISOString(),
    from: headers.from ?? '',
    subject: headers.subject ?? '',
    html,
    text
  };
}

export async function getMessage(accessToken, messageId) {
  const payload = await gmailRequest(`/messages/${encodeURIComponent(messageId)}?format=full`, accessToken);
  return normalizeGmailMessage(payload);
}
