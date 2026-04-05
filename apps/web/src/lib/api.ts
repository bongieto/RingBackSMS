import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Attach a Clerk session token to outgoing requests.
 * Called from a React component or hook via setAuthToken().
 */
export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export default api;

// ── API helpers ───────────────────────────────────────────────────────────────

export const tenantApi = {
  getMe: () => api.get('/tenants/me').then((r) => r.data.data),
  updateConfig: (id: string, data: Record<string, unknown>) =>
    api.patch(`/tenants/${id}/config`, data).then((r) => r.data.data),
  getMenu: (id: string) => api.get(`/tenants/${id}/menu`).then((r) => r.data.data),
  upsertMenuItem: (id: string, item: Record<string, unknown>) =>
    api.post(`/tenants/${id}/menu`, item).then((r) => r.data.data),
  getFlows: (id: string) => api.get(`/tenants/${id}/flows`).then((r) => r.data.data),
  updateFlow: (tenantId: string, flowId: string, data: Record<string, unknown>) =>
    api.patch(`/tenants/${tenantId}/flows/${flowId}`, data).then((r) => r.data.data),
};

export const conversationApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    api.get('/conversations', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => api.get(`/conversations/${id}`).then((r) => r.data.data),
};

export const analyticsApi = {
  get: (tenantId: string, days = 30) =>
    api.get(`/analytics/${tenantId}`, { params: { days } }).then((r) => r.data.data),
};

export const billingApi = {
  createCheckout: (tenantId: string, plan: string, successUrl: string, cancelUrl: string) =>
    api.post('/billing/checkout', { tenantId, plan, successUrl, cancelUrl }).then((r) => r.data.data),
  createPortal: (tenantId: string, returnUrl: string) =>
    api.post('/billing/portal', { tenantId, returnUrl }).then((r) => r.data.data),
};

export const squareApi = {
  getConnectUrl: (tenantId: string) =>
    api.get('/integrations/square/connect', { params: { tenantId } }).then((r) => r.data.data),
  disconnect: (tenantId: string) =>
    api.delete('/integrations/square/disconnect', { params: { tenantId } }).then((r) => r.data.data),
  syncCatalog: (tenantId: string) =>
    api.post('/integrations/square/sync-catalog', null, { params: { tenantId } }).then((r) => r.data.data),
  pushCatalog: (tenantId: string) =>
    api.post('/integrations/square/push-catalog', null, { params: { tenantId } }).then((r) => r.data.data),
};
