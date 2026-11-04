import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); vi.stubEnv('ZOHO_CLIENT_ID','synthetic'); vi.stubEnv('ZOHO_CLIENT_SECRET','synthetic'); vi.stubEnv('ZOHO_REFRESH_TOKEN','synthetic'); vi.stubEnv('ZOHO_ORGANIZATION_ID','123'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('refreshes a revoked cached token once for mirror GETs, preserving organisation', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'synthetic-old'})))
    .mockResolvedValueOnce(new Response(JSON.stringify({code:57}),{status:401}))
    .mockResolvedValueOnce(new Response(JSON.stringify({access_token:'synthetic-new'})))
    .mockResolvedValueOnce(new Response(JSON.stringify({code:0,expenses:[]})));
  vi.stubGlobal('fetch',fetch);
  const {zohoBooksClient} = await import('../zohoBooksClient');
  expect(await zohoBooksClient.getWithTokenRecovery('/expenses')).toEqual({code:0,expenses:[]});
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[3][0]).toContain('organization_id=123');
  expect(fetch.mock.calls[3][1].headers.Authorization).toBe('Zoho-oauthtoken synthetic-new');
});
it('does not loop on persistent authentication errors', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => url.includes('oauth/v2/token') ? new Response(JSON.stringify({access_token:'synthetic'})) : new Response(JSON.stringify({code:57}),{status:401}));
  vi.stubGlobal('fetch',fetch);
  const {zohoBooksClient} = await import('../zohoBooksClient');
  await expect(zohoBooksClient.getWithTokenRecovery('/expenses')).rejects.toThrow('401');
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('never retries financial POSTs on authentication errors', async () => {
  // Mock the production-only request path to reach a synthetic 401 response.
  vi.stubEnv('SHALEAN_APP_ENV', 'production');
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'synthetic'}))).mockResolvedValueOnce(new Response(JSON.stringify({code:57}),{status:401}));
  vi.stubGlobal('fetch',fetch);
  const {zohoBooksClient} = await import('../zohoBooksClient');
  await expect(zohoBooksClient.post('/expenses',{})).rejects.toThrow('401');
  expect(fetch).toHaveBeenCalledTimes(2);
});


it.each(['POST', 'PUT', 'DELETE'] as const)(
  'blocks staging Zoho %s before token or Books HTTP requests',
  async (method) => {
    vi.stubEnv('SHALEAN_APP_ENV', 'staging');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { zohoBooksClient } = await import('../zohoBooksClient');
    const request =
      method === 'POST'
        ? zohoBooksClient.post('/customerpayments', { amount: 1 })
        : method === 'PUT'
          ? zohoBooksClient.put('/customerpayments/123', { amount: 1 })
          : zohoBooksClient.delete('/customerpayments/123');
    await expect(request).rejects.toThrow('zoho_books_write_blocked_nonproduction');
    expect(fetch).not.toHaveBeenCalled();
  },
);
