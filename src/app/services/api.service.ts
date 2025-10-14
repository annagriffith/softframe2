import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  register(payload: any) {
    return this.http.post('/api/auth/register', payload);
  }

  login(payload: any) {
    return this.http.post('/api/auth/login', payload);
  }

  me() {
    return this.http.get('/api/auth/me');
  }

  uploadAvatar(formData: FormData) {
    return this.http.post('/api/auth/avatar', formData);
  }

  getGroups() {
    return this.http.get('/api/groups');
  }

  getChannels(groupId?: string) {
    return this.http.get('/api/channels' + (groupId ? '?groupId=' + groupId : ''));
  }

  getMessages(channelId: string, page: number = 1, pageSize: number = 50) {
    return this.http.get(`/api/messages?channelId=${encodeURIComponent(channelId)}&page=${page}&pageSize=${pageSize}`);
  }

  createGroup(payload: any) {
    return this.http.post('/api/groups', payload);
  }

  createChannel(payload: any) {
    return this.http.post('/api/channels', payload);
  }

  sendMessage(payload: any) {
    return this.http.post('/api/messages', payload);
  }

  uploadMessageImage(formData: FormData) {
    return this.http.post('/api/messages/image', formData);
  }
}
