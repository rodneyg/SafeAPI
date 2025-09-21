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
  const [sharingMetrics, setSharingMetrics] = useState<any>(null);
  const [activeShares, setActiveShares] = useState<any[]>([]);

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

  const loadSharingMetrics = async () => {
    if (!projectToken) return alert('Set project token first');
    
    // Load usage data and extract sharing-specific metrics
    const usageRes = await fetch('/api/v1/usage', { headers: { Authorization: `Bearer ${projectToken}` } });
    const usageData = await usageRes.json();
    
    // Extract sharing metrics from usage data
    const byFeature = usageData.byFeature || {};
    const metrics = {
      totalShares: (byFeature.share_grant || 0) + (byFeature.share_grant_group || 0),
      shareGrants: byFeature.share_grant || 0,
      groupShares: byFeature.share_grant_group || 0,
      shareRevocations: (byFeature.share_revoke || 0) + (byFeature.share_revoke_group || 0),
      keyWrappingOps: byFeature.key_wrapping || 0,
      keyRotations: byFeature.key_rotation || 0,
      bulkKeyLookups: byFeature.bulk_key_lookup || 0
    };
    
    setSharingMetrics(metrics);
  };

  const loadActiveShares = async () => {
    if (!projectToken) return alert('Set project token first');
    
    // Load recent audit logs to show sharing activity
    const auditRes = await fetch('/api/v1/audit', { headers: { Authorization: `Bearer ${projectToken}` } });
    const auditData = await auditRes.json();
    
    // Filter for sharing-related events
    const sharingEvents = auditData.filter((event: any) => 
      event.action && (
        event.action.includes('SHARE') ||
        event.action.includes('GRANT') ||
        event.action.includes('REVOKE')
      )
    );
    
    setActiveShares(sharingEvents.slice(0, 20)); // Show last 20 sharing events
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
        <h2>Document Sharing Analytics</h2>
        <p>Monitor secure document sharing activity and compliance metrics.</p>
        <button onClick={loadSharingMetrics} style={{ marginRight: 12 }}>Load Sharing Metrics</button>
        <button onClick={loadActiveShares}>Load Active Shares</button>
        
        {sharingMetrics && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Total Shares</h3>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>{sharingMetrics.totalShares}</div>
            </div>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Individual Grants</h3>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>{sharingMetrics.shareGrants}</div>
            </div>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Group Shares</h3>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#7c3aed' }}>{sharingMetrics.groupShares}</div>
            </div>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Revocations</h3>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#dc2626' }}>{sharingMetrics.shareRevocations}</div>
            </div>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Key Operations</h3>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#9333ea' }}>
                {sharingMetrics.keyWrappingOps} wraps<br/>
                {sharingMetrics.keyRotations} rotations
              </div>
            </div>
            <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#666' }}>Bulk Operations</h3>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ea580c' }}>{sharingMetrics.bulkKeyLookups}</div>
            </div>
          </div>
        )}
        
        {activeShares.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Recent Sharing Activity</h3>
            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Timestamp</th>
                    <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Action</th>
                    <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Resource</th>
                    <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {activeShares.map((share, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 12, fontSize: 12, color: '#666' }}>
                        {new Date(share.ts).toLocaleString()}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{ 
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          fontSize: 12, 
                          backgroundColor: share.action.includes('REVOKE') ? '#fef2f2' : '#f0f9ff',
                          color: share.action.includes('REVOKE') ? '#dc2626' : '#2563eb'
                        }}>
                          {share.action}
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 14 }}>
                        {share.resource?.type || 'N/A'}: {share.resource?.id || 'N/A'}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: '#666' }}>
                        {share.meta?.recipients?.length && `${share.meta.recipients.length} recipients`}
                        {share.meta?.groupId && `Group: ${share.meta.groupId}`}
                        {share.meta?.permissions && ` (${share.meta.permissions.join(', ')})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Audit</h2>
        <button onClick={loadAudit}>Load Recent Audit</button>
        <pre>{audit && audit.length ? JSON.stringify(audit.slice(0, 10), null, 2) : 'No events'}</pre>
      </div>
    </div>
  );
}
