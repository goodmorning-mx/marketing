(() => {
  const api = window.GM_API_URL || `https://api.${location.host}`;
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const copy = {
    en: { logout: 'Log out', workspace: 'Workspace', account: 'Signed in as', load: 'Workspace details could not be loaded.', retry: 'Try again', updated: 'Workspace name updated.', failed: 'Could not update workspace name.', boot: 'Account details could not be loaded. Your access is protected; retry or sign in again.', savedReload: 'Your brief was saved, but the page could not reload it. Retry loading.' },
    es: { logout: 'Cerrar sesión', workspace: 'Espacio de trabajo', account: 'Sesión iniciada como', load: 'No se pudieron cargar los datos del espacio.', retry: 'Intentar de nuevo', updated: 'Nombre del espacio actualizado.', failed: 'No se pudo actualizar el nombre del espacio.', boot: 'No se pudieron cargar los datos de la cuenta. El acceso está protegido; inténtalo de nuevo o inicia sesión.', savedReload: 'El brief se guardó, pero no se pudo volver a cargar. Intenta cargarlo de nuevo.' }
  };
  async function request(path, options = {}) {
    return fetch(api + path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  }
  async function boot() {
    let response;
    try { response = await request('/auth/me'); } catch { return showWorkspaceError(true); }
    if (!response.ok && response.status >= 500) return showWorkspaceError(true);
    if (!response.ok) {
      try { await request('/auth/refresh', { method: 'POST' }); response = await request('/auth/me'); } catch { return showWorkspaceError(true); }
    }
    if (response.status >= 500) return showWorkspaceError(true);
    if (!response.ok) {
      const next = location.pathname + location.search;
      location.replace('/login/?next=' + encodeURIComponent(next));
      return;
    }
    let identity, workspace, profile;
    try { identity = await response.json(); workspace = await request('/workspace'); if (!workspace.ok) return showWorkspaceError(workspace.status >= 500); profile = await workspace.json(); } catch { return showWorkspaceError(true); }
    window.GMAuth = {
      identity,
      api,
      key: (name) => `goodmarketing:${identity.organization_id}:${identity.user_id}:${name}`,
      request
    };
    document.documentElement.classList.remove('auth-pending');
    document.documentElement.classList.add('auth-ready');
    renderAccount(identity);
    document.querySelectorAll('[data-workspace-name]').forEach((node) => node.textContent = profile.display_name);
    document.querySelectorAll('[data-account-name]').forEach((node) => node.textContent = identity.name || identity.email);
    const title = document.querySelector('[data-workspace-name-input]');
    if (title) title.value = profile.display_name;
    document.dispatchEvent(new CustomEvent('goodmarketing:account-ready', { detail: { identity, workspace: profile } }));
  }
  function showWorkspaceError(recoverable = false) {
    const section = document.createElement('main');
    section.setAttribute('role', 'alert');
    section.style.cssText = 'max-width:42rem;margin:12vh auto;padding:2rem;color:#f5f7ff;font:16px/1.5 system-ui,sans-serif';
    const message = document.createElement('p');
    let saved = false;
    try { const state = JSON.parse(sessionStorage.getItem('gm-brief-navigation-status') || 'null'); saved = state?.path === location.pathname; } catch {}
    message.textContent = saved ? copy[lang()].savedReload : (recoverable ? copy[lang()].boot : copy[lang()].load);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = copy[lang()].retry;
    retry.addEventListener('click', () => location.reload());
    const login = document.createElement('a'); login.href = '/login/'; login.textContent = lang() === 'es' ? 'Iniciar sesión' : 'Sign in'; section.append(login);
    section.append(message, retry);
    document.body.replaceChildren(section);
    document.documentElement.classList.remove('auth-pending');
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
