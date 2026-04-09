#!/usr/bin/env tsx
/**
 * Gmail OAuth2 Setup Helper
 *
 * Walks you through getting a refresh token for the Gmail API.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project (or select existing)
 *   3. Enable the Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com
 *   4. Create OAuth 2.0 credentials (Desktop app): https://console.cloud.google.com/apis/credentials
 *   5. Download the credentials JSON or copy Client ID + Client Secret
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy npx tsx scripts/gmail-auth-setup.ts
 */

import * as readline from 'readline';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080'; // Google deprecated the oob flow; localhost works for Desktop clients
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n🔧 Gmail OAuth2 Setup\n');

  let clientId = CLIENT_ID;
  let clientSecret = CLIENT_SECRET;

  if (!clientId) {
    clientId = await ask('Enter your Gmail Client ID: ');
  }
  if (!clientSecret) {
    clientSecret = await ask('Enter your Gmail Client Secret: ');
  }

  if (!clientId || !clientSecret) {
    console.error('❌ Client ID and Client Secret are required.');
    console.error('   Get them at: https://console.cloud.google.com/apis/credentials');
    process.exit(1);
  }

  // Step 1: Generate authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\n📋 Step 1: Open this URL in your browser and authorize the app:\n');
  console.log(`   ${authUrl.toString()}\n`);

  // Step 2: Get the authorization code
  const code = await ask('📋 Step 2: Paste the authorization code here: ');

  if (!code) {
    console.error('❌ Authorization code is required.');
    process.exit(1);
  }

  // Step 3: Exchange code for tokens
  console.log('\n🔄 Exchanging code for tokens...');

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenResp.ok) {
    const error = await tokenResp.text();
    console.error(`❌ Token exchange failed: ${error}`);
    process.exit(1);
  }

  const tokens = await tokenResp.json();

  if (!tokens.refresh_token) {
    console.error('❌ No refresh token received. Try revoking access at https://myaccount.google.com/permissions and retry.');
    process.exit(1);
  }

  console.log('\n✅ Success! Add these to your .env file:\n');
  console.log(`GMAIL_CLIENT_ID=${clientId}`);
  console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\nThen run: npx tsx scripts/email-sync.ts --days 3');
}

main().catch(e => {
  console.error(`\n❌ Error: ${e.message}`);
  process.exit(1);
});
