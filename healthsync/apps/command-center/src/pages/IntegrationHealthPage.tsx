import { useCallback, useEffect, useMemo, useState } from 'react';
import { INTEGRATIONS, COMPATIBILITY_LINKS, type IntegrationDescriptor } from '../platform/integrationCatalog';
import styles from './Page.module.css';

type CheckStatus = 'checking' | 'online' | 'degraded' | 'offline' | 'configured';
type CheckResult = { status: CheckStatus; latencyMs?: number; detail: string; checkedAt: number };

const statusLabel: Record<CheckStatus, string> = { checking: 'Checking', online: 'Online', degraded: 'Degraded', offline: 'Offline', configured: 'Configured' };
const statusColor: Record<CheckStatus, string> = { checking: 'var(--color-info)', online: 'var(--color-success)', degraded: 'var(--color-warning)', offline: 'var(--color-danger)', configured: 'var(--color-info)' };

function endpointFor(descriptor: IntegrationDescriptor): string | undefined {
  if (!descriptor.healthPath) return undefined;
  const envName = `VITE_HEALTH_${descriptor.id.toUpperCase().split('-').join('_')}`;
  return (import.meta.env as Record<string, string | undefined>)[envName] ?? descriptor.healthPath;
}

async function checkIntegration(descriptor: IntegrationDescriptor): Promise<CheckResult> {
  const endpoint = endpointFor(descriptor);
  if (!endpoint) return { status: 'configured', detail: descriptor.requiredEnv ? `Menunggu konfigurasi: ${descriptor.requiredEnv.join(', ')}` : 'Kontrak tersedia; health endpoint tidak diperlukan.', checkedAt: Date.now() };
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(endpoint, { signal: controller.signal, credentials: 'include', headers: { Accept: 'application/json' } });
    const body = (await response.clone().json().catch(() => null)) as { status?: string; db?: boolean; redis?: boolean; kafka?: boolean; mqtt?: boolean } | null;
    const dependencyValues = [body?.db, body?.redis, body?.kafka, body?.mqtt].filter((value): value is boolean => typeof value === 'boolean');
    const dependenciesHealthy = dependencyValues.every(Boolean);
    const status: CheckStatus = response.ok && body?.status !== 'error' && dependenciesHealthy ? 'online' : response.ok ? 'degraded' : 'offline';
    return { status, latencyMs: Math.round(performance.now() - started), detail: body?.status ?? `HTTP ${response.status}`, checkedAt: Date.now() };
  } catch (error) {
    return { status: 'offline', latencyMs: Math.round(performance.now() - started), detail: error instanceof Error && error.name === 'AbortError' ? 'Timeout > 3.5 detik' : 'Tidak dapat terhubung', checkedAt: Date.now() };
  } finally { window.clearTimeout(timeout); }
}

export default function IntegrationHealthPage() {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [copyState, setCopyState] = useState('Salin diagnosis');

  const checkAll = useCallback(async () => {
    setIsChecking(true);
    setResults(Object.fromEntries(INTEGRATIONS.map((item) => [item.id, { status: 'checking', detail: 'Memeriksa…', checkedAt: Date.now() }])));
    const entries = await Promise.all(INTEGRATIONS.map(async (item) => [item.id, await checkIntegration(item)] as const));
    setResults(Object.fromEntries(entries));
    setIsChecking(false);
  }, []);

  useEffect(() => { void checkAll(); const timer = window.setInterval(() => void checkAll(), 30_000); return () => window.clearInterval(timer); }, [checkAll]);

  const counts = useMemo(() => Object.values(results).reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {} as Record<string, number>), [results]);
  const diagnosticText = useMemo(() => INTEGRATIONS.map((item) => `${item.id}: ${statusLabel[results[item.id]?.status ?? 'checking']} — ${results[item.id]?.detail ?? 'belum diperiksa'}`).join('\n'), [results]);

  const copyDiagnostics = async () => {
    await navigator.clipboard?.writeText(diagnosticText);
    setCopyState('Tersalin');
    window.setTimeout(() => setCopyState('Salin diagnosis'), 1600);
  };

  return <div className={styles.page}>
    <div className={styles.integrationHeader}><div><h1 className={styles.title}>Integration Health</h1><p className={styles.integrationLead}>Satu halaman untuk memverifikasi compatibility Command Center dengan Admin, Mobile, backend services, realtime gateway, map, dan event contract.</p></div><div className={styles.inlineActions}><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void copyDiagnostics}>{copyState}</button><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void checkAll} disabled={isChecking}>{isChecking ? 'Memeriksa…' : '↻ Refresh'}</button></div></div>

    <div className={styles.statGrid}>
      <div className={styles.statCard}><span>✅</span><div><div className={styles.statValue}>{counts.online ?? 0}</div><div className={styles.statLabel}>Online</div></div></div>
      <div className={styles.statCard}><span>⚠️</span><div><div className={styles.statValue}>{(counts.degraded ?? 0) + (counts.configured ?? 0)}</div><div className={styles.statLabel}>Degraded / Config</div></div></div>
      <div className={styles.statCard}><span>❌</span><div><div className={styles.statValue}>{counts.offline ?? 0}</div><div className={styles.statLabel}>Offline</div></div></div>
      <div className={styles.statCard}><span>🔗</span><div><div className={styles.statValue}>{COMPATIBILITY_LINKS.length}</div><div className={styles.statLabel}>Compatibility Links</div></div></div>
    </div>

    <section className={styles.card} aria-labelledby="integration-list-title"><div className={styles.cardTitle} id="integration-list-title">Service & Contract Registry</div><div className={styles.integrationGrid}>{INTEGRATIONS.map((item) => { const result = results[item.id] ?? { status: 'checking', detail: 'Menunggu pemeriksaan', checkedAt: Date.now() }; return <article key={item.id} className={styles.integrationCard}><div className={styles.integrationCardHeader}><div><b>{item.label}</b><div className={styles.integrationMeta}>{item.owner} · {item.kind} · {item.contractVersion}</div></div><span className={styles.integrationStatus} style={{ color: statusColor[result.status], borderColor: statusColor[result.status] }}>{statusLabel[result.status]}</span></div><div className={styles.integrationDetail}>{result.detail}{result.latencyMs !== undefined ? ` · ${result.latencyMs}ms` : ''}</div><div className={styles.integrationMeta}>Consumer: {item.consumers.join(', ')}{item.critical ? ' · CRITICAL' : ''}</div></article>; })}</div></section>

    <section className={styles.card} aria-labelledby="compatibility-title"><div className={styles.cardTitle} id="compatibility-title">App Compatibility Matrix</div><div className={styles.integrationGrid}>{COMPATIBILITY_LINKS.map((link) => <article key={`${link.from}-${link.to}-${link.capability}`} className={styles.integrationCard}><div className={styles.integrationCardHeader}><b>{link.from} → {link.to}</b><span className={styles.integrationStatus} style={{ color: link.status === 'READY' ? 'var(--color-success)' : link.status === 'CONFIG_REQUIRED' ? 'var(--color-warning)' : 'var(--color-info)', borderColor: 'currentColor' }}>{link.status}</span></div><div className={styles.integrationDetail}>{link.capability}</div><div className={styles.integrationMeta}>Contract: {link.contract}</div></article>)}</div></section>
  </div>;
}
