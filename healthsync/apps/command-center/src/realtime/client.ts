export type RealtimeEvent = { type: string; requestId?: string; payload: Record<string, unknown> };
type Handler = (event: RealtimeEvent) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private token = '';
  private entityId = '';
  private closedByUser = false;

  connect(token: string, entityId = ''): void {
    this.token = token;
    this.entityId = entityId;
    this.closedByUser = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/ws`;
    this.socket = new WebSocket(socketUrl);
    this.socket.addEventListener('open', () => this.send('auth', { token: this.token, entityId: this.entityId }));
    this.socket.addEventListener('message', (message) => {
      try {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        this.handlers.get(event.type)?.forEach((handler) => handler(event));
        this.handlers.get('*')?.forEach((handler) => handler(event));
      } catch { /* ignore malformed frames */ }
    });
    this.socket.addEventListener('close', () => {
      if (!this.closedByUser) window.setTimeout(() => this.connect(this.token, this.entityId), 2000);
    });
  }

  close(): void {
    this.closedByUser = true;
    this.socket?.close();
    this.socket = null;
  }

  on(type: string, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  send(type: string, payload: Record<string, unknown>, requestId = crypto.randomUUID()): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type, requestId, payload }));
  }

  sendChat(recipientId: string, body: string, conversationId?: string): void {
    this.send('chat.send', { recipientId, body, ...(conversationId ? { conversationId } : {}) });
  }

  sendLocation(payload: { entityId: string; entityType: 'AMBULANCE' | 'DRIVER'; latitude: number; longitude: number; accuracyM?: number; heading?: number; speedKmh?: number }): void {
    this.send('location.update', payload);
  }
}
