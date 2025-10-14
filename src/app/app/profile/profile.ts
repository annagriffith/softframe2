
// Profile page component for Frametry6: displays user info, groups, and channels.
// Use these comments to answer questions about how the profile page works in the project.
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LocalStorageService } from '../../services/local-storage.service';
import { ApiService } from '../../services/api.service';
import { Group } from '../../models/group.model';
import { Channel } from '../../models/channel.model';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css']
})
export class ProfileComponent implements OnInit {
  // The current logged-in user object
  // ...existing code...
  // Array of groups the user belongs to
  // ...existing code...
  // Object mapping group IDs to arrays of channels
  // ...existing code...
  // Stores the new channel name input by the user
  // ...existing code...
  // Stores any error message for channel creation
  // ...existing code...
  // Current logged-in user
  user: any = null;
  // Groups the user belongs to
  groups: Group[] = [];
  // Channels organized by group
  channelsByGroup: { [groupId: string]: Channel[] } = {};
  // New channel name input
  newChannelName = '';
  // Error message for channel creation
  channelError = '';
  // New group name input
  newGroupName = '';
  // Error message for group creation
  groupError = '';
  // Success message for group creation
  groupSuccess = '';
  // Creates a new group (for group/super admins)
  createGroup(): void {
    this.groupError = '';
    this.groupSuccess = '';
    const name = this.newGroupName.trim();
    if (!name) {
      this.groupError = 'Group name required.';
      return;
    }
    this.http.post('/api/groups', {
      requester: this.user.username,
      name,
      adminIds: [this.user.username]
    }).subscribe({
      next: () => {
        this.newGroupName = '';
        this.groupSuccess = 'Group created successfully!';
        this.ngOnInit();
      },
      error: (err: any) => {
        this.groupError = err.error?.error || 'Error creating group.';
      }
    });
  }

  // Sets up Router for navigation and LocalStorageService for data access
  constructor(
    private router: Router,
    private localStorageService: LocalStorageService,
    private api: ApiService,
    private http: HttpClient
  ) {}

  onAvatarSelected(event: any): void {
    const file: File = event.target.files && event.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    this.api.uploadAvatar(form).subscribe((res: any) => {
      if (res && res.avatar) {
        this.user.avatar = res.avatar;
        localStorage.setItem('currentUser', JSON.stringify(this.user));
      }
    });
  }

  // Runs when the component loads. Checks if user is logged in, loads groups and channels for the user.
  ngOnInit() {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      this.router.navigate(['/login']);
      return;
    }
    this.user = JSON.parse(userStr);
    // Fetch groups and channels from backend
    this.api.getGroups().subscribe((allGroups: any) => {
      this.groups = allGroups.filter((g: any) => g.memberIds.includes(this.user.username));
      this.api.getChannels().subscribe((allChannels: any) => {
        this.channelsByGroup = {};
        for (const group of this.groups) {
          this.channelsByGroup[group.id] = allChannels.filter((c: any) => c.groupId === group.id);
        }
      });
    });
  }

  // Creates a new channel in the specified group. Checks for valid name and duplicates, then adds the channel.
  createChannel(groupId: string) {
    this.channelError = '';
    const name = this.newChannelName.trim();
    if (!name) {
      this.channelError = 'Channel name required.';
      return;
    }
    // Check for duplicate name in group (from backend channels)
    this.api.getChannels().subscribe((allChannels: any) => {
      if (allChannels.filter((c: Channel) => c.groupId === groupId).some((c: Channel) => c.name === name)) {
        this.channelError = 'Channel name already exists.';
        return;
      }
      // Send create request to backend
      this.api.createChannel({ groupId, name }).subscribe({
        next: () => {
          this.newChannelName = '';
          this.ngOnInit();
        },
        error: (err: any) => {
          this.channelError = err.error?.error || 'Error creating channel.';
        }
      });
    });
  }
}
