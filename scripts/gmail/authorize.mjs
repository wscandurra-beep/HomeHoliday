import crypto from 'node:crypto';
import http from 'node:http';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  throw new Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running npm run gmail:authorize');
}

const port = 53682;
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const state = crypto.randomBytes(24).toString('hex');
const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  access_type: 'offline',
  prompt: 'consent',
  state
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  if (url.pathname !== '/oauth2/callback') {
    response.writeHead(404).end('Not found');
    return;
  }
  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
    response.writeHead(400).end('OAuth response is invalid.');
    server.close();
    return;
  }
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: url.searchParams.get('code'),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.refresh_token) throw new Error(token.error_description || token.error || 'No refresh token returned');
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Gmail authorization completed. You may close this window.');
    console.log('\nSave this value as the GitHub Actions secret GMAIL_REFRESH_TOKEN:\n');
    console.log(token.refresh_token);
  } catch (error) {
    response.writeHead(500).end('Token exchange failed. Check the terminal.');
    console.error(error);
  } finally {
    server.close();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('Open this URL in your browser and authorize the Gmail account:\n');
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
