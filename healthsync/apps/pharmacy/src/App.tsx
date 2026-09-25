import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adjustStock,
  apiError,
  checkHealth,
  getCouriers,
  getInventory,
  getMyPharmacy,
  getPrescription,
  getPrescriptions,
  handoffDelivery,
  login,
  logout,
  tokenStore,
  transitionPrescription,
} from './api';
import type { Courier, InventoryItem, Pharmacy, Prescription, PrescriptionStatus } from './types';

type Tab = 'dashboard' | 'prescriptions' | 'inventory' | 'delivery';

const STATUS_LABEL: Record<PrescriptionStatus, string> = {
  ISSUED: 'Menunggu apotek',
  SENT_TO_PHARMACY: 'Resep masuk',
  CONFIRMED: 'Dikonfirmasi',
  PREPARING: 'Disiapkan',
  READY: 'Siap',
  DELIVERING: 'Diantar',
  DELIVERED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

const ACTION_LABEL: Record<'confirm' | 'prepare' | 'ready', string> = {
  confirm: 'Konfirmasi stok',
  prepare: 'Mulai siapkan',
  ready: 'Tandai siap',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function LoginScreen({ onLogin }: { onLogin: (user: Record<string, unknown>) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(email, password);
      onLogin(user);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">✚</div>
        <p className="eyebrow">HEALTHSYNC OPERATIONS</p>
        <h1>Apotek Console</h1>
        <p className="muted">Kelola resep, stok, dan serah-terima pengiriman dari satu tempat.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="apoteker@healthsync.id" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="primary wide" disabled={loading}>{loading ? 'Memeriksa...' : 'Masuk sebagai Apoteker'}</button>
        </form>
        <div className="login-note">Akses dibatasi untuk role <strong>PHARMACIST</strong>.</div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: PrescriptionStatus }) {
  const tone = status === 'READY' || status === 'DELIVERED'
    ? 'success'
    : status === 'CANCELLED'
      ? 'danger'
      : status === 'SENT_TO_PHARMACY'
        ? 'warning'
        : 'info';
  return <span className={`badge ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function App() {
  const [user, setUser] = useState<Record<string, unknown> | null>(() => {
    const raw = sessionStorage.getItem('hs_pharmacy_user');
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  });
  const [tab, setTab] = useState<Tab>('dashboard');
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const context = pharmacy ?? await getMyPharmacy();
      const [nextInventory, nextPrescriptions] = await Promise.all([
        getInventory(context.id),
        getPrescriptions({ pharmacyId: context.id }),
      ]);
      setPharmacy(context);
      setInventory(nextInventory);
      setPrescriptions(nextPrescriptions);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [pharmacy, user]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    void checkHealth().then(setOnline);
  }, [refresh, user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!user || !tokenStore.access) return <LoginScreen onLogin={setUser} />;

  const lowStock = inventory.filter((item) => item.is_low_stock || item.stock_qty <= item.reorder_level);
  const expiring = inventory.filter((item) => {
    if (!item.expires_at) return false;
    const days = (new Date(item.expires_at).getTime() - Date.now()) / 86_400_000;
    return days <= 30;
  });
  const incoming = prescriptions.filter((item) => item.status === 'SENT_TO_PHARMACY');
  const preparing = prescriptions.filter((item) => ['CONFIRMED', 'PREPARING'].includes(item.status));
  const readyDelivery = prescriptions.filter((item) => item.status === 'READY' && item.fulfillment_type === 'DELIVERY');

  async function handleAction(id: string, action: 'confirm' | 'prepare' | 'ready') {
    try {
      await transitionPrescription(id, action);
      setToast(`${ACTION_LABEL[action]} berhasil.`);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function openPrescription(item: Prescription) {
    try {
      setSelected(await getPrescription(item.id));
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark small">✚</span><span><strong>HealthSync</strong><small>Apotek Console</small></span></div>
        <div className="pharmacy-chip"><span className="pulse" />{pharmacy?.name ?? 'Memuat apotek...'}</div>
        <nav>
          <NavItem active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon="⌂" label="Dashboard" />
          <NavItem active={tab === 'prescriptions'} onClick={() => setTab('prescriptions')} icon="▣" label="Resep Masuk" count={incoming.length} />
          <NavItem active={tab === 'inventory'} onClick={() => setTab('inventory')} icon="▤" label="Inventori" count={lowStock.length} />
          <NavItem active={tab === 'delivery'} onClick={() => setTab('delivery')} icon="➜" label="Pengiriman" count={readyDelivery.length} />
        </nav>
        <div className="sidebar-bottom">
          <div className="connection"><span className={`dot ${online ? 'online' : online === false ? 'offline' : ''}`} />{online === null ? 'Memeriksa koneksi' : online ? 'Semua service online' : 'Service bermasalah'}</div>
          <button className="ghost wide" onClick={() => { logout(); setUser(null); }}>Keluar</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">PHARMACY OPERATIONS</p><h2>{tab === 'dashboard' ? 'Ringkasan operasional' : tab === 'prescriptions' ? 'Resep masuk' : tab === 'inventory' ? 'Inventori obat' : 'Serah-terima pengiriman'}</h2></div>
          <div className="topbar-actions"><span className="user-pill">{String(user.email ?? '')}</span><button className="icon-button" onClick={() => void refresh()} title="Refresh data">↻</button></div>
        </header>

        {error && <div className="alert error page-alert">{error}<button onClick={() => setError('')}>×</button></div>}
        {loading && <div className="loading-line" />}
        {toast && <div className="toast">{toast}</div>}

        {tab === 'dashboard' && (
          <Dashboard pharmacy={pharmacy} incoming={incoming.length} preparing={preparing.length} readyDelivery={readyDelivery.length} lowStock={lowStock.length} expiring={expiring.length} prescriptions={prescriptions} inventory={inventory} onOpen={openPrescription} />
        )}
        {tab === 'prescriptions' && <PrescriptionQueue items={prescriptions} onOpen={openPrescription} />}
        {tab === 'inventory' && <Inventory items={inventory} pharmacyId={pharmacy?.id ?? ''} onRefresh={refresh} onToast={setToast} />}
        {tab === 'delivery' && <DeliveryQueue items={readyDelivery} onRefresh={refresh} onToast={setToast} />}
      </main>

      {selected && <PrescriptionDrawer prescription={selected} onClose={() => setSelected(null)} onAction={handleAction} />}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count?: number }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{count ? <span className="nav-count">{count}</span> : null}</button>;
}

function Dashboard(props: {
  pharmacy: Pharmacy | null;
  incoming: number;
  preparing: number;
  readyDelivery: number;
  lowStock: number;
  expiring: number;
  prescriptions: Prescription[];
  inventory: InventoryItem[];
  onOpen: (item: Prescription) => void;
}) {
  const latest = props.prescriptions.slice(0, 5);
  return <section className="content">
    <div className="welcome-card"><div><p className="eyebrow light">HARI INI</p><h1>Selamat datang di {props.pharmacy?.name ?? 'Apotek Anda'}</h1><p>Jaga alur resep tetap cepat, akurat, dan terdokumentasi.</p></div><div className="welcome-icon">✚</div></div>
    <div className="kpi-grid">
      <Kpi label="Resep masuk" value={props.incoming} note="Menunggu konfirmasi" tone="orange" />
      <Kpi label="Dalam proses" value={props.preparing} note="Konfirmasi atau siapkan" tone="blue" />
      <Kpi label="Delivery siap" value={props.readyDelivery} note="Menunggu driver" tone="teal" />
      <Kpi label="Stok kritis" value={props.lowStock} note={`${props.expiring} batch ≤ 30 hari`} tone="red" />
    </div>
    <div className="two-col">
      <section className="panel"><PanelHeader title="Resep terbaru" action="Lihat semua" /><div className="table-wrap"><table><thead><tr><th>Pasien</th><th>Status</th><th>Waktu</th></tr></thead><tbody>{latest.length ? latest.map((item) => <tr key={item.id} onClick={() => props.onOpen(item)} className="clickable"><td><strong>{item.patient_name ?? `Pasien #${item.patient_id.slice(0, 8)}`}</strong><small>{item.id.slice(0, 8).toUpperCase()}</small></td><td><StatusBadge status={item.status} /></td><td>{formatDate(item.issued_at)}</td></tr>) : <EmptyRow colSpan={3} text="Belum ada resep untuk apotek ini." />}</tbody></table></div></section>
      <section className="panel"><PanelHeader title="Perhatian inventori" /><div className="attention-list">{props.inventory.filter((item) => item.is_low_stock || item.stock_qty <= item.reorder_level).slice(0, 5).map((item) => <div className="attention-item" key={item.id}><span className="attention-icon">!</span><div><strong>{item.generic_name}</strong><small>Stok {item.stock_qty} · minimum {item.reorder_level}</small></div><span className="danger-text">Restock</span></div>)}{props.lowStock === 0 && <div className="empty-state">Semua stok berada di atas minimum.</div>}</div></section>
    </div>
  </section>;
}

function PrescriptionQueue({ items, onOpen }: { items: Prescription[]; onOpen: (item: Prescription) => void }) {
  const [filter, setFilter] = useState<'ALL' | PrescriptionStatus>('ALL');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => items.filter((item) => (filter === 'ALL' || item.status === filter) && `${item.patient_name ?? ''} ${item.id}`.toLowerCase().includes(search.toLowerCase())), [filter, items, search]);
  return <section className="content"><div className="toolbar"><div><p className="eyebrow">WORK QUEUE</p><h1>Resep Masuk</h1></div><input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pasien atau ID resep..." /></div><div className="filter-row">{(['ALL', 'SENT_TO_PHARMACY', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] as const).map((value) => <button key={value} className={`filter ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)}>{value === 'ALL' ? 'Semua' : STATUS_LABEL[value]}</button>)}</div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Pasien</th><th>Jenis</th><th>Terbit</th><th>Status</th><th /></tr></thead><tbody>{visible.length ? visible.map((item) => <tr key={item.id} className="clickable" onClick={() => onOpen(item)}><td><strong>{item.patient_name ?? `Pasien #${item.patient_id.slice(0, 8)}`}</strong><small>Resep {item.id.slice(0, 8).toUpperCase()}</small></td><td>{item.fulfillment_type === 'DELIVERY' ? 'Delivery' : 'Ambil di apotek'}</td><td>{formatDate(item.issued_at)}</td><td><StatusBadge status={item.status} /></td><td className="arrow">→</td></tr>) : <EmptyRow colSpan={5} text="Tidak ada resep yang cocok." />}</tbody></table></div></section></section>;
}

function Inventory({ items, pharmacyId, onRefresh, onToast }: { items: InventoryItem[]; pharmacyId: string; onRefresh: () => Promise<void>; onToast: (value: string) => void }) {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const visible = items.filter((item) => (!lowOnly || item.is_low_stock || item.stock_qty <= item.reorder_level) && `${item.generic_name} ${item.brand_name ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="content"><div className="toolbar"><div><p className="eyebrow">STOCK CONTROL</p><h1>Inventori Obat</h1></div><div className="toolbar-actions"><input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari obat..." /><button className={`filter ${lowOnly ? 'selected' : ''}`} onClick={() => setLowOnly(!lowOnly)}>⚠ Stok kritis</button></div></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Obat</th><th>Batch</th><th>Stok</th><th>Harga</th><th>Kadaluarsa</th><th /></tr></thead><tbody>{visible.length ? visible.map((item) => <tr key={item.id}><td><strong>{item.generic_name}</strong><small>{item.brand_name ?? item.dosage_form ?? '-'} · {item.strength ?? '-'}</small></td><td>{item.batch_number ?? '-'}</td><td><span className={item.is_low_stock || item.stock_qty <= item.reorder_level ? 'danger-text' : 'stock-ok'}>{item.stock_qty}</span><small>min {item.reorder_level}</small></td><td>{money(Number(item.unit_price))}</td><td>{item.expires_at ? new Date(item.expires_at).toLocaleDateString('id-ID') : '-'}</td><td><button className="small-button" onClick={() => setSelected(item)}>Sesuaikan</button></td></tr>) : <EmptyRow colSpan={6} text="Inventori tidak ditemukan." />}</tbody></table></div></section>{selected && <StockModal item={selected} pharmacyId={pharmacyId} onClose={() => setSelected(null)} onDone={async (message) => { setSelected(null); onToast(message); await onRefresh(); }} />}</section>;
}

function DeliveryQueue({ items, onRefresh, onToast }: { items: Prescription[]; onRefresh: () => Promise<void>; onToast: (value: string) => void }) {
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  useEffect(() => { void getCouriers().then(setCouriers).catch(() => setCouriers([])); }, []);
  return <section className="content"><div className="toolbar"><div><p className="eyebrow">LAST MILE</p><h1>Serah-terima Pengiriman</h1></div><span className="muted">{items.length} resep siap dikirim</span></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Pasien</th><th>Alamat tujuan</th><th>Resep siap</th><th /></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}><td><strong>{item.patient_name ?? `Pasien #${item.patient_id.slice(0, 8)}`}</strong><small>{item.id.slice(0, 8).toUpperCase()}</small></td><td>{item.delivery_address ?? 'Alamat belum tersedia'}</td><td>{formatDate(item.updated_at)}</td><td><button className="small-button primary-button" onClick={() => setSelected(item)}>Pilih driver</button></td></tr>) : <EmptyRow colSpan={4} text="Belum ada delivery yang siap diserahkan." />}</tbody></table></div></section>{selected && <DeliveryModal item={selected} couriers={couriers} onClose={() => setSelected(null)} onDone={async (message) => { setSelected(null); onToast(message); await onRefresh(); }} />}</section>;
}

function PrescriptionDrawer({ prescription, onClose, onAction }: { prescription: Prescription; onClose: () => void; onAction: (id: string, action: 'confirm' | 'prepare' | 'ready') => Promise<void> }) {
  const action = prescription.status === 'SENT_TO_PHARMACY' ? 'confirm' : prescription.status === 'CONFIRMED' ? 'prepare' : prescription.status === 'PREPARING' ? 'ready' : null;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">DETAIL RESEP</p><h2>{prescription.patient_name ?? `Pasien #${prescription.patient_id.slice(0, 8)}`}</h2><small>{prescription.id}</small></div><button className="icon-button" onClick={onClose}>×</button></div><div className="drawer-body"><div className="detail-grid"><div><span>Status</span><StatusBadge status={prescription.status} /></div><div><span>Pengambilan</span><strong>{prescription.fulfillment_type === 'DELIVERY' ? 'Delivery' : 'Ambil di apotek'}</strong></div><div><span>Dokter</span><strong>{prescription.doctor_email ?? '-'}</strong></div><div><span>Diterbitkan</span><strong>{formatDate(prescription.issued_at)}</strong></div></div><h3>Item obat</h3><div className="medicine-list">{(prescription.items ?? []).map((item) => <div className="medicine-row" key={item.id}><div><strong>{item.drug_name}</strong><small>{item.dosage}</small></div><span>×{item.quantity}</span></div>)}</div>{prescription.notes && <div className="note-box">{prescription.notes}</div>}{prescription.delivery_address && <div className="address-box"><span>Alamat delivery</span><strong>{prescription.delivery_address}</strong></div>}</div><div className="drawer-footer">{action ? <button className="primary wide" onClick={() => void onAction(prescription.id, action)}>{ACTION_LABEL[action]}</button> : <button className="ghost wide" onClick={onClose}>Tutup</button>}</div></aside></div>;
}

function StockModal({ item, pharmacyId, onClose, onDone }: { item: InventoryItem; pharmacyId: string; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try { await adjustStock(pharmacyId, item.drug_id, Number(delta), reason); await onDone('Stok berhasil disesuaikan.'); } catch (err) { window.alert(apiError(err)); } finally { setLoading(false); }
  }
  return <div className="modal-backdrop" onClick={onClose}><form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">PENYESUAIAN STOK</p><h2>{item.generic_name}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><p className="muted">Stok saat ini: <strong>{item.stock_qty}</strong>. Gunakan angka negatif untuk stok keluar.</p><label>Perubahan stok<input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required /></label><label>Alasan<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: penerimaan batch baru" required /></label><div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Batal</button><button className="primary" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan perubahan'}</button></div></form></div>;
}

function DeliveryModal({ item, couriers, onClose, onDone }: { item: Prescription; couriers: Courier[]; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [courierId, setCourierId] = useState(couriers[0]?.id ?? '');
  const [tracking, setTracking] = useState(`HS-${item.id.slice(0, 8).toUpperCase()}`);
  const [eta, setEta] = useState(() => new Date(Date.now() + 90 * 60_000).toISOString().slice(0, 16));
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!courierId) return;
    setLoading(true);
    try { await handoffDelivery(item.id, courierId, tracking, new Date(eta).toISOString()); await onDone('Delivery berhasil diserahkan ke driver.'); } catch (err) { window.alert(apiError(err)); } finally { setLoading(false); }
  }
  return <div className="modal-backdrop" onClick={onClose}><form className="modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">HANDOFF DRIVER</p><h2>{item.patient_name ?? 'Pasien'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Driver<select value={courierId} onChange={(e) => setCourierId(e.target.value)} required><option value="">Pilih driver</option>{couriers.map((courier) => <option value={courier.id} key={courier.id}>{courier.email}{courier.phone ? ` · ${courier.phone}` : ''}</option>)}</select></label><label>Kode tracking<input value={tracking} onChange={(e) => setTracking(e.target.value)} required /></label><label>Estimasi tiba<input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} required /></label>{couriers.length === 0 && <div className="alert warning">Belum ada driver aktif yang dapat dipilih.</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Batal</button><button className="primary" disabled={loading || !courierId}>{loading ? 'Mengirim...' : 'Serahkan ke driver'}</button></div></form></div>;
}

function Kpi({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) { return <div className={`kpi ${tone}`}><div className="kpi-icon">✚</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>; }
function PanelHeader({ title, action }: { title: string; action?: string }) { return <div className="panel-header"><h3>{title}</h3>{action && <button className="link-button">{action} →</button>}</div>; }
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) { return <tr><td colSpan={colSpan}><div className="empty-state">{text}</div></td></tr>; }

export default App;