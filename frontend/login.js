(() => {
  const api = window.GM_API_URL || `https://api.${location.host}`;
  const form = document.querySelector('#login-form');
  const notice = document.querySelector('#notice');
  const workspaceChoice = document.querySelector('#workspace-choice');
  const workspaceSelect = form.elements.organization_id;
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const messages = {
    failed: { en: 'Sign-in failed. Check your email and password.', es: 'No se pudo iniciar sesión. Revisa tu correo y contraseña.' },
    choose: { en: 'Choose a workspace, then log in again.', es: 'Elige un espacio de trabajo y vuelve a iniciar sesión.' },
    refreshed: { en: 'Your session is active. Continue to your workspace.', es: 'Tu sesión está activa. Continúa a tu espacio de trabajo.' },
    registered: { en: 'Your account is ready. Sign in to continue.', es: 'Tu cuenta está lista. Inicia sesión para continuar.' },
    reset: { en: 'Your password was updated. Sign in with your new password.', es: 'Tu contraseña se actualizó. Inicia sesión con tu nueva contraseña.' },
  };
  function safeWorkspaceNext(value) {
    if (!value || !value.startsWith('/workspace/') || value.startsWith('//') || value.includes('\\')) return null;
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin || url.hash || !/^\/workspace\/[A-Za-z0-9._~/-]*$/.test(url.pathname)) return null;
      return url.pathname + url.search;
    } catch { return null; }
  }
  const query = new URLSearchParams(location.search);
  const success = document.querySelector('#auth-success');
  if (query.has('registered')) success.textContent = messages.registered[lang()];
  else if (query.has('reset')) success.textContent = messages.reset[lang()];
  success.hidden = !success.textContent;
  const next = safeWorkspaceNext(query.get('next'));
  if (next) {
    fetch(api + '/auth/session/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then((response) => {
        if (response.ok) {
          notice.textContent = messages.refreshed[lang()];
          location.replace(next);
        }
      }).catch(() => {});
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button'); button.disabled = true; notice.textContent = '';
    const data = new FormData(form);
    const credentials = { email: data.get('email'), password: data.get('password') };
    try {
      const listResponse = await fetch(api + '/auth/workspaces', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      if (!listResponse.ok) throw new Error();
      const { workspaces } = await listResponse.json();
      if (workspaces.length > 1 && !workspaceChoice.hidden && !data.get('organization_id')) throw new Error();
      if (workspaces.length > 1 && workspaceChoice.hidden) {
        workspaceSelect.replaceChildren(...workspaces.map((workspace) => {
          const option = document.createElement('option'); option.value = workspace.organization_id; option.textContent = workspace.name; return option;
        }));
        workspaceChoice.hidden = false;
        notice.textContent = messages.choose[lang()];
        button.disabled = false;
        return;
      }
      const chosen = data.get('organization_id');
      if (chosen && !workspaces.some((workspace) => workspace.organization_id === chosen)) throw new Error();
      const response = await fetch(api + '/auth/session/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, ...(chosen ? { organization_id: chosen } : {}) }) });
      if (!response.ok) throw new Error();
      location.replace(next || '/workspace/');
    } catch { notice.textContent = messages.failed[lang()]; button.disabled = false; }
  });
})();
