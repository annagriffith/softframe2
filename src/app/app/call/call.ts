import { Component, OnInit, OnDestroy } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-call',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './call.html',
  styleUrls: ['./call.css']
})
export class CallComponent implements OnInit, OnDestroy {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  pc: RTCPeerConnection | null = null;
  socket: any;
  private offerHandler: any;
  private answerHandler: any;
  private iceHandler: any;
  joinedRoom: string | null = null;
  inCall = false;

  constructor(private socketService: SocketService, private route: ActivatedRoute) {}

  async ngOnInit() {
    const token = localStorage.getItem('authToken');
    if (token) this.socket = this.socketService.connect(token);

    // Join call room if channel query param present
    this.route.queryParams.subscribe(params => {
      const channel = params['channel'];
      if (channel && this.socket) {
        this.joinRoom(channel);
      }
    });
    // register handlers to receive offers/answers/ice
    if (this.socket) this.registerSignalHandlers();
  }

  ngOnDestroy(): void {
    // cleanup
    this.stopCall();
    if (this.socket) {
      if (this.offerHandler) this.socket.off('call:offer', this.offerHandler);
      if (this.answerHandler) this.socket.off('call:answer', this.answerHandler);
      if (this.iceHandler) this.socket.off('call:ice', this.iceHandler);
    }
  }

  async startCall() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      console.error('Error accessing media devices', err);
      return;
    }
    const videoEl: any = document.getElementById('localVideo');
    videoEl.srcObject = this.localStream;
    if (!this.pc) {
      this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    }
    this.remoteStream = new MediaStream();
    const remoteEl: any = document.getElementById('remoteVideo');
    remoteEl.srcObject = this.remoteStream;

    // Add local tracks
    this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));

    // Forward remote tracks
    this.pc.ontrack = (ev) => {
      ev.streams[0].getTracks().forEach(t => this.remoteStream!.addTrack(t));
    };

    // ICE candidates
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.socket) this.socket.emit('call:ice', { candidate: ev.candidate, to: 'all' });
    };

    // handlers are registered above via registerSignalHandlers()

    // Create offer
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (this.socket) this.socket.emit('call:offer', { offer, from: this.socket.id, to: this.joinedRoom || 'all' });
      this.inCall = true;
    } catch (err) {
      console.error('Error creating offer', err);
    }
  }

  async stopCall() {
    try {
      this.pc?.close();
    } catch (err) {
      console.warn('Error closing peer connection', err);
    }
    this.pc = null;
    try {
      this.localStream?.getTracks().forEach(t => t.stop());
    } catch (err) {
      console.warn('Error stopping tracks', err);
    }
    this.localStream = null;
    this.remoteStream = null;
    this.inCall = false;
  }

  private joinRoom(roomId: string) {
    if (!this.socket) return;
    this.joinedRoom = roomId;
    this.socket.emit('call:join', { roomId, username: localStorage.getItem('currentUser') && JSON.parse(localStorage.getItem('currentUser') as string).username });
  }

  private registerSignalHandlers() {
    if (!this.socket) return;
    this.offerHandler = async (payload: any) => {
      try {
        if (!this.pc) await this.startCall();
        if (payload && payload.offer) await this.pc!.setRemoteDescription(payload.offer);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.socket.emit('call:answer', { answer, to: payload.from });
      } catch (err) {
        console.error('Error handling offer', err);
      }
    };
    this.socket.on('call:offer', this.offerHandler);

    this.answerHandler = async (payload: any) => {
      try {
        if (this.pc && payload && payload.answer) await this.pc.setRemoteDescription(payload.answer);
      } catch (err) {
        console.error('Error handling answer', err);
      }
    };
    this.socket.on('call:answer', this.answerHandler);

    this.iceHandler = async (payload: any) => {
      try {
        if (this.pc && payload && payload.candidate) await this.pc.addIceCandidate(payload.candidate);
      } catch (err) {
        console.error('Error adding ICE candidate', err);
      }
    };
    this.socket.on('call:ice', this.iceHandler);
  }
}
