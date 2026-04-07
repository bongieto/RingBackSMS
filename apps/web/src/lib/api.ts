import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

/** Axios instance for Next.js API routes (same origin) */
const webApi = axios.create({
  baseURL: '/api',
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
  getMe: () => webApi.get('/tenants/me').then((r) => r.data.data),
  updateConfig: (id: string, data: Record<string, unknown>) =>
    api.patch(`/tenants/${id}/config`, data).then((r) => r.data.data),
  generateGreeting: (id: string) =>
    webApi.post(`/tenants/${id}/generate-greeting`).then((r) => r.data.data),
  generateAllGreetings: (id: string) =>
    webApi.post(`/tenants/${id}/generate-greetings`).then((r) => r.data.data),
  getMenu: (id: string) => api.get(`/tenants/${id}/menu`).then((r) => r.data.data),
  upsertMenuItem: (id: string, item: Record<string, unknown>) =>
    api.post(`/tenants/${id}/menu`, item).then((r) => r.data.data),
  deleteMenuItem: (tenantId: string, itemId: string) =>
    api.delete(`/tenants/${tenantId}/menu/${itemId}`).then((r) => r.data),
  getFlows: (id: string) => api.get(`/tenants/${id}/flows`).then((r) => r.data.data),
  updateFlow: (tenantId: string, flowId: string, data: Record<string, unknown>) =>
    api.patch(`/tenants/${tenantId}/flows/${flowId}`, data).then((r) => r.data.data),
};

export const orderApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    api.get('/orders', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string, tenantId: string) =>
    api.get(`/orders/${id}`, { params: { tenantId } }).then((r) => r.data.data),
  updateStatus: (id: string, status: string, tenantId: string) =>
    api.patch(`/orders/${id}/status`, { status, tenantId }).then((r) => r.data.data),
};

export const conversationApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    api.get('/conversations', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => api.get(`/conversations/${id}`).then((r) => r.data.data),
  reply: (id: string, message: string) =>
    api.post(`/conversations/${id}/reply`, { message }).then((r) => r.data.data),
  setHandoff: (id: string, status: 'AI' | 'HUMAN') =>
    api.post(`/conversations/${id}/handoff`, { status }).then((r) => r.data.data),
};

export const analyticsApi = {
  get: (tenantId: string, days = 30) =>
    api.get(`/analytics/${tenantId}`, { params: { days } }).then((r) => r.data.data),
  recovery: (tenantId: string, days = 30) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return webApi
      .get('/analytics/recovery', {
        params: { tenantId, from: from.toISOString(), to: to.toISOString() },
      })
      .then((r) => r.data.data);
  },
};

export const billingApi = {
  createCheckout: (tenantId: string, plan: string, successUrl: string, cancelUrl: string, interval: 'monthly' | 'annual' = 'monthly') =>
    webApi.post('/billing/checkout', { tenantId, plan, successUrl, cancelUrl, interval }).then((r) => r.data.data),
  createPortal: (tenantId: string, returnUrl: string) =>
    webApi.post('/billing/portal', { tenantId, returnUrl }).then((r) => r.data.data),
};

export const phoneApi = {
  search: (tenantId: string, areaCode: string): Promise<{
    numbers: Array<{ phoneNumber: string; friendlyName: string }>;
    isAlternative: boolean;
    searchedAreaCode: string;
    message?: string;
  }> =>
    webApi.post('/phone/search', { tenantId, areaCode }).then((r) => r.data.data),
  provision: (tenantId: string, phoneNumber: string) =>
    webApi.post('/phone/provision', { tenantId, phoneNumber }).then((r) => r.data.data),
  getStatus: (tenantId: string) =>
    webApi.get('/phone/status', { params: { tenantId } }).then((r) => r.data.data),
};

export const meetingApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    api.get('/meetings', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => api.get(`/meetings/${id}`).then((r) => r.data.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/meetings/${id}`, data).then((r) => r.data.data),
  cancel: (id: string) =>
    api.delete(`/meetings/${id}`).then((r) => r.data.data),
  create: (data: Record<string, unknown>) =>
    api.post('/meetings', data).then((r) => r.data.data),
};

export const contactApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    api.get('/contacts', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => api.get(`/contacts/${id}`).then((r) => r.data.data),
  create: (data: Record<string, unknown>) =>
    api.post('/contacts', data).then((r) => r.data.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/contacts/${id}`, data).then((r) => r.data.data),
  delete: (id: string) =>
    api.delete(`/contacts/${id}`).then((r) => r.data),
  getActivity: (id: string) =>
    api.get(`/contacts/${id}/activity`).then((r) => r.data.data),
  getNotes: (id: string) =>
    api.get(`/contacts/${id}/notes`).then((r) => r.data.data),
  addNote: (id: string, body: string) =>
    api.post(`/contacts/${id}/notes`, { body }).then((r) => r.data.data),
  deleteNote: (id: string, noteId: string) =>
    api.delete(`/contacts/${id}/notes/${noteId}`).then((r) => r.data),
  sendSms: (id: string, message: string) =>
    api.post(`/contacts/${id}/sms`, { message }).then((r) => r.data.data),
  export: (tenantId: string) =>
    api.get('/contacts/export', { params: { tenantId }, responseType: 'blob' as const }).then((r) => r.data),
  bulk: (tenantId: string, contactIds: string[], action: 'tag' | 'status' | 'delete', value?: string) =>
    webApi.post('/contacts/bulk', { tenantId, contactIds, action, value }).then((r) => r.data.data),
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

export const voicemailApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    webApi.get('/voicemails', { params: { tenantId, ...params } }).then((r) => r.data),
  audioUrl: (id: string, tenantId: string) =>
    `/api/voicemails/${id}/audio?tenantId=${tenantId}`,
  delete: (id: string, tenantId: string) =>
    webApi.delete(`/voicemails/${id}`, { params: { tenantId } }).then((r) => r.data),
  bulkDelete: (tenantId: string, ids: string[]) =>
    webApi.post('/voicemails/bulk-delete', { tenantId, ids }).then((r) => r.data),
  reply: (id: string, message: string) =>
    webApi.post(`/voicemails/${id}/reply`, { message }).then((r) => r.data),
};

export const replyTemplateApi = {
  list: (tenantId: string) =>
    webApi.get('/reply-templates', { params: { tenantId } }).then((r) => r.data.data),
  create: (tenantId: string, label: string, body: string) =>
    webApi.post('/reply-templates', { tenantId, label, body }).then((r) => r.data.data),
  update: (id: string, data: { label?: string; body?: string; sortOrder?: number }) =>
    webApi.patch(`/reply-templates/${id}`, data).then((r) => r.data.data),
  delete: (id: string) =>
    webApi.delete(`/reply-templates/${id}`).then((r) => r.data.data),
};

export const searchApi = {
  search: (tenantId: string, q: string) =>
    webApi.get('/search', { params: { tenantId, q } }).then((r) => r.data.data),
};

export const taskApi = {
  list: (status?: string) =>
    webApi.get('/tasks', { params: status ? { status } : {} }).then((r) => r.data.data),
  count: () => webApi.get('/tasks/count').then((r) => r.data.data),
  create: (data: { title: string; description?: string; priority?: string }) =>
    webApi.post('/tasks', data).then((r) => r.data.data),
  complete: (id: string) =>
    webApi.patch(`/tasks/${id}`, { action: 'complete' }).then((r) => r.data.data),
  snooze: (id: string, snoozeOption: '1h' | 'tomorrow' | 'next_week') =>
    webApi.patch(`/tasks/${id}`, { action: 'snooze', snoozeOption }).then((r) => r.data.data),
  dismiss: (id: string) =>
    webApi.patch(`/tasks/${id}`, { action: 'dismiss' }).then((r) => r.data.data),
  reopen: (id: string) =>
    webApi.patch(`/tasks/${id}`, { action: 'reopen' }).then((r) => r.data.data),
  delete: (id: string) => webApi.delete(`/tasks/${id}`).then((r) => r.data),
};

export const notificationApi = {
  test: (tenantId: string, channel: 'email' | 'sms' | 'slack') =>
    webApi.post('/notifications/test', { tenantId, channel }).then((r) => r.data.data),
};

export const posApi = {
  listProviders: (tenantId: string) =>
    webApi.get('/integrations/providers', { params: { tenantId } }).then((r) => r.data.data),
  getConnectUrl: (tenantId: string, provider: string) =>
    webApi.get(`/integrations/${provider}/connect`, { params: { tenantId } }).then((r) => r.data.data),
  configure: (tenantId: string, provider: string, credentials: Record<string, string>) =>
    webApi.post(`/integrations/${provider}/configure`, { credentials, tenantId }).then((r) => r.data.data),
  disconnect: (tenantId: string, provider: string) =>
    webApi.delete(`/integrations/${provider}/disconnect`, { params: { tenantId } }).then((r) => r.data.data),
  syncCatalog: (tenantId: string, provider: string) =>
    webApi.post(`/integrations/${provider}/sync-catalog`, null, { params: { tenantId } }).then((r) => r.data.data),
  pushCatalog: (tenantId: string, provider: string) =>
    webApi.post(`/integrations/${provider}/push-catalog`, null, { params: { tenantId } }).then((r) => r.data.data),
  refreshToken: (tenantId: string, provider: string) =>
    webApi.post(`/integrations/${provider}/refresh`, null, { params: { tenantId } }).then((r) => r.data.data),
  getStatus: (tenantId: string, provider: string) =>
    webApi.get(`/integrations/${provider}/status`, { params: { tenantId } }).then((r) => r.data.data),
  getSyncHistory: (tenantId: string) =>
    webApi.get('/integrations/sync-history', { params: { tenantId } }).then((r) => r.data.data),
};
