import { RoleGuard } from './role.guard';
import { Router } from '@angular/router';

describe('RoleGuard', () => {
  let guard: RoleGuard;
  const router = { navigate: jasmine.createSpy('navigate') } as any as Router;

  beforeEach(() => {
    guard = new RoleGuard(router);
    localStorage.clear();
  });

  it('redirects to login when no user', () => {
    const ok = guard.canActivate({ data: { roles: ['superAdmin'] } } as any);
    expect(ok).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('allows when role matches', () => {
    localStorage.setItem('currentUser', JSON.stringify({ username: 'x', role: 'superAdmin' }));
    const ok = guard.canActivate({ data: { roles: ['superAdmin'] } } as any);
    expect(ok).toBeTrue();
  });
});
