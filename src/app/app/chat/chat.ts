import { Component, OnInit, OnDestroy } from '@angular/core';
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
  private currentRoom: string | null = null;
  messages: any[] = [];
  newMessage = '';
  user: any = null;
  imagePreviewUrl: string | null = null;
  private socket: any;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private api: ApiService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      this.router.navigate(['/login']);
      return;
    }
    this.user = JSON.parse(userStr);
    this.route.queryParams.subscribe((params: any) => {
      const nextChannel = params['channel'] || '';
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
      this.loadMessages();
    });
    const token = localStorage.getItem('authToken');
    if (token) {
      this.socket = this.socketService.connect(token);
      this.socket.on('message', (m: any) => {
        if (m.channelId === this.channelId) this.messages.push(m);
      });
      this.socket.on('history', (msgs: any[]) => {
        if (msgs && msgs.length) this.messages = msgs;
      });
    }
  }

  ngOnDestroy(): void {
    if (this.socket && this.channelId) {
      this.socket.emit('leave', { channelId: this.channelId });
      this.socket.off('message');
      this.socket.off('history');
    }
  }

  loadMessages(): void {
    if (!this.channelId) return;
    this.api.getMessages(this.channelId).subscribe((res: any) => {
      this.messages = res.messages || [];
    });
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;
    const payload = { channelId: this.channelId, text: this.newMessage };
    this.api.sendMessage(payload).subscribe(() => {
      this.newMessage = '';
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
}
