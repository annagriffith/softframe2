import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { SocketService } from '../../../services/socket.service';
// Chat component for Frametry6: handles chat UI, message display, and sending messages.
// Use these comments to answer questions about how chat works in the project.

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css'
})
export class Chat implements OnInit {
  // Stores the current channel ID from the URL
  channelId: string = '';
  // Array of messages for the current channel
  messages: any[] = [];
  // The message text the user is typing
  newMessage: string = '';
  // The current logged-in user object
  user: any = null;

  // Sets up router and route for navigation and reading channel ID from URL
  constructor(private router: Router, private route: ActivatedRoute, private api: ApiService, private socketService: SocketService) {}

  // Runs when the component loads. Checks if user is logged in, gets channel ID from URL, and loads messages for that channel.
  ngOnInit() {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      this.router.navigate(['/login']);
      return;
    }
    this.user = JSON.parse(userStr);
    this.route.queryParams.subscribe(params => {
      this.channelId = params['channel'] || '';
      this.loadMessages();
    });
    // Connect socket if token present
    const token = localStorage.getItem('authToken');
    if (token) {
      const sock = this.socketService.connect(token);
      sock.on('message', (m: any) => {
        if (m.channelId === this.channelId) this.messages.push(m);
      });
      sock.on('history', (msgs: any[]) => {
        if (msgs && msgs.length) this.messages = msgs;
      });
    }
  }

  // Loads all messages for the current channel from localStorage and updates the messages array.
  loadMessages() {
    if (!this.channelId) return;
    // Load from server
    this.api.getMessages = this.api.getMessages || ((ch: string) => this.api['http'].get(`/api/messages?channelId=${ch}`));
    this.api.getMessages(this.channelId).subscribe((res: any) => {
      this.messages = res.messages || [];
    });
  }

  // Adds a new message to the messages array and saves it to localStorage. Called when the user sends a message.
  sendMessage() {
    if (!this.newMessage.trim()) return;
    const payload = { channelId: this.channelId, text: this.newMessage };
    this.api.sendMessage(payload).subscribe((res: any) => {
      this.newMessage = '';
    });
  }
}
