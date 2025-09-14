import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import cors from 'cors';

admin.initializeApp();
const db = admin.firestore();

// Helpers
const corsHandler = cors({ origin: true });

type Authed = { projectId: string };

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
    const { userId, publicKeyArmored } = body;
    
    // Validate input parameters
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    }
    if (!publicKeyArmored || typeof publicKeyArmored !== 'string') {
      return res.status(400).json({ error: 'invalid_public_key', message: 'Public key is required and must be a valid armored string' });
    }
    
    try {
      await db.collection('users').doc(userId).set({ publicKeyArmored }, { merge: true });
      await recordUsage(authed.projectId, 'cloud_call', 1);
      return res.status(204).end();
    } catch (error: any) {
      console.error('Public key registration failed:', { userId: userId.substring(0, 8) + '...', error: error.message });
      return res.status(500).json({ error: 'registration_failed', message: 'Failed to register public key due to storage error' });
    }
  }
  
  if (path.endsWith('/escrow') && req.method === 'POST') {
    const { userId, encPrivKey } = body;
    
    // Validate input parameters
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    }
    if (!encPrivKey || typeof encPrivKey !== 'string' || encPrivKey.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' });
    }
    
    // Basic validation that the encrypted key looks like encrypted data (should not be plaintext)
    if (encPrivKey.includes('BEGIN PGP PRIVATE KEY BLOCK') && !encPrivKey.includes('encrypted')) {
      return res.status(400).json({ error: 'key_not_encrypted', message: 'Private key appears to be unencrypted - only encrypted keys can be stored in escrow' });
    }
    
    try {
      await db.collection('escrow').doc(userId).set({ 
        encPrivKey, 
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        keyLength: encPrivKey.length 
      });
      await recordUsage(authed.projectId, 'cloud_call', 1);
      return res.status(204).end();
    } catch (error: any) {
      console.error('Key escrow storage failed:', { userId: userId.substring(0, 8) + '...', keyLength: encPrivKey.length, error: error.message });
      
      // Provide specific error messages based on Firebase error codes
      if (error.code === 'permission-denied') {
        return res.status(403).json({ error: 'storage_permission_denied', message: 'Insufficient permissions to store encrypted key in escrow' });
      } else if (error.code === 'deadline-exceeded' || error.code === 'unavailable') {
        return res.status(503).json({ error: 'storage_unavailable', message: 'Key escrow storage temporarily unavailable - please retry' });
      } else if (error.message && error.message.includes('document too large')) {
        return res.status(413).json({ error: 'key_too_large', message: 'Encrypted private key exceeds maximum storage size limit' });
      } else {
        return res.status(500).json({ error: 'escrow_storage_failed', message: 'Failed to store encrypted private key due to backend error' });
      }
    }
  }
  
  if (path.endsWith('/recover') && req.method === 'POST') {
    const { userId } = body;
    
    // Validate input parameters
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    }
    
    try {
      const doc = await db.collection('escrow').doc(userId).get();
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'key_not_found', message: 'No encrypted private key found in escrow for the specified user' });
      }
      
      const data = doc.data();
      const encPrivKey = data?.encPrivKey;
      
      if (!encPrivKey) {
        console.error('Key recovery found document but missing encrypted key:', { userId: userId.substring(0, 8) + '...' });
        return res.status(404).json({ error: 'key_data_missing', message: 'Encrypted private key data is missing from escrow record' });
      }
      
      await recordUsage(authed.projectId, 'cloud_call', 1);
      return res.json({ encPrivKey });
    } catch (error: any) {
      console.error('Key recovery failed:', { userId: userId.substring(0, 8) + '...', error: error.message });
      
      // Provide specific error messages based on Firebase error codes
      if (error.code === 'permission-denied') {
        return res.status(403).json({ error: 'recovery_permission_denied', message: 'Insufficient permissions to retrieve encrypted key from escrow' });
      } else if (error.code === 'deadline-exceeded' || error.code === 'unavailable') {
        return res.status(503).json({ error: 'storage_unavailable', message: 'Key escrow storage temporarily unavailable - please retry recovery' });
      } else {
        return res.status(500).json({ error: 'recovery_failed', message: 'Failed to retrieve encrypted private key due to backend error' });
      }
    }
  }
  
  return res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
}

async function handleBroker(req: functions.https.Request, res: functions.Response, authed: Authed) {
  const body = req.body || {};
  if (req.path.endsWith('/doc-key') && req.method === 'POST') {
    const { collection, docId } = body;
    const kref = `k_${collection}_${docId}`;
    await db.collection('docKeys').doc(kref).set({ alg: 'aes-gcm-256', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ kref });
  }
  if (req.path.endsWith('/grant') && req.method === 'POST') {
    const { kref, recipientUserId } = body;
    await db.collection('docKeys').doc(kref).set({ [`wrapped.${recipientUserId}`]: 'WRAPPED_KEY_PLACEHOLDER' }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (req.path.endsWith('/revoke') && req.method === 'POST') {
    const { kref, userId } = body;
    await db.collection('docKeys').doc(kref).set({ [`wrapped.${userId}`]: admin.firestore.FieldValue.delete() }, { merge: true });
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
    let authed: Authed | null = null;
    try {
      const path = req.path.replace(/\/+$/, '');
      
      // Handle ping endpoint without authentication for deployment verification
      if (path === '/ping' && req.method === 'GET') return handlePing(req, res);
      
      if (path === '/v1/auth/token' && req.method === 'POST') return handleAuthToken(req, res);

      // Authn + basic rate limit
      authed = parseAuth(req);
      if (!authed) return res.status(401).json({ error: 'unauthorized' });
      await checkRateLimit(authed.projectId).catch((e) => {
        throw new functions.https.HttpsError('resource-exhausted', (e as any).message || 'rate limited');
      });

      if (path.startsWith('/v1/keys/')) return handleKeys(req, res, authed);
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
      
      // Log error with context but don't expose sensitive details to client
      console.error('API request failed:', { 
        path: req.path, 
        method: req.method, 
        projectId: authed?.projectId,
        error: e.message,
        stack: e.stack 
      });
      
      // Provide more specific error messages based on common error types
      if (e.code === 'permission-denied') {
        return res.status(403).json({ error: 'permission_denied', message: 'Insufficient permissions to access this resource' });
      } else if (e.code === 'deadline-exceeded' || e.code === 'unavailable') {
        return res.status(503).json({ error: 'service_unavailable', message: 'Backend service temporarily unavailable - please retry' });
      } else if (e.code === 'invalid-argument') {
        return res.status(400).json({ error: 'invalid_request', message: 'Invalid request parameters provided' });
      } else {
        return res.status(500).json({ error: 'internal_server_error', message: 'An unexpected error occurred while processing the request' });
      }
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
