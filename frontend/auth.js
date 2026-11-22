(() => {
  const api = window.GM_API_URL || `https://api.${location.host}`;
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const copy = {
    en: { logout: 'Log out', workspace: 'Workspace', account: 'Signed in as', load: 'Workspace details could not be loaded.', updated: 'Workspace name updated.', failed: 'Could not update workspace name.' },
    es: { logout: 'Cerrar sesión', workspace: 'Espacio de trabajo', account: 'Sesión iniciada como', load: 'No se pudieron cargar los datos del espacio.', updated: 'Nombre del espacio actualizado.', failed: 'No se pudo actualizar el nombre del espacio.' }
  };
  async function request(path, options = {}) {
    return fetch(api + path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  }
  async function boot() {
    let response = await request('/auth/me');
    if (!response.ok) {
      await request('/auth/refresh', { method: 'POST' });
      response = await request('/auth/me');
    }
    if (!response.ok) {
      const next = location.pathname + location.search;
      location.replace('/login/?next=' + encodeURIComponent(next));
      return;
    }
    const identity = await response.json();
    window.GMAuth = {
      identity,
      api,
      key: (name) => `goodmarketing:${identity.organization_id}:${identity.user_id}:${name}`,
      request
    };
    document.documentElement.classList.remove('auth-pending');
    document.documentElement.classList.add('auth-ready');
    renderAccount(identity);
    const workspace = await request('/workspace');
    if (!workspace.ok) return;
    const profile = await workspace.json();
    document.querySelectorAll('[data-workspace-name]').forEach((node) => node.textContent = profile.display_name);
    document.querySelectorAll('[data-account-name]').forEach((node) => node.textContent = identity.name || identity.email);
    const title = document.querySelector('[data-workspace-name-input]');
    if (title) title.value = profile.display_name;
    document.dispatchEvent(new CustomEvent('goodmarketing:account-ready', { detail: { identity, workspace: profile } }));
  }
  function renderAccount(identity) {
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const box = document.createElement('div');
    box.className = 'account-chip';
    box.innerHTML = `<span><strong data-account-name></strong><small data-workspace-name></small></span><button type="button" data-auth-logout>${copy[lang()].logout}</button>`;
    actions.append(box);
    box.querySelector('[data-account-name]').textContent = identity.name || identity.email;
    box.querySelector('[data-auth-logout]').addEventListener('click', async () => {
      await request('/auth/logout', { method: 'POST' });
      location.replace('/login/');
    });
    const form = document.querySelector('[data-workspace-name-form]');
    if (form && !identity.permissions.includes('workspace:name:update')) form.hidden = true;
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const notice = form.querySelector('[role=status]');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const result = await request('/workspace', { method: 'PUT', body: JSON.stringify({ display_name: form.querySelector('[data-workspace-name-input]').value }) });
        if (!result.ok) throw new Error();
        const data = await result.json();
        document.querySelectorAll('[data-workspace-name]').forEach((node) => node.textContent = data.display_name);
        notice.textContent = copy[lang()].updated;
      } catch { notice.textContent = copy[lang()].failed; }
      button.disabled = false;
    });
  }
  window.GMAuth = { api, request, ready: boot() };
})();
