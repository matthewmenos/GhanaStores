/**
 * Ghana Stores API client.
 * Attaches the seller JWT and normalizes errors. No emojis, ever.
 */
const TOKEN_KEY = 'gs_token';
const STORE_KEY = 'gs_store';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setSession(token, store) {
  localStorage.setItem(TOKEN_KEY, token);
  if (store) localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STORE_KEY);
}

export function getCachedStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, isForm } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 401 && !path.startsWith('/api/billing/login')) {
      // Session expired - hard reset so the login screen appears.
      clearSession();
      window.dispatchEvent(new Event('gs:logout'));
    }
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
};

/** GHS currency formatter used across all dashboards. */
export function ghs(value) {
  const n = Number(value || 0);
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
