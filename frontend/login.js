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
  };
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
      const response = await fetch(api + '/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...credentials, ...(chosen ? { organization_id: chosen } : {}) }) });
      if (!response.ok) throw new Error();
      const next = new URLSearchParams(location.search).get('next') || '/workspace/';
      location.replace(next.startsWith('/workspace/') && !next.startsWith('//') ? next : '/workspace/');
    } catch { notice.textContent = messages.failed[lang()]; button.disabled = false; }
  });
})();
