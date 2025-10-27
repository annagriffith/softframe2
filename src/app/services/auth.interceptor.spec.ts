import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, HttpClientModule } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.setItem('authToken', 't123');
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds Authorization header when token present', () => {
    http.get('/api/health').subscribe();
    const req = httpMock.expectOne('/api/health');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t123');
    req.flush({ ok: true });
  });
});
