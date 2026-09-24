import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { RealtimeClient } from '../realtime/client';
import type { RealtimeEvent } from '../realtime/client';
import styles from '../pages/Page.module.css';

export interface CommunicationContact {
  id: string;
  label: string;
  kind: 'HOSPITAL' | 'PHARMACY' | 'DOCTOR' | 'DRIVER' | 'AMBULANCE';
  status?: string;
}

type ChatMessage = { id: string; conversationId: string; senderId: string; recipientId: string; body: string; sentAt: string };
const box: CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 };
const small: CSSProperties = { fontSize: 11, color: 'var(--color-muted)' };

function labelFor(kind: CommunicationContact['kind']): string {
  return { HOSPITAL: 'RS', PHARMACY: 'Apotek', DOCTOR: 'Dokter', DRIVER: 'Driver', AMBULANCE: 'Ambulans' }[kind];
}

function currentUserId(): string {
  const raw = localStorage.getItem('hs_user');
  if (!raw) return 'command-center';
  try {
    const parsed = JSON.parse(raw) as { userId?: string; id?: string };
    return parsed.userId ?? parsed.id ?? raw;
  } catch {
    return raw;
  }
}

export default function CommunicationPanel({ contacts }: { contacts: CommunicationContact[] }) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingOfferRef = useRef<{ senderId: string; offer: RTCSessionDescriptionInit } | null>(null);
  const activeCallTargetRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [selectedId, setSelectedId] = useState(contacts[0]?.id ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState('Menghubungkan');
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [incomingCaller, setIncomingCaller] = useState('');
  const selected = useMemo(() => contacts.find((contact) => contact.id === selectedId) ?? contacts[0], [contacts, selectedId]);
  const me = currentUserId();
  const conversationId = selected ? [me, selected.id].sort().join(':') : '';

  useEffect(() => {
    const token = localStorage.getItem('hs_access_token');
    if (!token) return;
    const client = new RealtimeClient();
    clientRef.current = client;
    const off = client.on('*', (event: RealtimeEvent) => {
      if (event.type === 'auth.ok') setConnection('Terhubung');
      if (event.type === 'realtime.connecting') setConnection('Menghubungkan');
      if (event.type === 'realtime.disconnected') setConnection('Terputus · mencoba ulang');
      if (event.type === 'error') {
        setConnection(String(event.payload.code ?? '') === 'TARGET_OFFLINE' ? 'Target offline' : 'Error');
        if (String(event.payload.code ?? '') === 'TARGET_OFFLINE') stopCall(false);
      }
      if (event.type === 'chat.message') {
        const message = event.payload as unknown as ChatMessage;
        setMessages((previous) => [...previous, message].slice(-100));
      }
      if (event.type === 'call.invite') {
        const senderId = String(event.payload.senderId ?? '');
        activeCallTargetRef.current = senderId;
        incomingOfferRef.current = { senderId, offer: event.payload.offer as RTCSessionDescriptionInit };
        setIncomingCaller(senderId);
        setSelectedId(senderId);
        setCallState('incoming');
      }
      if (event.type === 'call.answer' && peerRef.current) {
        void peerRef.current.setRemoteDescription(event.payload.answer as RTCSessionDescriptionInit).then(async () => {
          const queued = pendingIceRef.current.splice(0);
          await Promise.all(queued.map((candidate) => peerRef.current?.addIceCandidate(candidate)));
          setCallState('connected');
        }).catch(() => setConnection('Call gagal: negosiasi WebRTC tidak valid'));
      }
      if (event.type === 'call.ice' && peerRef.current && event.payload.candidate) {
        const candidate = event.payload.candidate as RTCIceCandidateInit;
        if (peerRef.current.remoteDescription) void peerRef.current.addIceCandidate(candidate).catch(() => undefined);
        else pendingIceRef.current.push(candidate);
      }
      if (event.type === 'call.hangup') stopCall(false);
    });
    client.connect(token, 'command-center');
    return () => { off(); client.close(); stopCall(false); };
    // This panel intentionally connects once per Command Center session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) clientRef.current?.send('chat.history', { conversationId });
  }, [conversationId, selected]);

  function ensurePeer(targetId: string): RTCPeerConnection {
    if (peerRef.current) return peerRef.current;
    const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
    const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (turnUrl && turnUsername && turnCredential) iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
    const peer = new RTCPeerConnection({ iceServers });
    peer.onicecandidate = (event) => { if (event.candidate) clientRef.current?.send('call.ice', { targetId, candidate: event.candidate.toJSON() }); };
    peer.ontrack = (event) => { if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = event.streams[0]; void remoteAudioRef.current.play().catch(() => undefined); } };
    peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') setCallState('connected'); if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) stopCall(false); };
    peerRef.current = peer;
    return peer;
  }

  async function startCall(): Promise<void> {
    if (!selected) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setConnection('Audio tidak didukung browser'); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      activeCallTargetRef.current = selected.id;
      const peer = ensurePeer(selected.id);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      clientRef.current?.send('call.invite', { targetId: selected.id, offer });
      setCallState('calling');
    } catch (error) {
      setConnection(error instanceof Error ? `Call gagal: ${error.message}` : 'Call gagal');
      stopCall(false);
    }
  }

  async function acceptCall(): Promise<void> {
    const incoming = incomingOfferRef.current;
    if (!incoming) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setConnection('Audio tidak didukung browser'); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      activeCallTargetRef.current = incoming.senderId;
      const peer = ensurePeer(incoming.senderId);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(incoming.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      clientRef.current?.send('call.answer', { targetId: incoming.senderId, answer });
      setCallState('connected');
    } catch (error) {
      setConnection(error instanceof Error ? `Call gagal: ${error.message}` : 'Call gagal');
      stopCall(false);
    }
  }

  function stopCall(notify = true): void {
    const targetId = activeCallTargetRef.current ?? selected?.id;
    if (notify && targetId) clientRef.current?.send('call.hangup', { targetId });
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();
    peerRef.current = null;
    incomingOfferRef.current = null;
    activeCallTargetRef.current = null;
    pendingIceRef.current = [];
    setCallState('idle');
  }

  function sendMessage(event: FormEvent): void {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected) return;
    clientRef.current?.sendChat(selected.id, body, conversationId);
    setDraft('');
  }

  const isMine = (message: ChatMessage): boolean => message.senderId === me;

  return <section style={{ ...box, marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><strong>Communication Hub</strong><div style={small}>Platform chat + WebRTC audio call · {connection}</div></div>
      <span style={{ ...small, color: connection === 'Terhubung' ? 'var(--color-success)' : 'var(--color-warning)' }}>● {connection}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12, marginTop: 12 }}>
      <div style={{ borderRight: '1px solid var(--color-border)', paddingRight: 10, maxHeight: 320, overflow: 'auto' }}>
        {contacts.map((contact) => <button key={contact.id} onClick={() => setSelectedId(contact.id)} style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', textAlign: 'left', padding: 9, border: 0, borderRadius: 8, background: selected?.id === contact.id ? 'var(--color-surface-hover)' : 'transparent', color: 'var(--color-text)', cursor: 'pointer' }}><span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: 9, fontWeight: 800 }}>{labelFor(contact.kind)}</span><span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.label}</b><span style={small}>{contact.status ?? contact.id}</span></span></button>)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><div><b>{selected?.label ?? 'Pilih kontak'}</b><div style={small}>{selected ? labelFor(selected.kind) : ''}</div></div><div style={{ display: 'flex', gap: 6 }}>{callState === 'incoming' ? <><button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void acceptCall()}>Angkat</button><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => stopCall(false)}>Tolak</button></> : callState === 'idle' ? <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => void startCall()} disabled={!selected}>☎ Audio Call</button> : <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => stopCall()}>Akhiri Call</button>}</div></div>
        {callState === 'incoming' && <div style={{ padding: 9, marginBottom: 8, borderRadius: 8, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: 12 }}>Panggilan masuk dari {incomingCaller}</div>}
        {callState === 'calling' && <div style={{ ...small, marginBottom: 8 }}>Menunggu jawaban…</div>}
        <div style={{ minHeight: 150, maxHeight: 220, overflow: 'auto', padding: 10, background: 'var(--color-surface-2)', borderRadius: 8 }}>{messages.filter((message) => message.conversationId === conversationId || message.recipientId === selected?.id).map((message) => <div key={message.id} style={{ marginBottom: 8, textAlign: isMine(message) ? 'right' : 'left' }}><span style={{ display: 'inline-block', maxWidth: '85%', padding: '7px 9px', borderRadius: 8, background: isMine(message) ? 'var(--color-primary)' : 'var(--color-surface)', color: isMine(message) ? '#fff' : 'var(--color-text)', fontSize: 12 }}>{message.body}</span><div style={small}>{new Date(message.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div></div>)}</div>
        <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Kirim command atau pesan…" disabled={!selected} style={{ flex: 1, minWidth: 0, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)', borderRadius: 8, padding: '9px 10px' }} /><button className={`${styles.btn} ${styles.btnPrimary}`} type="submit" disabled={!selected || !draft.trim()}>Kirim</button></form>
      </div>
    </div>
    <audio ref={remoteAudioRef} autoPlay />
  </section>;
}
