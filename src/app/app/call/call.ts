import { Component, OnInit } from '@angular/core';
import { SocketService } from '../../../services/socket.service';

@Component({
  selector: 'app-call',
  templateUrl: './call.html',
  styleUrls: ['./call.css']
})
export class CallComponent implements OnInit {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  pc: RTCPeerConnection | null = null;
  socket: any;

  constructor(private socketService: SocketService) {}

  async ngOnInit() {
    const token = localStorage.getItem('authToken');
    if (token) this.socket = this.socketService.connect(token);
    // set up simple UI handlers on the page
  }

  async startCall() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const videoEl: any = document.getElementById('localVideo');
    videoEl.srcObject = this.localStream;

    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
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
      if (ev.candidate) this.socket.emit('call:ice', { candidate: ev.candidate, to: 'all' });
    };

    // Signaling via socket
    this.socket.on('call:offer', async (payload: any) => {
      if (!this.pc) this.startCall();
      await this.pc!.setRemoteDescription(payload.offer);
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);
      this.socket.emit('call:answer', { answer, to: payload.from });
    });

    this.socket.on('call:answer', async (payload: any) => {
      if (this.pc && payload.answer) await this.pc.setRemoteDescription(payload.answer);
    });

    this.socket.on('call:ice', async (payload: any) => {
      if (this.pc && payload.candidate) await this.pc.addIceCandidate(payload.candidate);
    });

    // Create offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.socket.emit('call:offer', { offer, from: this.socket.id, to: 'all' });
  }

  async stopCall() {
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
  }
}
