import React, { useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// Configure via environment or window.__FIREBASE__ injected config
const firebaseConfig = (window as any).__FIREBASE__ || {
  apiKey: 'demo',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'demo',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export function App() {
  const [user, setUser] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [projectToken, setProjectToken] = useState<string>('');
  const [limits, setLimits] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);

  React.useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const logout = async () => signOut(auth);

  const loadUsage = async () => {
    if (!projectToken) return alert('Set project token first');
    const res = await fetch('/api/v1/usage', { headers: { Authorization: `Bearer ${projectToken}` } });
    setUsage(await res.json());
  };

  const loadLimits = async () => {
    if (!projectToken) return alert('Set project token first');
    const res = await fetch('/api/v1/admin/limits', { headers: { Authorization: `Bearer ${projectToken}` } });
    setLimits(await res.json());
  };

  const loadAudit = async () => {
    if (!projectToken) return alert('Set project token first');
    const res = await fetch('/api/v1/audit', { headers: { Authorization: `Bearer ${projectToken}` } });
    const json = await res.json();
    setAudit(json);
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1>SafeAPI Dashboard</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {user ? (
          <>
            <span>Signed in as {user.email}</span>
            <button onClick={logout}>Sign out</button>
          </>
        ) : (
          <button onClick={signIn}>Sign in with Google</button>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Project</h2>
        <label>
          Bearer Token:
          <input style={{ width: '100%' }} value={projectToken} onChange={(e) => setProjectToken(e.target.value)} placeholder="Paste token from /v1/auth/token" />
        </label>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Internal Metering</h2>
        <p>Read-only limits configured in Firestore. No billing or upgrades.</p>
        <button onClick={loadLimits}>Load Limits</button>
        <pre>{limits ? JSON.stringify(limits, null, 2) : 'Limits not loaded'}</pre>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Usage</h2>
        <button onClick={loadUsage}>Load Usage</button>
        <pre>{usage ? JSON.stringify(usage, null, 2) : 'No data yet'}</pre>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Audit</h2>
        <button onClick={loadAudit}>Load Recent Audit</button>
        <pre>{audit && audit.length ? JSON.stringify(audit.slice(0, 10), null, 2) : 'No events'}</pre>
      </div>
    </div>
  );
}
