(() => {
  const api = `https://api.${location.host}`;
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  history.replaceState(null, '', location.pathname);
  const form = document.querySelector('#activate-form');
  const notice = document.querySelector('#notice');
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const message = { en: 'This invitation is invalid, expired, or has already been used.', es: 'Esta invitación no es válida, venció o ya se utilizó.' };
  if (!token) notice.textContent = message[lang()];
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!token) return;
    const button = form.querySelector('button'); button.disabled = true;
    const data = new FormData(form);
    try {
      const response = await fetch(api + '/auth/activate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email: data.get('email'), name: data.get('name'), password: data.get('password') }) });
      if (!response.ok) throw new Error();
      location.replace('/workspace/');
    } catch { notice.textContent = message[lang()]; button.disabled = false; }
  });
})();
