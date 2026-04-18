import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

/** Axios instance for Next.js API routes (same origin) */
export const webApi = axios.create({
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
    webApi.patch(`/tenants/${id}/config`, data).then((r) => r.data.data),
  generateAllGreetings: (id: string) =>
    webApi.post(`/tenants/${id}/generate-greetings`).then((r) => r.data.data),
  getMenu: (id: string) => webApi.get(`/tenants/${id}/menu`).then((r) => r.data.data),
  upsertMenuItem: (id: string, item: Record<string, unknown>) =>
    webApi.post(`/tenants/${id}/menu`, item).then((r) => r.data.data),
  deleteMenuItem: (tenantId: string, itemId: string) =>
    webApi.delete(`/tenants/${tenantId}/menu/${itemId}`).then((r) => r.data),
  // Categories
  listCategories: (tenantId: string) =>
    webApi.get(`/tenants/${tenantId}/menu/categories`).then((r) => r.data.data),
  createCategory: (tenantId: string, body: Record<string, unknown>) =>
    webApi.post(`/tenants/${tenantId}/menu/categories`, body).then((r) => r.data.data),
  updateCategory: (tenantId: string, categoryId: string, body: Record<string, unknown>) =>
    webApi.patch(`/tenants/${tenantId}/menu/categories/${categoryId}`, body).then((r) => r.data.data),
  deleteCategory: (tenantId: string, categoryId: string) =>
    webApi.delete(`/tenants/${tenantId}/menu/categories/${categoryId}`).then((r) => r.data.data),
  bulkSetCategoryAvailability: (tenantId: string, ids: string[], isAvailable: boolean) =>
    webApi.patch(`/tenants/${tenantId}/menu/categories/bulk-availability`, { ids, isAvailable }).then((r) => r.data.data),
  bulkSetItemAvailability: (tenantId: string, ids: string[], isAvailable: boolean) =>
    webApi.patch(`/tenants/${tenantId}/menu/items/bulk-availability`, { ids, isAvailable }).then((r) => r.data.data),
  // Option groups
  listOptionGroups: (tenantId: string) =>
    webApi.get(`/tenants/${tenantId}/menu/option-groups`).then((r) => r.data.data),
  createOptionGroup: (tenantId: string, body: Record<string, unknown>) =>
    webApi.post(`/tenants/${tenantId}/menu/option-groups`, body).then((r) => r.data.data),
  updateOptionGroup: (tenantId: string, groupId: string, body: Record<string, unknown>) =>
    webApi.patch(`/tenants/${tenantId}/menu/option-groups/${groupId}`, body).then((r) => r.data.data),
  deleteOptionGroup: (tenantId: string, groupId: string) =>
    webApi.delete(`/tenants/${tenantId}/menu/option-groups/${groupId}`).then((r) => r.data.data),
  // Options
  listOptions: (tenantId: string) =>
    webApi.get(`/tenants/${tenantId}/menu/options`).then((r) => r.data.data),
  createOption: (tenantId: string, body: Record<string, unknown>) =>
    webApi.post(`/tenants/${tenantId}/menu/options`, body).then((r) => r.data.data),
  updateOption: (tenantId: string, optionId: string, body: Record<string, unknown>) =>
    webApi.patch(`/tenants/${tenantId}/menu/options/${optionId}`, body).then((r) => r.data.data),
  deleteOption: (tenantId: string, optionId: string) =>
    webApi.delete(`/tenants/${tenantId}/menu/options/${optionId}`).then((r) => r.data.data),
  getFlows: (id: string) => webApi.get(`/tenants/${id}/flows`).then((r) => r.data.data),
  updateFlow: (tenantId: string, flowId: string, data: Record<string, unknown>) =>
    webApi.patch(`/tenants/${tenantId}/flows/${flowId}`, data).then((r) => r.data.data),
  getTeam: (id: string) =>
    webApi.get(`/tenants/${id}/invite`).then((r) => r.data.data as {
      members: Array<{ userId: string | null; email: string | null; name: string | null; role: string; createdAt: string }>;
      invitations: Array<{ id: string; email: string; role: string; status: string; createdAt: string }>;
    }),
  sendInvite: (id: string, email: string, role: string = 'org:admin') =>
    webApi.post(`/tenants/${id}/invite`, { email, role }).then((r) => r.data.data),
};

export const orderApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    webApi.get('/orders', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string, tenantId: string) =>
    webApi.get(`/orders/${id}`, { params: { tenantId } }).then((r) => r.data.data),
  updateStatus: (id: string, status: string, tenantId: string) =>
    webApi.patch(`/orders/${id}/status`, { status, tenantId }).then((r) => r.data.data),
};

export const conversationApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    webApi.get('/conversations', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => webApi.get(`/conversations/${id}`).then((r) => r.data.data),
  reply: (id: string, message: string) =>
    webApi.post(`/conversations/${id}/reply`, { message }).then((r) => r.data.data),
  setHandoff: (id: string, status: 'AI' | 'HUMAN') =>
    webApi.post(`/conversations/${id}/handoff`, { status }).then((r) => r.data.data),
};

export const analyticsApi = {
  get: (tenantId: string, days = 30) =>
    webApi.get(`/analytics/${tenantId}`, { params: { days } }).then((r) => r.data.data),
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
    webApi.get('/meetings', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => webApi.get(`/meetings/${id}`).then((r) => r.data.data),
  update: (id: string, data: Record<string, unknown>) =>
    webApi.patch(`/meetings/${id}`, data).then((r) => r.data.data),
  cancel: (id: string) =>
    webApi.delete(`/meetings/${id}`).then((r) => r.data.data),
  create: (data: Record<string, unknown>) =>
    webApi.post('/meetings', data).then((r) => r.data.data),
};

export const contactApi = {
  list: (tenantId: string, params?: Record<string, unknown>) =>
    webApi.get('/contacts', { params: { tenantId, ...params } }).then((r) => r.data),
  get: (id: string) => webApi.get(`/contacts/${id}`).then((r) => r.data.data),
  create: (data: Record<string, unknown>) =>
    webApi.post('/contacts', data).then((r) => r.data.data),
  update: (id: string, data: Record<string, unknown>) =>
    webApi.patch(`/contacts/${id}`, data).then((r) => r.data.data),
  delete: (id: string) =>
    webApi.delete(`/contacts/${id}`).then((r) => r.data),
  getActivity: (id: string) =>
    webApi.get(`/contacts/${id}/activity`).then((r) => r.data.data),
  getNotes: (id: string) =>
    webApi.get(`/contacts/${id}/notes`).then((r) => r.data.data),
  addNote: (id: string, body: string) =>
    webApi.post(`/contacts/${id}/notes`, { body }).then((r) => r.data.data),
  deleteNote: (id: string, noteId: string) =>
    webApi.delete(`/contacts/${id}/notes/${noteId}`).then((r) => r.data),
  sendSms: (id: string, message: string) =>
    webApi.post(`/contacts/${id}/sms`, { message }).then((r) => r.data.data),
  export: (tenantId: string) =>
    webApi.get('/contacts/export', { params: { tenantId }, responseType: 'blob' as const }).then((r) => r.data),
  bulk: (tenantId: string, contactIds: string[], action: 'tag' | 'status' | 'delete', value?: string) =>
    webApi.post('/contacts/bulk', { tenantId, contactIds, action, value }).then((r) => r.data.data),
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
  refreshToken: (tenantId: string, provider: string) =>
    webApi.post(`/integrations/${provider}/refresh`, null, { params: { tenantId } }).then((r) => r.data.data),
  getStatus: (tenantId: string, provider: string) =>
    webApi.get(`/integrations/${provider}/status`, { params: { tenantId } }).then((r) => r.data.data),
  getSyncHistory: (tenantId: string) =>
    webApi.get('/integrations/sync-history', { params: { tenantId } }).then((r) => r.data.data),
  listLocations: (tenantId: string, provider: string) =>
    webApi
      .get(`/integrations/${provider}/locations`, { params: { tenantId } })
      .then((r) => r.data.data as {
        locations: Array<{ id: string; name: string; address: string | null }>;
        currentLocationId: string | null;
      }),
  configureLocation: (tenantId: string, provider: string, locationId: string) =>
    webApi
      .post(
        `/integrations/${provider}/configure-location`,
        { locationId },
        { params: { tenantId } },
      )
      .then((r) => r.data.data as { locationId: string; name: string; address: string | null }),
};

export const calcomApi = {
  getStatus: (tenantId: string) =>
    webApi
      .get('/integrations/calcom/status', { params: { tenantId } })
      .then((r) => r.data.data as {
        connected: boolean;
        userEmail: string | null;
        eventTypeId: number | null;
        eventTypeSlug: string | null;
      }),
  oauthStartUrl: (tenantId: string) =>
    `/api/integrations/calcom/oauth/start?tenantId=${encodeURIComponent(tenantId)}`,
  listEventTypes: (tenantId: string) =>
    webApi
      .get('/integrations/calcom/event-types', { params: { tenantId } })
      .then((r) => r.data.data as {
        eventTypes: Array<{ id: number; slug: string; title: string; lengthInMinutes: number }>;
        currentEventTypeId: number | null;
      }),
  configure: (tenantId: string, eventTypeId: number, eventTypeSlug: string) =>
    webApi
      .post(
        '/integrations/calcom/configure',
        { eventTypeId, eventTypeSlug },
        { params: { tenantId } },
      )
      .then((r) => r.data.data as { eventTypeId: number; eventTypeSlug: string }),
  disconnect: (tenantId: string) =>
    webApi
      .post('/integrations/calcom/disconnect', null, { params: { tenantId } })
      .then((r) => r.data.data),
};
