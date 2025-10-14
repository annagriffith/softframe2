import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClient as provideClient } from '@angular/common/http';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './app/services/auth.interceptor';
import { SocketService } from './app/services/socket.service';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideClient({ withInterceptors: true }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    SocketService
  ]
})
  .catch((err) => console.error(err));
