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
    this.socket = io('/', { auth: { token } });
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
}
