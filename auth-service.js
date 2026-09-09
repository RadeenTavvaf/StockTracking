/*
 * Local prototype identity service.
 *
 * Guest mode intentionally does not persist alerts, added symbols, or
 * notification preferences. Login/signup currently use browser storage only;
 * production authentication must move password verification to the backend.
 */
const StockAuth = (() => {
  const usersKey = 'stocktracking-local-users';
  const sessionKey = 'stocktracking-session';
  const guest = { mode: 'guest', label: 'Guest' };

  function current() {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey) || 'null') || guest;
    } catch (error) {
      return guest;
    }
  }

  function users() {
    try {
      return JSON.parse(localStorage.getItem(usersKey) || '[]');
    } catch (error) {
      return [];
    }
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('stockauthchange', { detail: current() }));
  }

  return {
    current,
    isGuest() { return current().mode === 'guest'; },
    canTrack() { return !this.isGuest(); },
    storageKey(name) { return `stocktracking:${current().label}:${name}`; },
    load(name, fallback) {
      if (this.isGuest()) return fallback;
      try { return JSON.parse(localStorage.getItem(this.storageKey(name)) || 'null') || fallback; } catch (error) { return fallback; }
    },
    save(name, value) {
      if (this.isGuest()) return false;
      localStorage.setItem(this.storageKey(name), JSON.stringify(value));
      return true;
    },
    async signUp(username, password) {
      const cleanName = username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(cleanName)) throw new Error('Use 3-32 letters, numbers, dots, dashes, or underscores.');
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const stored = users();
      if (stored.some((user) => user.username === cleanName)) throw new Error('That username already exists.');
      stored.push({ username: cleanName, passwordHash: await digest(password) });
      localStorage.setItem(usersKey, JSON.stringify(stored));
      sessionStorage.setItem(sessionKey, JSON.stringify({ mode: 'user', label: cleanName }));
      notify();
    },
    async login(username, password) {
      const cleanName = username.trim().toLowerCase();
      const match = users().find((user) => user.username === cleanName);
      if (!match || match.passwordHash !== await digest(password)) throw new Error('Username or password is incorrect.');
      sessionStorage.setItem(sessionKey, JSON.stringify({ mode: 'user', label: cleanName }));
      notify();
    },
    logout() {
      sessionStorage.removeItem(sessionKey);
      notify();
    },
    continueAsGuest() {
      sessionStorage.removeItem(sessionKey);
      notify();
    }
  };
})();
