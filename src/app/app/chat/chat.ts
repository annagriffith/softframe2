import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  providers: [DatePipe],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css']
})
export class ChatComponent implements OnInit, OnDestroy {
  channelId = '';
  channels: any[] = [];
  private currentRoom: string | null = null;
  messages: any[] = [];
  newMessage = '';
  user: any = null;
  imagePreviewUrl: string | null = null;
  private socket: any;
  callActive = false;
  callFrom: string | null = null;
  lastCallId: string | null = null;
  private lastInviteRoom: string | null = null;
  private notificationRef: any = null;
  private lastNotifyAt = 0;
  private notifyPermRequested = false;
  // In-app toast + ringtone
  showCallToast = false;
  private toastTimer: any = null;
  private audioCtx: any = null;
  private gainNode: any = null;
  private osc: any = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private api: ApiService,
    private socketService: SocketService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      this.router.navigate(['/login']);
      return;
    }
    this.user = JSON.parse(userStr);
    const token = localStorage.getItem('authToken');
    if (token) {
      this.socket = this.socketService.connect(token);
      // Ensure we join the current channel when socket connects/reconnects
      this.socket.on('connect', () => {
        if (this.channelId) {
          this.socket.emit('join', { channelId: this.channelId });
        }
      });
      this.socket.on('message', (m: any) => {
        if (m.channelId === this.channelId) {
          this.messages.push(m);
          // Fallback: treat special message type as a call invite
          if (m.type === 'callInvite' && this.user && m.sender !== this.user.username) {
            const payload = { channelId: this.channelId, fromUser: m.sender };
            this.callActive = true;
            this.callFrom = m.sender;
            this.maybeNotifyIncomingCall(this.channelId, m.sender as string);
            this.showIncomingToast();
          }
        }
      });
      // also handle alias event name used by some clients
      this.socket.on('message:new', (m: any) => {
        if (m.channelId === this.channelId) {
          this.messages.push(m);
          if (m.type === 'callInvite' && this.user && m.sender !== this.user.username) {
            const payload = { channelId: this.channelId, fromUser: m.sender };
            this.callActive = true;
            this.callFrom = m.sender;
            this.maybeNotifyIncomingCall(this.channelId, m.sender as string);
            this.showIncomingToast();
          }
        }
      });
      this.socket.on('history', (msgs: any[]) => {
        if (msgs && msgs.length) this.messages = msgs;
      });
      // Call notifications coming from others in the same channel
      this.socket.on('call:notify', (p: any) => {
        try { console.debug('[chat] call:notify', p); } catch {}
        if (p && p.roomId === this.channelId) {
          this.callActive = true;
          this.callFrom = p.from || null;
          this.maybeNotifyIncomingCall(this.channelId, this.callFrom || 'someone');
          // Auto-join the call page for WhatsApp-like behavior
          this.showIncomingToast();
        }
      });
      // Alias call:incoming (from checklist API)
      this.socket.on('call:incoming', (p: any) => {
        try { console.debug('[chat] call:incoming', p); } catch {}
        if (p && (p.channelId === this.channelId || p.callId)) {
          this.callActive = true;
          this.callFrom = p.fromUserId || this.callFrom || null;
          this.lastCallId = p.callId || this.lastCallId;
          this.maybeNotifyIncomingCall(this.channelId, this.callFrom || 'someone');
          this.showIncomingToast();
        }
      });
      // New: explicit call:invite event name
      this.socket.on('call:invite', (p: any) => {
        try { console.debug('[chat] call:invite', p); } catch {}
        if (p && p.channelId === this.channelId) {
          this.callActive = true;
          this.callFrom = p.fromUser || this.callFrom || null;
          this.lastCallId = p.callId || this.lastCallId;
          this.lastInviteRoom = this.channelId;
          this.maybeNotifyIncomingCall(this.channelId, this.callFrom || 'someone');
          this.showIncomingToast();
        }
      });

      // Call cancel/decline handling to clear banner
      this.socket.on('call:cancel', (p: any) => {
        if (!p) return;
        const room = p.channelId || p.roomId || '';
        if (room === this.channelId) {
          this.callActive = false;
          this.callFrom = null;
          this.lastCallId = null;
          this.hideIncomingToast();
          if (this.notificationRef && typeof this.notificationRef.close === 'function') {
            try { this.notificationRef.close(); } catch {}
            this.notificationRef = null;
          }
        }
      });
      this.socket.on('call:declined', (p: any) => {
        if (!p) return;
        const room = p.channelId || p.roomId || '';
        if (room === this.channelId) {
          // Optionally show a toast; for now just clear local invite if any
          this.callActive = false;
          this.hideIncomingToast();
        }
      });
    }

    // After socket is established, subscribe to route changes and join rooms accordingly
    this.route.paramMap.subscribe((pm) => {
      // Support both /chat/:channel and legacy /chat?channel=...
      const paramChan = pm.get('channel') || '';
      const queryChan = this.route.snapshot.queryParamMap.get('channel') || '';
      const nextChannel = paramChan || queryChan || '';

      // If no channel specified in URL, auto-pick the first accessible channel
      if (!nextChannel) {
        this.api.getChannels().subscribe((chs: any) => {
          this.channels = Array.isArray(chs) ? chs : (chs?.channels || []);
          const first = this.channels[0]?.id || this.channels[0]?._id || '';
          if (first) {
            // Navigate to SEO-friendly /chat/:channel route
            this.ngZone.run(() => {
              this.router.navigate(['/chat', first]);
            });
          }
        });
        return; // wait for navigation to set the channel
      }

      // leave previous room if any
      if (this.socket && this.currentRoom && this.currentRoom !== nextChannel) {
        this.socket.emit('leave', { channelId: this.currentRoom });
      }
      this.channelId = nextChannel;
      this.currentRoom = this.channelId || null;
      // join the room so socket.io emits reach us
      if (this.socket && this.channelId) {
        this.socket.emit('join', { channelId: this.channelId });
      }
      this.callActive = false; // reset call banner when switching channels
      this.loadMessages();
    });
  }

  ngOnDestroy(): void {
    if (this.socket && this.channelId) {
      this.socket.emit('leave', { channelId: this.channelId });
      this.socket.off('message');
      this.socket.off('message:new');
      this.socket.off('history');
      this.socket.off('call:notify');
      this.socket.off('call:incoming');
      this.socket.off('call:invite');
    }
    if (this.notificationRef && typeof this.notificationRef.close === 'function') {
      try { this.notificationRef.close(); } catch {}
      this.notificationRef = null;
    }
    this.hideIncomingToast();
  }

  // TrackBy for *ngFor in template to avoid re-render churn
  trackByIndex(index: number): number {
    return index;
  }

  loadMessages(): void {
    if (!this.channelId) return;
    this.api.getMessages(this.channelId).subscribe((res: any) => {
      this.messages = res.messages || [];
    });
  }

  sendMessage(): void {
    const text = (this.newMessage || '').trim();
    if (!text || !this.channelId) return;
    const payload = { channelId: this.channelId, text };
    this.api.sendMessage(payload).subscribe({
      next: () => { this.newMessage = ''; },
      error: (err) => { console.error('sendMessage failed', err); }
    });
  }

  onImageSelected(event: any): void {
    const file: File = event.target.files && event.target.files[0];
    if (!file || !this.channelId) return;
    // create a local preview
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);

    // upload (do not wait for preview to finish)
    const form = new FormData();
    form.append('channelId', this.channelId);
    form.append('image', file, file.name);
    this.api.uploadMessageImage(form).subscribe(() => {
      (event.target as HTMLInputElement).value = '';
      // clear preview after upload
      setTimeout(() => this.imagePreviewUrl = null, 1500);
    });
  }

  // Start a call via REST endpoint; server will broadcast to the room
  startCall(): void {
    if (!this.channelId) return;
    // Optimistically navigate to the call page immediately so the user sees the UI
    const optimisticCallId = `${this.channelId}:${Date.now()}`;
    this.lastCallId = optimisticCallId;
    // Proactively notify others in the channel right away (WhatsApp-style ring)
    if (this.socket) {
      try { console.debug('[chat] emitting call:invite', { channelId: this.channelId, optimisticCallId }); } catch {}
      this.socket.emit('call:invite', { channelId: this.channelId, callId: optimisticCallId });
    }
    this.ngZone.run(() => {
      this.router.navigate(['/call'], { queryParams: { channel: this.channelId, callId: optimisticCallId, role: 'caller' } });
    });

    // Fire-and-forget REST call to notify others; if it fails, fall back to socket invite
    this.api.startCall(this.channelId).subscribe({
      next: (res: any) => {
        const serverCallId = res?.callId || optimisticCallId;
        this.lastCallId = serverCallId;
      },
      error: (err) => {
        console.warn('startCall REST failed, using socket fallback', err);
        if (this.socket) {
          this.socket.emit('call:invite', { channelId: this.channelId, callId: optimisticCallId });
        }
      }
    });

    // Always send a lightweight, visible fallback signal as a special message type.
    // Callee will show a toast and auto-join even if server-side call events fail.
    this.api.sendMessage({ channelId: this.channelId, text: 'Incoming call…', type: 'callInvite' }).subscribe({
      error: (e) => console.debug('fallback callInvite message failed', e)
    });
  }

  acceptCall(): void {
    if (!this.channelId) return;
    this.ngZone.run(() => {
      this.router.navigate(['/call'], { queryParams: { channel: this.channelId, callId: this.lastCallId || undefined } });
    });
  }

  declineCall(): void {
    if (!this.channelId || !this.socket) return;
    const username = this.user?.username;
    this.socket.emit('call:decline', { roomId: this.channelId, channelId: this.channelId, callId: this.lastCallId, username });
    this.callActive = false;
  }

  // Desktop/browser notification for incoming call
  private async maybeNotifyIncomingCall(channelId: string, from: string) {
    // throttle to avoid dup spam on multiple events
    const now = Date.now();
    if (now - this.lastNotifyAt < 1500) return;
    this.lastNotifyAt = now;
    const w: any = window as any;
    if (!('Notification' in w)) return;
    try {
      let permission = w.Notification.permission;
      if (permission === 'default' && !this.notifyPermRequested) {
        this.notifyPermRequested = true;
        try { permission = await w.Notification.requestPermission(); } catch {}
      }
      if (permission !== 'granted') return;
      // Close previous notification if still open
      if (this.notificationRef && typeof this.notificationRef.close === 'function') {
        try { this.notificationRef.close(); } catch {}
      }
      const title = `Incoming call in #${channelId}`;
      const body = `From ${from}`;
      this.notificationRef = new w.Notification(title, { body, icon: '/favicon.ico' });
      this.notificationRef.onclick = () => {
        try { window.focus(); } catch {}
        this.acceptCall();
        try { this.notificationRef.close(); } catch {}
      };
      setTimeout(() => {
        if (this.notificationRef && typeof this.notificationRef.close === 'function') {
          try { this.notificationRef.close(); } catch {}
          this.notificationRef = null;
        }
      }, 15000);
    } catch {}
  }

  // Automatically navigate to the call page on incoming invite/notify
  private autoJoinOnInvite(p: any) {
    if (!this.channelId) return;
    const from = p?.fromUser || p?.fromUserId || p?.from || null;
    // Don't auto-join for our own invites
    if (from && this.user && from === this.user.username) return;
    // If we're already on the call page, do nothing
    // Router URL check is implicit; simply navigate to /call with channel and optional callId
    const callId = p?.callId || this.lastCallId || undefined;
    this.ngZone.run(() => {
      this.router.navigate(['/call'], { queryParams: { channel: this.channelId, callId } });
    });
  }

  // In-app toast and ringtone helpers
  private showIncomingToast() {
    this.showCallToast = true;
    this.startRingtone();
  }
  private hideIncomingToast() {
    this.showCallToast = false;
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
    this.stopRingtone();
  }
  private delayedAutoJoin(p: any) {
    if (this.toastTimer) return;
    this.toastTimer = setTimeout(() => {
      this.autoJoinOnInvite(p);
      this.hideIncomingToast();
    }, 900);
  }
  private startRingtone() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = this.audioCtx || (AudioCtx ? new AudioCtx() : null);
      if (!this.audioCtx) return;
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      this.gainNode.connect(this.audioCtx.destination);
      this.osc = this.audioCtx.createOscillator();
      this.osc.type = 'sine';
      this.osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
      this.osc.connect(this.gainNode);
      this.osc.start();
      // simple ring envelope
      const t = this.audioCtx.currentTime;
      this.gainNode.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
      this.gainNode.gain.exponentialRampToValueAtTime(0.002, t + 0.35);
      // pulse a few times
      const pulse = () => {
        if (!this.osc) return;
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.setValueAtTime(0.002, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.05);
        this.gainNode.gain.exponentialRampToValueAtTime(0.002, now + 0.35);
      };
      const id = setInterval(pulse, 600);
      // store interval id on osc for cleanup
      (this.osc as any)._interval = id;
    } catch {}
  }
  private stopRingtone() {
    try {
      if (this.osc) {
        try { this.osc.stop(); } catch {}
        if ((this.osc as any)._interval) clearInterval((this.osc as any)._interval);
        this.osc.disconnect();
      }
      if (this.gainNode) try { this.gainNode.disconnect(); } catch {}
      this.osc = null; this.gainNode = null;
    } catch {}
  }
}
