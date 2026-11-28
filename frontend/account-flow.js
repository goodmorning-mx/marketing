(() => {
  const api = window.GM_API_URL || `https://api.${location.host}`;
  const preferredLanguage = new URLSearchParams(location.search).get('lang');
  if (preferredLanguage === 'en' || preferredLanguage === 'es') {
    document.querySelector(`[data-language="${preferredLanguage}"]`)?.click();
  }
  const lang = () => document.documentElement.lang === 'es' ? 'es' : 'en';
  const messages = {
    en: {
      sending: 'Sending…', accepted: 'If this address is eligible, check your inbox. If nothing arrives, submit your email again.',
      retry: 'We could not complete that request right now. Please try again.',
      validation: 'Check the information and try again.',
      enrollment: 'We could not create that DEV account. Check the details or try again.',
      enrollmentSending: 'Creating your DEV workspace…',
      enrollmentConflict: 'This invitation is used or the account already exists. Contact GoodMarketing before proceeding.',
      invalid: 'This link is invalid, expired, or already used. Request a new link to continue.',
    },
    es: {
      sending: 'Enviando…', accepted: 'Si esta dirección cumple los requisitos, revisa tu bandeja de entrada. Si no llega el mensaje, vuelve a enviar tu correo.',
      retry: 'No pudimos completar la solicitud ahora. Inténtalo de nuevo.',
      validation: 'Revisa la información e inténtalo de nuevo.',
      enrollment: 'No pudimos crear la cuenta DEV. Revisa los datos o inténtalo de nuevo.',
      enrollmentSending: 'Creando tu espacio DEV…',
      enrollmentConflict: 'Esta invitación ya se usó o la cuenta ya existe. Comunícate con GoodMarketing antes de continuar.',
      invalid: 'Este enlace no es válido, venció o ya se utilizó. Solicita un enlace nuevo para continuar.',
    }
  };
  const tokenFromFragment = () => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
    history.replaceState(null, '', location.pathname + location.search);
    return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : '';
  };
  const post = (path, body) => fetch(api + path, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const noticeFor = () => document.querySelector('#notice');
  const setError = (notice, text) => { notice.textContent = text; notice.style.color = '#ffb8b8'; };
  const setStatus = (notice, text) => { notice.textContent = text; notice.style.color = ''; };
  const setBusy = (form, busy) => { form.querySelector('button[type="submit"]').disabled = busy; };
  const register = document.querySelector('#register-form');
  if (register) register.addEventListener('submit', async (event) => {
    event.preventDefault();
    const notice = noticeFor(), button = register.querySelector('button');
    const email = register.elements.email.value.trim();
    if (email.length > 254) { register.elements.email.setCustomValidity(lang() === 'es' ? 'Usa un correo de hasta 254 caracteres.' : 'Use an email address up to 254 characters.'); register.elements.email.reportValidity(); return; }
    register.elements.email.setCustomValidity(''); setBusy(register, true); setStatus(notice, messages[lang()].sending);
    try {
      const response = await post('/auth/registration/request', { email, locale: lang() });
      if (response.status === 202) { setStatus(notice, messages[lang()].accepted); register.reset(); }
      else if (response.status === 422) setError(notice, messages[lang()].validation);
      else setError(notice, messages[lang()].retry);
    } catch { setError(notice, messages[lang()].retry); }
    finally { button.disabled = false; }
  });

  const devSection = document.querySelector('#dev-enrollment-section');
  const devForm = document.querySelector('#dev-enrollment-form');
  if (devSection && devForm) {
    const fieldset = devForm.querySelector('fieldset');
    const notice = document.querySelector('#dev-enrollment-notice');
    devForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(devForm).entries());
      values.email = String(values.email || '').trim();
      values.name = String(values.name || '').trim();
      values.workspace_name = String(values.workspace_name || '').trim();
      values.credential = String(values.credential || '');
      values.password = String(values.password || '');
      const button = devForm.querySelector('button[type="submit"]');
      if (!values.email || !values.credential || !values.name || !values.workspace_name
          || values.email.length > 254 || values.name.length > 100 || values.workspace_name.length > 100
          || !/^[A-Za-z0-9_-]{32,256}$/.test(values.credential)
          || values.password.length < 8 || values.password.length > 128) {
        setError(notice, messages[lang()].validation); return;
      }
      button.disabled = true; setStatus(notice, messages[lang()].enrollmentSending);
      try {
        const response = await fetch('/auth/dev-enrollment', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
        });
        if (response.status === 201) { devForm.reset(); location.replace('/login/?registered=1'); }
        else if (response.status === 409) {
          fieldset.disabled = true;
          setError(notice, messages[lang()].enrollmentConflict);
        } else setError(notice, response.status === 422 ? messages[lang()].validation : messages[lang()].enrollment);
      } catch { setError(notice, messages[lang()].enrollment); }
      if (fieldset.disabled) button.disabled = true;
      else button.disabled = false;
    });
    (async () => {
      try {
        const response = await fetch('/auth/dev-enrollment', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok || (await response.json()).available !== true) return;
        devSection.hidden = false;
        devForm.hidden = false;
        fieldset.disabled = false;
      } catch { /* The form stays hidden and disabled unless the same-origin API confirms availability. */ }
    })();
  }

  const verify = document.querySelector('#verify-form');
  if (verify) {
    const token = tokenFromFragment(), notice = noticeFor(), recovery = document.querySelector('#recovery');
    if (!token) { setError(notice, messages[lang()].invalid); verify.hidden = true; recovery.hidden = false; }
    verify.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!token) return;
      const button = verify.querySelector('button'); setBusy(verify, true); setStatus(notice, messages[lang()].sending);
      const name = verify.elements.name.value.trim(), workspace_name = verify.elements.workspace_name.value.trim();
      if (!name || name.length > 100 || !workspace_name || workspace_name.length > 100) { setError(notice, lang() === 'es' ? 'El nombre y el espacio deben tener entre 1 y 100 caracteres.' : 'Name and workspace must each be 1 to 100 characters.'); button.disabled = false; return; }
      try {
        const response = await post('/auth/registration/verify', { token, name, workspace_name, password: verify.elements.password.value });
        if (response.status === 204) location.replace('/login/?registered=1');
        else if (response.status === 400) { setError(notice, messages[lang()].invalid); verify.hidden = true; recovery.hidden = false; }
        else if (response.status === 422) setError(notice, messages[lang()].validation);
        else setError(notice, messages[lang()].retry);
      } catch { setError(notice, messages[lang()].retry); }
      button.disabled = false;
    });
  }

  const forgot = document.querySelector('#forgot-form');
  if (forgot) forgot.addEventListener('submit', async (event) => {
    event.preventDefault(); const notice = noticeFor(), button = forgot.querySelector('button');
    const email = forgot.elements.email.value.trim();
    if (email.length > 254) { forgot.elements.email.setCustomValidity(lang() === 'es' ? 'Usa un correo de hasta 254 caracteres.' : 'Use an email address up to 254 characters.'); forgot.elements.email.reportValidity(); return; }
    forgot.elements.email.setCustomValidity(''); setBusy(forgot, true); setStatus(notice, messages[lang()].sending);
    try {
      const response = await post('/auth/session/password-reset/request', { email, locale: lang() });
      if (response.status === 202) { setStatus(notice, messages[lang()].accepted); forgot.reset(); }
      else if (response.status === 422) setError(notice, messages[lang()].validation);
      else setError(notice, messages[lang()].retry);
    } catch { setError(notice, messages[lang()].retry); }
    button.disabled = false;
  });

  const reset = document.querySelector('#reset-form');
  if (reset) {
    const token = tokenFromFragment(), notice = noticeFor(), recovery = document.querySelector('#recovery');
    if (!token) { setError(notice, messages[lang()].invalid); reset.hidden = true; recovery.hidden = false; }
    reset.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!token) return;
      const button = reset.querySelector('button'); setBusy(reset, true); setStatus(notice, messages[lang()].sending);
      try {
        const response = await post('/auth/session/password-reset/confirm', { token, password: reset.elements.password.value });
        if (response.status === 204) location.replace('/login/?reset=1');
        else if (response.status === 400) { setError(notice, messages[lang()].invalid); reset.hidden = true; recovery.hidden = false; }
        else if (response.status === 422) setError(notice, messages[lang()].validation);
        else setError(notice, messages[lang()].retry);
      } catch { setError(notice, messages[lang()].retry); }
      button.disabled = false;
    });
  }
})();
