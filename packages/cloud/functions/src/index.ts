import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { handleEscrowError, validateEscrowInput } from './key-escrow-errors';
import * as openpgp from 'openpgp';
import { randomBytes } from 'crypto';

admin.initializeApp();
const db = admin.firestore();

// Helpers
const corsHandler = cors({ origin: true });

type Authed = { projectId: string };

async function brokerKeyBelongsToProject(kref: string, projectId: string): Promise<boolean> {
  const key = await db.collection('docKeys').doc(kref).get();
  return key.exists && key.data()?.projectId === projectId;
}

async function recordUsage(projectId: string, feature: string, inc = 1) {
  const ts = admin.firestore.Timestamp.now();
  await db.collection('usage_events').add({ projectId, feature, inc, ts });
  // Also increment live counters for immediate rate-limit and dashboard visibility
  const minuteISO = new Date().toISOString().slice(0, 16);
  const ref = db.collection('usage_counters').doc(projectId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? snap.data() : {}) as any;
    const perMin = data.perMin || {};
    const current = { ...(perMin[minuteISO] || {}) };
    current[feature] = (current[feature] || 0) + inc;
    const byFeature = data.byFeature || {};
    byFeature[feature] = (byFeature[feature] || 0) + inc;
    tx.set(ref, { perMin: { [minuteISO]: current }, byFeature }, { merge: true });
  });
}

async function checkRateLimit(projectId: string): Promise<void> {
  const proj = await db.collection('projects').doc(projectId).get();
  if (!proj.exists) return;
  const limits = (proj.data()?.limits || {}) as any;
  const perMinLimit = limits.cloudCallsPerMin ?? 60;
  const minuteISO = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const counters = await db.collection('usage_counters').doc(projectId).get();
  const perMin = (counters.data()?.perMin || {})[minuteISO] || {};
  const count = (perMin['cloud_call'] as number) || 0;
  if (count >= perMinLimit) {
    throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
  }
}

function parseAuth(req: functions.https.Request): Authed | null {
  const header = req.headers['authorization'];
  if (!header) return null;
  const token = header.replace('Bearer ', '');
  const secret = (functions.config().jwt?.secret as string) || '';
  try {
    const payload = jwt.verify(token, secret) as any;
    return { projectId: payload.projectId };
  } catch {
    return null;
  }
}

function signProjectToken(projectId: string) {
  const secret = (functions.config().jwt?.secret as string) || '';
  const expiresIn = '30m';
  const token = jwt.sign({ projectId }, secret, { expiresIn });
  const exp = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { token, expiresAt: exp };
}

async function handlePing(req: functions.https.Request, res: functions.Response) {
  return res.status(200).json({ message: 'pong', timestamp: new Date().toISOString() });
}

async function handleAuthToken(req: functions.https.Request, res: functions.Response) {
  const apiKey = (req.headers['x-api-key'] || req.headers['X-API-Key']) as string | undefined;
  if (!apiKey) return res.status(401).json({ error: 'missing api key' });
  const keyDoc = await db.collection('apiKeys').doc(apiKey).get();
  if (!keyDoc.exists || keyDoc.data()?.active !== true) return res.status(401).json({ error: 'invalid api key' });
  const projectId = keyDoc.data()!.projectId as string;
  const out = signProjectToken(projectId);
  await recordUsage(projectId, 'cloud_call', 1);
  return res.json(out);
}

async function handleKeys(req: functions.https.Request, res: functions.Response, authed: Authed) {
  const { path } = req;
  const body = req.body || {};
  if (path.endsWith('/register') && req.method === 'POST') {
    const { userId, publicKeyArmored, privateKeyArmored } = body;
    if (typeof userId !== 'string' || !userId || typeof publicKeyArmored !== 'string') throw new functions.https.HttpsError('invalid-argument', 'userId and publicKeyArmored are required');
    if (privateKeyArmored && typeof privateKeyArmored !== 'string') throw new functions.https.HttpsError('invalid-argument', 'privateKeyArmored must be a string');
    await db.collection('users').doc(userId).set({ publicKeyArmored, ...(privateKeyArmored ? { privateKeyArmored } : {}) }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (path.endsWith('/escrow') && req.method === 'POST') {
    const { userId, encPrivKey } = body;
    const invalidInput = validateEscrowInput(userId, encPrivKey);
    if (invalidInput) return res.status(400).json(invalidInput);

    try {
      await db.collection('escrow').doc(userId).set({ encPrivKey, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await recordUsage(authed.projectId, 'cloud_call', 1);
      return res.status(204).end();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      console.error('Key escrow storage failed', { code });
      return handleEscrowError(res, error, 'store');
    }
  }
  if (path.endsWith('/recover') && req.method === 'POST') {
    const { userId } = body;
    const invalidInput = validateEscrowInput(userId);
    if (invalidInput) return res.status(400).json(invalidInput);

    try {
      const doc = await db.collection('escrow').doc(userId).get();
      await recordUsage(authed.projectId, 'cloud_call', 1);
      return res.json({ encPrivKey: doc.data()?.encPrivKey || null });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      console.error('Key escrow recovery failed', { code });
      return handleEscrowError(res, error, 'recover');
    }
  }
  return res.status(404).json({ error: 'not found' });
}

async function handleBroker(req: functions.https.Request, res: functions.Response, authed: Authed) {
  const body = req.body || {};
  if (req.path.endsWith('/doc-key') && req.method === 'POST') {
    const { collection, docId } = body;
    if (typeof collection !== 'string' || !collection || typeof docId !== 'string' || !docId) {
      return res.status(400).json({ error: 'collection and docId are required' });
    }
    const kref = `k_${collection}_${docId}`;
    const ref = db.collection('docKeys').doc(kref);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.projectId !== authed.projectId) {
      return res.status(403).json({ error: 'document key belongs to another project' });
    }
    await ref.set({ alg: 'aes-gcm-256', projectId: authed.projectId, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ kref });
  }
  if (req.path.endsWith('/grant') && req.method === 'POST') {
    const { kref, recipientUserId, wrappedKey } = body;
    if (typeof kref !== 'string' || !kref || typeof recipientUserId !== 'string' || !recipientUserId) {
      return res.status(400).json({ error: 'kref and recipientUserId are required' });
    }
    if (typeof wrappedKey !== 'string' || !wrappedKey.startsWith('-----BEGIN PGP MESSAGE-----')) {
      return res.status(400).json({ error: 'wrappedKey must be an armored OpenPGP message' });
    }
    if (!await brokerKeyBelongsToProject(kref, authed.projectId)) {
      return res.status(404).json({ error: 'document key not found' });
    }
    // Store only ciphertext. The broker never receives or unwraps the AES document key.
    await db.collection('docKeys').doc(kref).collection('recipients').doc(recipientUserId).set({
      wrappedKey,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (req.path.endsWith('/wrapped-key') && req.method === 'GET') {
    const kref = req.query.kref;
    const recipientUserId = req.query.recipientUserId;
    if (typeof kref !== 'string' || !kref || typeof recipientUserId !== 'string' || !recipientUserId) {
      return res.status(400).json({ error: 'kref and recipientUserId are required' });
    }
    if (!await brokerKeyBelongsToProject(kref, authed.projectId)) {
      return res.status(404).json({ error: 'document key not found' });
    }
    const grant = await db.collection('docKeys').doc(kref).collection('recipients').doc(recipientUserId).get();
    if (!grant.exists) return res.status(404).json({ error: 'wrapped key not found' });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ wrappedKey: grant.data()?.wrappedKey });
  }
  if (req.path.endsWith('/revoke') && req.method === 'POST') {
    const { kref, userId } = body;
    if (typeof kref !== 'string' || !kref || typeof userId !== 'string' || !userId) {
      return res.status(400).json({ error: 'kref and userId are required' });
    }
    if (!await brokerKeyBelongsToProject(kref, authed.projectId)) {
      return res.status(404).json({ error: 'document key not found' });
    }
    await db.collection('docKeys').doc(kref).collection('recipients').doc(userId).delete();
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (req.path.endsWith('/rotate') && req.method === 'POST') {
    const { kref } = body;
    await db.collection('docKeys').doc(kref).set({ rotatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  return res.status(404).json({ error: 'not found' });
}

function decodePayload(payload: unknown): Buffer {
  if (typeof payload !== 'string') throw new functions.https.HttpsError('invalid-argument', 'payload is required');
  if (payload.startsWith('base64:')) {
    const encoded = payload.slice(7);
    if (!validBase64(encoded)) throw new functions.https.HttpsError('invalid-argument', 'payload must contain valid base64 after base64:');
    return Buffer.from(encoded, 'base64');
  }
  return Buffer.from(payload, 'utf8');
}

function encodeBase64(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function validBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}

async function handleSignVerify(req: functions.https.Request, res: functions.Response, authed: Authed) {
  const body = req.body || {};
  const keyId = body.keyId || authed.projectId;
  const keyRef = db.collection('users').doc(String(keyId));
  const keySnap = await keyRef.get();
  const keys = keySnap.data() || {};
  if (req.path === '/v1/sign' && req.method === 'POST') {
    const privateKeyArmored = keys.privateKeyArmored as string | undefined;
    if (!privateKeyArmored) throw new functions.https.HttpsError('failed-precondition', 'signing key is not registered');
    const payload = decodePayload(body.payload);
    const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
    const signingKey = keys.passphrase
      ? await openpgp.decryptKey({ privateKey, passphrase: keys.passphrase as string })
      : privateKey;
    const message = await openpgp.createMessage({ binary: Buffer.from(payload) });
    const signature = await openpgp.sign({ message, signingKeys: signingKey, format: 'armored' });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    if (typeof signature !== 'string') throw new functions.https.HttpsError('internal', 'signature format unavailable');
    return res.json({ signature: encodeBase64(Buffer.from(signature)), alg: 'pgp', signedAt: new Date().toISOString() });
  }
  if (req.path === '/v1/verify' && req.method === 'POST') {
    const publicKeyArmored = keys.publicKeyArmored as string | undefined;
    if (!publicKeyArmored || !validBase64(body.signature)) {
      throw new functions.https.HttpsError('invalid-argument', 'registered public key and signature are required');
    }
    const payload = decodePayload(body.payload);
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    let valid = false;
    try {
      const message = await openpgp.readMessage({ armoredMessage: Buffer.from(body.signature, 'base64').toString('utf8') });
      const verification = await openpgp.verify({ message, verificationKeys: publicKey });
      const result = verification.signatures[0];
      const signedPayload = message.getLiteralData();
      const matchesPayload = Boolean(signedPayload) && Buffer.compare(Buffer.from(signedPayload as Uint8Array), payload) === 0;
      if (result && matchesPayload) {
        await result.verified;
        valid = true;
      }
    } catch {
      valid = false;
    }
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ valid, ...(valid ? { signer: keyId, alg: 'pgp' } : {}) });
  }
  return res.status(404).json({ error: 'not found' });
}

async function handleSeal(req: functions.https.Request, res: functions.Response, authed: Authed) {
  const body = req.body || {};
  if (req.path === '/v1/seal/encrypt' && req.method === 'POST') {
    const payload = decodePayload(body.payload);
    const kref = typeof body.kref === 'string' && body.kref ? body.kref : db.collection('sealKeys').doc().id;
    const keyRef = db.collection('sealKeys').doc(kref);
    let keyBytes: Buffer;
    const existing = await keyRef.get();
    if (existing.exists) {
      const stored = existing.data()!;
      if (stored.projectId !== authed.projectId) throw new functions.https.HttpsError('permission-denied', 'key reference is not available');
      if (body.kref) throw new functions.https.HttpsError('already-exists', 'key reference already exists');
      keyBytes = Buffer.from(stored.key, 'base64');
    } else {
      keyBytes = randomBytes(32);
      await keyRef.create({ projectId: authed.projectId, key: keyBytes.toString('base64'), alg: 'aes-gcm-256', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const iv = randomBytes(12);
    const ciphertext = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ ciphertext: ciphertext.toString('base64'), meta: { version: 1, iv: iv.toString('base64') }, kref });
  }
  if (req.path === '/v1/seal/decrypt' && req.method === 'POST') {
    if (typeof body.kref !== 'string' || !validBase64(body.ciphertext)) throw new functions.https.HttpsError('invalid-argument', 'kref and valid base64 ciphertext are required');
    const snap = await db.collection('sealKeys').doc(body.kref).get();
    const stored = snap.data();
    if (!stored || stored.projectId !== authed.projectId) throw new functions.https.HttpsError('not-found', 'key reference not found');
    const key = await crypto.subtle.importKey('raw', Buffer.from(stored.key, 'base64'), { name: 'AES-GCM' }, false, ['decrypt']);
    const ciphertext = Buffer.from(body.ciphertext, 'base64');
    const meta = body.meta || {};
    if (meta.version !== 1 || !validBase64(meta.iv) || Buffer.from(meta.iv, 'base64').length !== 12) throw new functions.https.HttpsError('invalid-argument', 'meta.version and a 12-byte base64 iv are required');
    const plaintext = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(meta.iv, 'base64') }, key, ciphertext));
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ payload: plaintext.toString('base64') });
  }
  if (req.path === '/v1/seal/link/create' && req.method === 'POST') {
    const payload = decodePayload(body.payload);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new functions.https.HttpsError('invalid-argument', 'expiresAt must be in the future');
    const linkId = db.collection('sealLinks').doc().id;
    const kref = db.collection('sealKeys').doc().id;
    const keyBytes = randomBytes(32);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = randomBytes(12);
    const ciphertext = Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
    const batch = db.batch();
    batch.create(db.collection('sealKeys').doc(kref), { projectId: authed.projectId, key: keyBytes.toString('base64'), alg: 'aes-gcm-256', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.create(db.collection('sealLinks').doc(linkId), { projectId: authed.projectId, kref, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), expiresAt: admin.firestore.Timestamp.fromDate(expiresAt), maxOpens: Number.isInteger(body.maxOpens) && body.maxOpens > 0 ? body.maxOpens : null, opens: 0, revoked: false });
    await batch.commit();
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ linkId, openUrl: `/v1/seal/link/${linkId}`, kref });
  }
  if (req.path === '/v1/seal/link/revoke' && req.method === 'POST') {
    if (typeof body.linkId !== 'string') throw new functions.https.HttpsError('invalid-argument', 'linkId is required');
    const ref = db.collection('sealLinks').doc(body.linkId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.projectId !== authed.projectId) throw new functions.https.HttpsError('not-found', 'link not found');
    await ref.update({ revoked: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ revoked: true });
  }
  return res.status(404).json({ error: 'not found' });
}

async function handleAudit(req: functions.https.Request, res: functions.Response, authed: Authed) {
  if (req.method === 'POST') {
    const ev = req.body || {};
    const shard = `${authed.projectId}_${new Date().toISOString().slice(0, 10)}`;
    // Minimal chain/sign stub
    const id = db.collection('audit').doc().id;
    const doc = { ...ev, projectId: authed.projectId, id, ts: Date.now(), sig: 'SIGNATURE_PLACEHOLDER' };
    await db.collection('audit').doc(shard).collection('events').doc(id).set(doc);
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ id, sig: doc.sig });
  }
  if (req.method === 'GET') {
    const shard = `${authed.projectId}_${new Date().toISOString().slice(0, 10)}`;
    const snap = await db.collection('audit').doc(shard).collection('events').orderBy('ts', 'desc').limit(50).get();
    const items = snap.docs.map((d) => d.data());
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json(items);
  }
  return res.status(405).end();
}

async function handleConsent(req: functions.https.Request, res: functions.Response, authed: Authed) {
  if (req.method === 'POST') {
    const { subjectId, type, granted, method } = req.body || {};
    const id = db.collection('consent').doc().id;
    const rec = { subjectId, type, granted, method, ts: Date.now(), sig: 'SIGN_PLACEHOLDER', projectId: authed.projectId };
    await db.collection('consent').doc(subjectId).collection('records').doc(id).set(rec);
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ id, sig: rec.sig });
  }
  if (req.method === 'GET') {
    const subjectId = req.path.split('/').pop()!;
    const snap = await db.collection('consent').doc(subjectId).collection('records').orderBy('ts', 'desc').limit(100).get();
    const items = snap.docs.map((d) => d.data());
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json(items);
  }
  return res.status(405).end();
}

async function handleReports(req: functions.https.Request, res: functions.Response, authed: Authed) {
  if (req.method === 'POST') {
    const { standard, range } = req.body || {};
    const reportId = db.collection('reports').doc().id;
    const urlSigned = 'https://example.com/report/' + reportId;
    await db.collection('reports').doc(reportId).set({ projectId: authed.projectId, standard, range, status: 'ready', urlSigned, ts: Date.now() });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ reportId });
  }
  if (req.method === 'GET') {
    const reportId = req.path.split('/').pop()!;
    const snap = await db.collection('reports').doc(reportId).get();
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json(snap.data() || null);
  }
  return res.status(405).end();
}

async function handleUsage(req: functions.https.Request, res: functions.Response, authed: Authed) {
  if (req.method === 'POST') {
    const { feature, inc } = req.body || {};
    await recordUsage(authed.projectId, feature || 'custom', inc || 1);
    return res.status(204).end();
  }
  if (req.method === 'GET') {
    const counters = (await db.collection('usage_counters').doc(authed.projectId).get()).data() || {};
    return res.json({ byFeature: counters.byFeature || {}, byDay: counters.perDay || {} });
  }
  return res.status(405).end();
}

async function handleAdmin(req: functions.https.Request, res: functions.Response, authed: Authed) {
  // Internal admin endpoints; protected by project token
  if (req.path === '/v1/admin/limits' && req.method === 'GET') {
    const snap = await db.collection('projects').doc(authed.projectId).get();
    const limits = (snap.data()?.limits as any) || null;
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ limits });
  }
  return res.status(404).json({ error: 'not found' });
}

export const api = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const path = req.path.replace(/\/+$/, '');
      
      // Handle ping endpoint without authentication for deployment verification
      if (path === '/ping' && req.method === 'GET') return handlePing(req, res);
      
      if (path === '/v1/auth/token' && req.method === 'POST') return handleAuthToken(req, res);

      // Authn + basic rate limit
      const authed = parseAuth(req);
      if (!authed) return res.status(401).json({ error: 'unauthorized' });
      await checkRateLimit(authed.projectId).catch((e) => {
        throw new functions.https.HttpsError('resource-exhausted', (e as any).message || 'rate limited');
      });

      if (/^\/v1\/seal\/link\/[^/]+$/.test(path) && req.method === 'GET') {
        const linkId = path.split('/').pop()!;
        const ref = db.collection('sealLinks').doc(linkId);
        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const link = snap.data();
          if (!link || link.projectId !== authed.projectId || link.revoked || link.expiresAt.toMillis() <= Date.now() || (link.maxOpens && link.opens >= link.maxOpens)) return null;
          tx.update(ref, { opens: admin.firestore.FieldValue.increment(1) });
          return { ciphertext: link.ciphertext as string, iv: link.iv as string, kref: link.kref as string };
        });
        if (!result) return res.status(404).json({ error: 'link unavailable' });
        const keySnap = await db.collection('sealKeys').doc(result.kref).get();
        const key = await crypto.subtle.importKey('raw', Buffer.from(keySnap.data()!.key, 'base64'), { name: 'AES-GCM' }, false, ['decrypt']);
        const payload = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(result.iv, 'base64') }, key, Buffer.from(result.ciphertext, 'base64')));
        return res.json({ payload: payload.toString('base64') });
      }

      if (path.startsWith('/v1/keys/')) return handleKeys(req, res, authed);
      if (path === '/v1/sign' || path === '/v1/verify') return handleSignVerify(req, res, authed);
      if (path === '/v1/seal/link/revoke' || path === '/v1/seal/link/create') return handleSeal(req, res, authed);
      if (path.startsWith('/v1/seal/')) return handleSeal(req, res, authed);
      if (path.startsWith('/v1/broker/')) return handleBroker(req, res, authed);
      if (path === '/v1/audit' || path.startsWith('/v1/audit')) return handleAudit(req, res, authed);
      if (path === '/v1/consent' || path.startsWith('/v1/consent/')) return handleConsent(req, res, authed);
      if (path === '/v1/usage' || path === '/v1/usage/event') return handleUsage(req, res, authed);
      if (path === '/v1/reports/generate' || path.startsWith('/v1/reports/')) return handleReports(req, res, authed);
      if (path.startsWith('/v1/admin/')) return handleAdmin(req, res, authed);

      return res.status(404).json({ error: 'not found' });
    } catch (e: any) {
      if (e instanceof functions.https.HttpsError) {
        return res.status(e.httpErrorCode.status).json({ error: e.message });
      }
      console.error(e);
      return res.status(500).json({ error: 'internal' });
    }
  });
});

// Aggregation jobs (schedulers)
export const usageRollupMinute = functions.pubsub.schedule('every 1 minutes').onRun(async () => {
  const snap = await db.collection('usage_events').orderBy('ts').limit(500).get();
  const byProject: Record<string, { minute: string; map: Record<string, number> }> = {} as any;
  const batch = db.batch();
  for (const d of snap.docs) {
    const e = d.data() as any;
    const minute = new Date(e.ts.toDate ? e.ts.toDate() : e.ts).toISOString().slice(0, 16);
    const key = e.projectId;
    const entry = (byProject[key] = byProject[key] || { minute, map: {} });
    entry.map[e.feature] = (entry.map[e.feature] || 0) + (e.inc || 1);
    batch.delete(d.ref);
  }
  for (const [projectId, { minute, map }] of Object.entries(byProject)) {
    const ref = db.collection('usage_counters').doc(projectId);
    batch.set(ref, { perMin: { [minute]: map } }, { merge: true });
  }
  await batch.commit();
});

export const usageRollupHour = functions.pubsub.schedule('every 60 minutes').onRun(async () => {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const projects = await db.collection('usage_counters').get();
  const batch = db.batch();
  for (const p of projects.docs) {
    const perMin = (p.data().perMin || {}) as Record<string, Record<string, number>>;
    const map: Record<string, number> = {};
    for (const [minute, features] of Object.entries(perMin)) {
      if (minute.startsWith(day)) {
        for (const [f, c] of Object.entries(features)) map[f] = (map[f] || 0) + (c || 0);
      }
    }
    batch.set(p.ref, { perDay: { [day]: map }, byFeature: map }, { merge: true });
  }
  await batch.commit();
});
