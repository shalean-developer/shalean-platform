import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/admin/requirePermission', () => ({ requireAdminPermissionFromRequest: mocks.auth }));
vi.mock('@/lib/zoho/loadProtectedCashEvidence', () => ({ loadProtectedCashEvidence: mocks.load }));
import { GET } from '../route';
afterEach(() => vi.resetAllMocks());
it.each([401, 403])('denies %s before reading protected accounts', async status => {
  mocks.auth.mockResolvedValue({ ok: false, response: new Response('denied', { status }) });
  expect((await GET(new Request('https://example.com/api/admin/cash-protected-evidence'))).status).toBe(status); expect(mocks.load).not.toHaveBeenCalled();
});
it('checks payout.view and returns current book evidence without shared caching', async () => {
  mocks.auth.mockResolvedValue({ ok: true }); mocks.load.mockResolvedValue({ synthetic: true, protectedTotalCents: null });
  const request = new Request('https://example.com/api/admin/cash-protected-evidence'); const response = await GET(request);
  expect(mocks.auth).toHaveBeenCalledWith(request, 'payout.view'); expect(response.headers.get('Cache-Control')).toBe('private, no-store'); expect(await response.json()).toMatchObject({ protectedTotalCents: null });
});
