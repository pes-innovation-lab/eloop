import assert from 'node:assert/strict';
import { encode } from 'next-auth/jwt';
import { generateQRCodeForStorage, verifyQRCode } from '../src/lib/qr';

// Run against local Workers preview with the same .dev.vars, never production.
const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview URL');
const secret = process.env.NEXTAUTH_SECRET;
assert(secret, 'Load the preview NEXTAUTH_SECRET with bun --env-file=.dev.vars');

const providers = await fetch(new URL('/api/auth/providers', base));
assert.equal(providers.status, 200);
assert.equal((await providers.json()).google.id, 'google');

const csrf = await fetch(new URL('/api/auth/csrf', base));
assert.equal(csrf.status, 200);
assert((await csrf.json()).csrfToken);
assert(csrf.headers.get('set-cookie')?.includes('csrf-token='));

const guest = await fetch(new URL('/api/env/csv', base));
assert.equal(guest.status, 401);
const dashboard = await fetch(new URL('/dashboard', base), { redirect: 'manual' });
assert([302, 307].includes(dashboard.status));
assert.equal(new URL(dashboard.headers.get('location')!, base).pathname, '/auth/signin');

const token = await encode({
  secret,
  token: { id: 'smoke-test', name: 'Smoke Test', email: 'smoke@example.invalid', role: 'admin', isApproved: true },
});
const headers = { cookie: `next-auth.session-token=${token}` };
const session = await fetch(new URL('/api/auth/session', base), { headers });
assert.equal(session.status, 200);
assert.equal((await session.json()).user.id, 'smoke-test');
// This exercises getServerSession(), not just NextAuth's public session endpoint.
const authorized = await fetch(new URL('/api/env/csv', base), { headers });
assert.equal(authorized.status, 200);
assert.equal(typeof (await authorized.json()).csvMailerLink, 'string');
const signIn = await fetch(new URL('/auth/signin', base), { redirect: 'manual' });
assert.equal(signIn.status, 200);
assert((await signIn.text()).includes('<html'));
const authenticatedSignIn = await fetch(new URL('/auth/signin', base), { headers, redirect: 'manual' });
assert([302, 307].includes(authenticatedSignIn.status));
assert.equal(new URL(authenticatedSignIn.headers.get('location')!, base).pathname, '/dashboard');

const qr = await generateQRCodeForStorage('smoke-test', 'smoke-event');
assert.equal((await verifyQRCode(qr))?.eventId, 'smoke-event');
assert.equal(await verifyQRCode('invalid-token'), null);
console.log('Workers smoke checks passed: providers, CSRF, sessions, route/proxy auth, HTML, QR signing.');
