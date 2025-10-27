import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  /**
   * Connect to Socket.IO server using JWT token.
   * Returns the socket instance; subsequent calls return the same instance.
   */
  connect(token: string) {
    if (this.socket) return this.socket;
    // Use explicit path so Angular dev proxy forwards websockets correctly
    this.socket = io('/', {
      path: '/socket.io',
      // Allow default transport negotiation (websocket with polling fallback)
      auth: { token }
    });
    // Expose for debugging in browser console and add lightweight event logger in dev
    try {
      (window as any).__sock = this.socket;
      this.socket.onAny((event: string, payload: any) => {
        // Only log call-related and room join/leave for signal debugging
        if (typeof event === 'string' && (event.startsWith('call:') || event === 'connect' || event === 'disconnect')) {
          // eslint-disable-next-line no-console
          console.debug('[socket:onAny]', event, payload);
        }
      });
    } catch {}
    return this.socket;
  }

  /** Disconnect and clear the socket instance. */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /** Get the current socket instance, if connected. */
  getSocket() {
    return this.socket;
  }

  /** Lightweight helpers mirroring Socket.IO API */
  on<T = any>(event: string, cb: (data: T) => void) {
    this.socket?.on(event, cb as any);
  }
  emit(event: string, payload?: any) {
    this.socket?.emit(event, payload);
  }
}
