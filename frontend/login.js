(() => {
  const api = `https://api.${location.host}`;
  const form = document.querySelector('#login-form');
  const notice = document.querySelector('#notice');
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const message = { en: 'Sign-in failed. Check your email and password.', es: 'No se pudo iniciar sesión. Revisa tu correo y contraseña.' };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button'); button.disabled = true; notice.textContent = '';
    const data = new FormData(form);
    try {
      const response = await fetch(api + '/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      if (!response.ok) throw new Error();
      const next = new URLSearchParams(location.search).get('next') || '/workspace/';
      location.replace(next.startsWith('/workspace/') && !next.startsWith('//') ? next : '/workspace/');
    } catch { notice.textContent = message[lang()]; button.disabled = false; }
  });
})();
