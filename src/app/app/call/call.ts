import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
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
export class CallComponent implements OnInit, OnDestroy, AfterViewInit {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  pc: RTCPeerConnection | null = null;
  socket: any;
  private offerHandler: any;
  private answerHandler: any;
  private iceHandler: any;
  private joinedHandler: any;
  joinedRoom: string | null = null;
  inCall = false;
  role: string | null = null;

  @ViewChild('localVideo') localVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo?: ElementRef<HTMLVideoElement>;

  constructor(private socketService: SocketService, private route: ActivatedRoute) {}

  async ngOnInit() {
    const token = localStorage.getItem('authToken');
    if (token) this.socket = this.socketService.connect(token);

    // Register handlers to receive offers/answers/ice BEFORE joining room to avoid missing early events
    if (this.socket) this.registerSignalHandlers();

    // Join call room if channel query param present
    this.route.queryParams.subscribe(params => {
      const channel = params['channel'];
      const role = params['role'];
      this.role = role || null;
      if (channel && this.socket) {
        this.joinRoom(channel);
        // Only the caller auto-starts; others auto-handle on offer
        if (role === 'caller' && !this.inCall) this.startCall();
      }
    });
  }

  ngAfterViewInit(): void {
    // Attach any pre-fetched streams once the view is ready
    if (this.localStream && this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = this.localStream;
    }
    if (this.remoteStream && this.remoteVideo?.nativeElement) {
      this.remoteVideo.nativeElement.srcObject = this.remoteStream;
    }
  }

  ngOnDestroy(): void {
    // cleanup
    this.stopCall();
    if (this.socket) {
      if (this.offerHandler) this.socket.off('call:offer', this.offerHandler);
      if (this.answerHandler) this.socket.off('call:answer', this.answerHandler);
      if (this.iceHandler) this.socket.off('call:ice', this.iceHandler);
      if (this.joinedHandler) this.socket.off('call:joined', this.joinedHandler);
    }
  }

  private async initPeerAndMedia() {
    try {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        // Bind to video element if available; otherwise AfterViewInit will attach
        if (this.localVideo?.nativeElement) {
          this.localVideo.nativeElement.srcObject = this.localStream;
        }
      }
    } catch (err) {
      console.error('Error accessing media devices', err);
      throw err;
    }
    if (!this.pc) {
      this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      // Forward remote tracks
      this.remoteStream = new MediaStream();
      if (this.remoteVideo?.nativeElement) {
        this.remoteVideo.nativeElement.srcObject = this.remoteStream;
      }
      this.pc.ontrack = (ev) => {
        ev.streams[0].getTracks().forEach(t => this.remoteStream!.addTrack(t));
        // Ensure binding in case element attached later
        if (this.remoteVideo?.nativeElement) {
          this.remoteVideo.nativeElement.srcObject = this.remoteStream!;
        }
      };
      // ICE candidates to the joined room
      this.pc.onicecandidate = (ev) => {
        if (ev.candidate && this.socket && this.joinedRoom) {
          this.socket.emit('call:ice', { candidate: ev.candidate, to: this.joinedRoom });
        }
      };
      // Add local tracks
      this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
    }
  }

  async startCall() {
    try {
      await this.initPeerAndMedia();
      // Create offer as caller
      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);
      if (this.socket) {
        // notify channel users that a call started
        if (this.joinedRoom) this.socket.emit('call:join', { roomId: this.joinedRoom, username: (localStorage.getItem('currentUser') && JSON.parse(localStorage.getItem('currentUser') as string).username) });
        this.socket.emit('call:offer', { offer, from: this.socket.id, to: this.joinedRoom });
      }
      this.inCall = true;
    } catch (err) {
      console.error('Error starting call', err);
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
    // Notify channel that caller canceled (WhatsApp-like) or that we left
    if (this.socket && this.joinedRoom) {
      this.socket.emit('call:leave', { roomId: this.joinedRoom, username: (localStorage.getItem('currentUser') && JSON.parse(localStorage.getItem('currentUser') as string).username) });
      if (this.role === 'caller') {
        this.socket.emit('call:cancel', { roomId: this.joinedRoom });
      }
    }
  }

  private joinRoom(roomId: string) {
    if (!this.socket) return;
    this.joinedRoom = roomId;
    this.socket.emit('call:join', { roomId, username: localStorage.getItem('currentUser') && JSON.parse(localStorage.getItem('currentUser') as string).username });
    // If we already created an offer (caller), re-send it so late joiners receive it
    if (this.pc && this.pc.localDescription) {
      this.socket.emit('call:offer', { offer: this.pc.localDescription, from: this.socket.id, to: this.joinedRoom });
    }
  }

  private registerSignalHandlers() {
    if (!this.socket) return;
    // When anyone joins the call room, if we're the caller and already have an offer,
    // re-send the offer directly to the joining socket so late joiners connect.
    this.joinedHandler = async (payload: any) => {
      try {
        if (!payload || !payload.socketId) return;
        if (this.role === 'caller' && this.pc && this.pc.localDescription) {
          this.socket.emit('call:offer', { offer: this.pc.localDescription, from: this.socket.id, to: payload.socketId });
        }
      } catch (err) {
        console.error('Error handling call:joined', err);
      }
    };
    this.socket.on('call:joined', this.joinedHandler);
    this.offerHandler = async (payload: any) => {
      try {
        // Prepare peer + media as callee but DO NOT create a new offer
        await this.initPeerAndMedia();
        if (payload && payload.offer) await this.pc!.setRemoteDescription(payload.offer);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.socket.emit('call:answer', { answer, to: payload.from });
        this.inCall = true;
      } catch (err) {
        console.error('Error handling offer', err);
      }
    };
    this.socket.on('call:offer', this.offerHandler);

    this.answerHandler = async (payload: any) => {
      try {
        if (this.pc && payload && payload.answer) await this.pc.setRemoteDescription(payload.answer);
        this.inCall = true;
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
