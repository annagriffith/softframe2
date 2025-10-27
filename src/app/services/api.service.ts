import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  /** Register a new user. Body: { username, password, email } */
  register(payload: any) {
    return this.http.post('/api/auth/register', payload);
  }

  /** Login an existing user. Body: { username, password } */
  login(payload: any) {
    return this.http.post('/api/auth/login', payload);
  }

  /** Get current user based on Authorization token. */
  me() {
    return this.http.get('/api/auth/me');
  }

  /** Upload avatar image. Multipart form-data with field 'avatar'. */
  uploadAvatar(formData: FormData) {
    return this.http.post('/api/auth/avatar', formData);
  }

  /** Fetch all groups. */
  getGroups() {
    return this.http.get('/api/groups');
  }

  /** Fetch channels, optionally filtered by groupId. */
  getChannels(groupId?: string) {
    return this.http.get('/api/channels' + (groupId ? '?groupId=' + groupId : ''));
  }

  /** Fetch paginated messages for a channel. */
  getMessages(channelId: string, page: number = 1, pageSize: number = 50) {
    return this.http.get(`/api/messages?channelId=${encodeURIComponent(channelId)}&page=${page}&pageSize=${pageSize}`);
  }

  /** Create group (super admin). Body: { name, adminIds } */
  createGroup(payload: any) {
    return this.http.post('/api/groups', payload);
  }

  /** Create channel (group/super admin). Body: { groupId, name } */
  createChannel(payload: any) {
    return this.http.post('/api/channels', payload);
  }

  /** Add/remove group member. Body: { add?: username, remove?: username } */
  updateGroupMembers(groupId: string, payload: any) {
    return this.http.patch(`/api/groups/${groupId}/members`, payload);
  }

  /** Add/remove channel member. Body: { add?: username, remove?: username } */
  updateChannelMembers(channelId: string, payload: any) {
    return this.http.patch(`/api/channels/${channelId}/members`, payload);
  }

  /** Send a text message to a channel. */
  sendMessage(payload: any) {
    return this.http.post('/api/messages', payload);
  }

  /** Upload an image message to a channel. Multipart field 'image'. */
  uploadMessageImage(formData: FormData) {
    return this.http.post('/api/messages/image', formData);
  }

  /** Start a call in a channel; server will broadcast invite to the room. */
  startCall(channelId: string) {
    return this.http.post('/api/calls', { channelId });
  }
}
