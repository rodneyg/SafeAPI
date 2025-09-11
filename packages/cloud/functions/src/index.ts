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
    await db.collection('users').doc(userId).set({ publicKeyArmored }, { merge: true });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (path.endsWith('/escrow') && req.method === 'POST') {
    const { userId, encPrivKey } = body;
    await db.collection('escrow').doc(userId).set({ encPrivKey, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.status(204).end();
  }
  if (path.endsWith('/recover') && req.method === 'POST') {
    const { userId } = body;
    const doc = await db.collection('escrow').doc(userId).get();
    await recordUsage(authed.projectId, 'cloud_call', 1);
    return res.json({ encPrivKey: doc.data()?.encPrivKey || null });
  }
  return res.status(404).json({ error: 'not found' });
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
    try {
      const path = req.path.replace(/\/+$/, '');
      if (path === '/v1/auth/token' && req.method === 'POST') return handleAuthToken(req, res);

      // Authn + basic rate limit
      const authed = parseAuth(req);
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
