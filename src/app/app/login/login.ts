import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// Login component for Frametry6: handles user login and authentication.
// Use these comments to answer questions about how login works in the project.

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  // Stores the username entered by the user
  username = '';
  // Stores the password entered by the user
  password = '';
  // Stores any error message to show in the UI
  error = '';

  // Sets up HttpClient for API calls and Router for navigation
  constructor(private api: ApiService, private router: Router, private socketService: SocketService) {}

  // Sends login request to backend with username and password. Handles response by saving user to localStorage and navigating to profile, or showing error.
  login() {
    this.error = '';
    this.api.login({ username: this.username, password: this.password }).subscribe((res: any) => {
      if (res && res.token) {
        localStorage.setItem('authToken', res.token);
        localStorage.setItem('currentUser', JSON.stringify(res.user));
        // connect socket with token
        this.socketService.connect(res.token);
        this.router.navigate(['/profile']);
      } else {
        this.error = res.error || 'Invalid username or password.';
      }
    }, () => {
      this.error = 'Server error.';
    });
  }
}
