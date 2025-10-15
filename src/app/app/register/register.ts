import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {
  username = '';
  email = '';
  password = '';
  error = '';

  constructor(private api: ApiService, private router: Router, private socketService: SocketService) {}

  register() {
    this.error = '';
    if (!this.username || !this.email || !this.password) {
      this.error = 'All fields are required.';
      return;
    }
    this.api.register({ username: this.username, email: this.email, password: this.password }).subscribe({
      next: (res: any) => {
        if (res && res.token && res.user) {
          localStorage.setItem('authToken', res.token);
          localStorage.setItem('currentUser', JSON.stringify(res.user));
          this.socketService.connect(res.token);
          this.router.navigate(['/profile']);
        } else {
          this.error = res?.error || 'Registration failed.';
        }
      },
      error: (err) => {
        this.error = err?.error?.error || 'Server error.';
      }
    });
  }
}
