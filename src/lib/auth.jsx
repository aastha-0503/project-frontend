// Lightweight auth context for Geeky AI's two-panel sign-in.
//
// We persist the bearer token in localStorage so a refresh doesn't kick
// the user back to the login page. The token is sent on every backend
// call via the global axios interceptor at the bottom of this file.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from './enterprise.js';

const TOKEN_KEY   = 'geeky_ai_auth_token';
const ACCOUNT_KEY = 'geeky_ai_auth_account';

const AuthContext = createContext({
  account: null,
  token: null,
  ready: false,
  login: async () => ({ ok: false }),
  signup: async () => ({ ok: false }),
  logout: () => {},
});

const loadCached = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || null;
    const accountRaw = localStorage.getItem(ACCOUNT_KEY);
    const account = accountRaw ? JSON.parse(accountRaw) : null;
    return { token, account };
  } catch {
    return { token: null, account: null };
  }
};

export const AuthProvider = ({ children }) => {
  const [{ token, account }, setState] = useState(loadCached);
  // `ready` flips to true once we've finished the optional /me re-validate
  // on mount. While false we render a tiny loading shim so the router doesn't
  // briefly flash the login page over a valid session.
  const [ready, setReady] = useState(false);

  // Re-validate the cached token against the backend on mount — if it's been
  // wiped or expired we boot the user back to login automatically.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const res = await axios.get(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.data?.ok) {
          // Refresh the cached account so any backend-side edits propagate.
          const acc = res.data.account;
          localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
          setState((prev) => ({ ...prev, account: acc }));
        }
      } catch {
        // 401 → token is no longer valid; clear it.
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ACCOUNT_KEY);
          setState({ token: null, account: null });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only once at mount

  const persist = useCallback((newToken, newAccount) => {
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(newAccount));
    } catch {}
    setState({ token: newToken, account: newAccount });
  }, []);

  // Map raw axios errors to actionable messages. A 404 specifically means
  // the backend is running an older build that doesn't have /api/auth yet —
  // a generic "Request failed with status code 404" is useless to the user,
  // so we surface the actual fix.
  const describeError = (e, fallback) => {
    if (e.response) {
      const status = e.response.status;
      const body = e.response.data || {};
      if (status === 404) {
        return 'Backend is missing the /api/auth routes — restart it (stop python main.py, run it again) so the new endpoints register.';
      }
      if (status === 401) return body.message || 'Incorrect credentials.';
      if (status === 400) return body.message || 'Some required fields are missing or invalid.';
      if (status >= 500) return `Backend error (${status}): ${body.message || 'see backend logs.'}`;
      return body.message || `Backend returned ${status}.`;
    }
    if (e.request) {
      return `Could not reach the backend at ${API_BASE}. Is "python main.py" running on port 8000?`;
    }
    return e.message || fallback;
  };

  const login = useCallback(async ({ role, identifier, password }) => {
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        role, identifier, password,
      });
      if (res.data?.ok) {
        persist(res.data.token, res.data.account);
        return { ok: true, account: res.data.account };
      }
      return { ok: false, message: res.data?.message || 'Login failed.' };
    } catch (e) {
      return { ok: false, message: describeError(e, 'Login failed.') };
    }
  }, [persist]);

  const signup = useCallback(async (payload) => {
    try {
      const res = await axios.post(`${API_BASE}/api/auth/signup`, payload);
      if (res.data?.ok) {
        persist(res.data.token, res.data.account);
        return { ok: true, account: res.data.account };
      }
      return { ok: false, message: res.data?.message || 'Sign-up failed.' };
    } catch (e) {
      return { ok: false, message: describeError(e, 'Sign-up failed.') };
    }
  }, [persist]);

  const logout = useCallback(() => {
    const t = token;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {}
    setState({ token: null, account: null });
    // Fire-and-forget — the server-side token expiry isn't critical.
    if (t) {
      axios.post(`${API_BASE}/api/auth/logout`, null, {
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ account, token, ready, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// Global axios hook — attach the bearer token to every outbound request so
// downstream pages don't have to think about auth. We install it once at
// module load.
let _interceptorInstalled = false;
export const installAxiosAuth = () => {
  if (_interceptorInstalled) return;
  axios.interceptors.request.use((config) => {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (t && !config.headers?.Authorization) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${t}` };
      }
    } catch {}
    return config;
  });
  _interceptorInstalled = true;
};
installAxiosAuth();
