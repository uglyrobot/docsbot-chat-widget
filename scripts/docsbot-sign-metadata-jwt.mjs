#!/usr/bin/env node
/**
 * Mint a DocsBot metadata JWT (HS256) for local testing.
 * The Stripe customer ID belongs in the signed payload only — never in client identify/metadata.
 *
 * Usage:
 *   DOCSBOT_SIGNATURE_KEY="your_widget_signature_key" \
 *   DOCSBOT_TEAM_ID="nG4F5A3BFSBzdYc5TZIX" \
 *   DOCSBOT_BOT_ID="uy8srweloFNgRadNtwvf" \
 *   STRIPE_CUSTOMER_ID="cus_MjCntOVjGjAqYq" \
 *   node scripts/docsbot-sign-metadata-jwt.mjs
 */

import crypto from 'crypto';

function b64url(buf) {
	return Buffer.from(buf)
		.toString('base64')
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

const secret = process.env.DOCSBOT_SIGNATURE_KEY;
if (!secret) {
	console.error('DOCSBOT: Set DOCSBOT_SIGNATURE_KEY (from Widget embed page).');
	process.exit(1);
}

const teamId = process.env.DOCSBOT_TEAM_ID || 'nG4F5A3BFSBzdYc5TZIX';
const botId = process.env.DOCSBOT_BOT_ID || 'uy8srweloFNgRadNtwvf';
const stripeCustomerId =
	process.env.STRIPE_CUSTOMER_ID || 'cus_MjCntOVjGjAqYq';
const ttlSec = Number(process.env.DOCSBOT_JWT_TTL_SEC || 3600);

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
	exp: now + ttlSec,
	iat: now,
	team_id: teamId,
	bot_id: botId,
	metadata: {
		priv_stripe_customer_id: stripeCustomerId
	}
};

const encHeader = b64url(JSON.stringify(header));
const encPayload = b64url(JSON.stringify(payload));
const sig = crypto
	.createHmac('sha256', secret)
	.update(`${encHeader}.${encPayload}`)
	.digest();
const encSig = b64url(sig);

const jwt = `${encHeader}.${encPayload}.${encSig}`;
console.log(jwt);
