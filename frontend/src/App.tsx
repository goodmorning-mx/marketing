import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type ProviderId = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
type Section = 'overview' | 'connections' | 'requirements' | 'publishing' | 'sources';
type ProviderTab = 'summary' | 'requirements' | 'auth' | 'publishing' | 'operations';

type Link = { label: string; href: string };
type Provider = {
  id: ProviderId;
  name: string;
  subtitle: string;
  short: string;
  color: string;
  accent: string;
  readiness: string;
  api: string;
  login: string;
  scope: string;
  account: string;
  access: string;
  flow: string;
  media: string[];
  constraints: string[];
  checklist: string[];
  operations: string[];
  links: Link[];
};

type ApiHealth = { service: string; status: string; environment: string };
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const providers: Provider[] = [
  {
    id: 'instagram', name: 'Instagram', subtitle: 'Instagram Platform · Meta Graph API', short: 'IG', color: '#c13584', accent: '#fff0f7', readiness: 'Revisión de Meta requerida',
    api: 'Instagram Platform / Graph API. Decide un solo login path por conexión; recomendación inicial: Instagram Login para cuentas profesionales.',
    login: 'Instagram Login con OAuth de Meta; alternativa: Facebook Login si necesitas descubrir la Página vinculada y reutilizar permisos de Pages.',
    scope: 'Instagram Login: instagram_business_basic, instagram_business_content_publish. Solicita manage_comments o manage_messages solo al activar esas funciones. Facebook Login requiere su conjunto pages_* e instagram_* equivalente.',
    account: 'Solo cuentas profesionales Business o Creator. Instagram Login no exige una Página de Facebook enlazada; Facebook Login sí. Los perfiles consumer no son elegibles para publicar por API.',
    access: 'App de Meta en modo adecuado, OAuth redirect URI HTTPS, permisos solicitados en App Review y acceso avanzado para servir usuarios externos. El estado de prueba con roles de app no habilita clientes generales.',
    flow: 'Crear contenedor de medios → esperar a que el medio quede listo → publicar con media_publish. Carruseles componen elementos y se publican como unidad. El orquestador agenda el inicio del flujo.',
    media: ['Feed: imágenes y video según endpoint', 'Reels: carga y estado asíncrono', 'Carrusel: elementos individuales + contenedor', 'Stories: elegibilidad limitada por cuenta y endpoint'],
    constraints: ['Meta debe poder obtener el medio desde una URL accesible durante el procesamiento; usar URL firmada y temporal o el método de carga admitido por endpoint.', 'Validar dimensiones, duración, audio y formatos por placement. Los límites de Reels no se deben aplicar a todos los tipos.', 'Consultar content_publishing_limit cuando aplique y limitar llamadas según headers/uso devueltos por Meta.', 'Fijar explícitamente Graph API v26.0 al corte de esta revisión; vigilar changelog y sunsets.'],
    checklist: ['Crear app Meta y registrar callback seguro', 'Elegir Instagram Login o Facebook Login', 'Solicitar permisos mínimos para publicar', 'Completar App Review / Advanced Access', 'Preparar política, términos y video demo', 'Probar con cuenta profesional de QA'],
    operations: ['Conservar container ID y resultado original de Meta', 'Esperar estado de procesamiento antes de publicar', 'Usar idempotencia en el orquestador para evitar posts duplicados', 'Guardar API version y request ID en logs; nunca registrar tokens'],
    links: [
      { label: 'Instagram Platform: Content Publishing', href: 'https://developers.facebook.com/docs/instagram-platform/content-publishing' },
      { label: 'Instagram API — documentación oficial Meta', href: 'https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api' },
      { label: 'Login y scopes de Instagram', href: 'https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login' },
      { label: 'App Review y permisos', href: 'https://developers.facebook.com/docs/apps/review/' },
      { label: 'Graph API v26.0 y changelog', href: 'https://developers.facebook.com/docs/graph-api/changelog/versions' },
    ],
  },
  {
    id: 'facebook', name: 'Facebook', subtitle: 'Facebook Pages · Meta Graph API', short: 'f', color: '#1877f2', accent: '#eef5ff', readiness: 'Revisión de Meta requerida',
    api: 'Graph API v26.0 en el corte de esta revisión. El recurso publicable es una Página de Facebook; no ofrecer publicación orgánica en perfiles personales.',
    login: 'Facebook Login para obtener consentimiento de una persona y descubrir las Páginas que puede administrar; usar un Page Access Token para operaciones de Página.',
    scope: 'Base de conexión/publicación: pages_show_list y pages_manage_posts. Añade pages_read_engagement solo si se implementa lectura de métricas o engagement.',
    account: 'La persona que autoriza debe tener las tareas/permisos suficientes en la Página. Presenta una selector explícito de Páginas y valida las tareas devueltas antes de habilitar publicar.',
    access: 'Crear Meta App, OAuth redirect HTTPS, revisión y Advanced Access de los permisos necesarios para usuarios fuera de roles de desarrollo. Business verification puede aplicar según el producto/permisos solicitados.',
    flow: 'Listar Páginas autorizadas → guardar token de Página de forma cifrada → crear post, foto o video → consultar el estado remoto. Reels de Página tienen pasos de carga propios; modelar inicio, transferencia y finalización.',
    media: ['Posts de Página: texto y enlaces', 'Fotos y videos de Página', 'Reels mediante flujo de carga por etapas', 'Insights/comentarios como módulos separados'],
    constraints: ['No aceptar credenciales de Facebook ni publicar como persona.', 'Los tokens y permisos dependen de las tareas otorgadas en la Página; no inferir elegibilidad solo por el scope concedido.', 'Paginación y límites pueden variar por endpoint/producto; procesar headers de uso y respetar backoff.', 'Mantener la versión Graph API explícita y una ventana de actualización antes del sunset.'],
    checklist: ['Crear Meta App y configurar Facebook Login', 'Configurar callback HTTPS y dominios permitidos', 'Solicitar pages_show_list y pages_manage_posts', 'Completar App Review / Advanced Access', 'Probar selección de Página y tareas con QA', 'Implementar revocación y reconexión guiada'],
    operations: ['Almacenar Page ID y Page token cifrado por tenant', 'Distinguir aceptado, procesando y publicado', 'Reintentar solo fallos transitorios con backoff', 'Registrar API version, endpoint y request ID sin exponer secretos'],
    links: [
      { label: 'Facebook API — documentación oficial Meta', href: 'https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api' },
      { label: 'Permisos de Graph API', href: 'https://developers.facebook.com/docs/permissions/' },
      { label: 'App Review', href: 'https://developers.facebook.com/docs/apps/review/' },
      { label: 'Graph API changelog y versiones', href: 'https://developers.facebook.com/docs/graph-api/changelog/versions' },
    ],
  },
  {
    id: 'tiktok', name: 'TikTok', subtitle: 'Login Kit · Content Posting API', short: '♪', color: '#171717', accent: '#f3f4f6', readiness: 'Auditoría requerida para publicar público',
    api: 'Login Kit OAuth 2.0 para conectar una persona; Content Posting API para Direct Post o entrega a la bandeja de entrada de TikTok.',
    login: 'OAuth con state anti-CSRF, redirect URI HTTPS, intercambio de code en backend y renovación/revocación segura. PKCE según tipo de cliente. Nunca exponer client_secret.',
    scope: 'user.info.basic para perfil básico; video.publish para Direct Post; video.upload para entregar un borrador que la persona termina dentro de TikTok. Solicitar el scope correcto en revisión.',
    account: 'Una persona autoriza su cuenta. Antes de exportar, llamar creator_info/query y reflejar privacidad y opciones disponibles por esa cuenta; obtener decisión y consentimiento expreso.',
    access: 'Registrar app y productos, publicar términos y política de privacidad, explicar cada scope y demostrar el flujo end-to-end. App no auditada: hasta 5 usuarios publicadores/24 h y solo SELF_ONLY; auditoría requerida para abrir publicación pública.',
    flow: 'Direct Post: consultar creator info → mostrar preview/opciones → consentimiento → iniciar carga → consultar estado/webhook. Upload: enviar a inbox; la persona debe abrir TikTok y completar el post.',
    media: ['Video: FILE_UPLOAD o PULL_FROM_URL con dominio verificado', 'Fotos: PULL_FROM_URL desde dominio verificado; hasta 35 URLs en API vigente', 'Direct Post y draft upload tienen UX y permisos distintos', 'La API añade etiqueta AIGC cuando is_aigc=true'],
    constraints: ['No añadir branding, watermark ni promoción encima de la pieza compartida.', 'No asumir que la aceptación de upload significa publicación: estados y revisión son asíncronos.', 'Token: inicialización limitada a 6 llamadas/min; consultar cuota del endpoint y manejar 429.', 'Los creadores activos y posts diarios tienen caps del proveedor; la auditoría define la capacidad autorizada.', 'Usar contenido creado para el perfil de TikTok y respetar las directrices de UX; no diseñar un replicador indiscriminado de contenido.'],
    checklist: ['Crear app y habilitar Login Kit + Content Posting', 'Registrar callback HTTPS, términos y privacidad públicos', 'Solicitar video.publish o video.upload con justificación', 'Verificar dominio si se usará PULL_FROM_URL', 'Implementar creator_info y pantalla de exportación', 'Grabar demo end-to-end y pasar auditoría'],
    operations: ['Deduplicar webhooks y responder rápido HTTP 200', 'Usar publish_id para consultar estado y registrar fail_reason', 'No reintentar fallos permanentes ni auth_removed', 'Mantener flujo needs_user_action para cargas a inbox'],
    links: [
      { label: 'Content Posting: Direct Post', href: 'https://developers.tiktok.com/docs/en/content-posting-api-get-started' },
      { label: 'Posting API: fotos (actualizada 24 ago 2026)', href: 'https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post' },
      { label: 'Directrices de contenido y UX', href: 'https://developers.tiktok.com/docs/en/content-sharing-guidelines' },
      { label: 'Login Kit: scopes y tokens', href: 'https://developers.tiktok.com/docs/en/scopes-overview' },
      { label: 'App Review', href: 'https://developers.tiktok.com/docs/en/app-review-guidelines' },
      { label: 'Estado y webhooks', href: 'https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status' },
    ],
  },
  {
    id: 'youtube', name: 'YouTube', subtitle: 'YouTube Data API v3 · Google OAuth', short: '▶', color: '#ff0033', accent: '#fff0f2', readiness: 'Auditoría de proyecto requerida',
    api: 'YouTube Data API v3 (REST). La API de subidas opera sobre el canal asociado a la cuenta Google que concedió OAuth.',
    login: 'OAuth 2.0 de servidor con refresh token seguro. No se admiten service accounts para acceder a un canal; no solicitar ni almacenar contraseña de Google.',
    scope: 'Para subir con permisos mínimos: https://www.googleapis.com/auth/youtube.upload. Añadir otros scopes solo si se agregan operaciones adicionales.',
    account: 'Una cuenta Google autoriza el acceso al canal elegido. Mostrar el canal destino, visibilidad y acción antes de ejecutar upload/update/delete.',
    access: 'Crear proyecto Google Cloud, habilitar YouTube Data API v3, configurar OAuth consent screen, dominios, política de privacidad y redirect URI. Preparar verificación OAuth y auditoría de YouTube API Services.',
    flow: 'videos.insert con carga reanudable → guardar URI de sesión → reanudar transferencia cuando haga falta → consultar videos.list y processingDetails → confirmar visibilidad/publicación. status.publishAt agenda un video aún privado y nunca publicado.',
    media: ['Subida estándar de videos; no hay endpoint separado para Shorts', 'Carga reanudable recomendada para medios grandes', 'Metadatos: título, descripción, categoría, tags y privacidad', 'Máximo documentado por videos.insert: 256 GB'],
    constraints: ['Uploads de proyectos API no verificados creados después del 28 jul 2020 quedan privados hasta pasar auditoría.', 'Cuota base documentada: 100 videos.insert/día, 100 search.list/día y 10.000 unidades/día para otras solicitudes.', 'No confundir transferencia completa con procesamiento finalizado.', 'Tras revocar autorización, revocar token y borrar datos autorizados cuanto antes y en un máximo de 7 días; refrescar/eliminar otros datos según política de 30 días.', 'No cambiar privacidad existente sin instrucción explícita de la persona.'],
    checklist: ['Crear proyecto Cloud y habilitar Data API v3', 'Configurar OAuth consent, dominios y callback HTTPS', 'Solicitar scope youtube.upload', 'Preparar política de privacidad y mecanismo de borrado', 'Verificar OAuth y completar API Services audit', 'Implementar subida reanudable y recuperación de sesión'],
    operations: ['Guardar session URI con TTL seguro para reanudar upload', 'Aplicar backoff a 5xx y reiniciar sesión ante errores permanentes', 'Consultar processingStatus con videos.list', 'Borrar datos y tokens en revocación dentro del SLA de política'],
    links: [
      { label: 'OAuth y autenticación YouTube', href: 'https://developers.google.com/youtube/v3/guides/authentication' },
      { label: 'videos.insert: scopes, cuota y auditoría', href: 'https://developers.google.com/youtube/v3/docs/videos/insert' },
      { label: 'Protocolo de carga reanudable', href: 'https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol' },
      { label: 'Cuotas y auditorías', href: 'https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits' },
      { label: 'Políticas de desarrollador', href: 'https://developers.google.com/youtube/terms/developer-policies' },
      { label: 'Shorts: clasificación de hasta 3 min', href: 'https://support.google.com/youtube/answer/15424877?hl=es-419' },
    ],
  },
];

const commonRequirements = [
  { title: 'Identidad y consentimiento', text: 'OAuth en backend, scopes mínimos, state anti-CSRF, consentimiento granular y revocación visible.' },
  { title: 'App pública y revisión', text: 'Dominio funcional, términos y política de privacidad enlazados, callback HTTPS y demo que muestre el caso real.' },
  { title: 'Protección de credenciales', text: 'Cifrar tokens por tenant/cuenta, ocultarlos de logs, rotarlos y purgarlos tras desconexión.' },
  { title: 'Contenido con aprobación', text: 'La persona confirma cuenta, variante, texto, medio, privacidad y momento antes de publicar.' },
  { title: 'Operación asíncrona', text: 'Cola, idempotencia, carga reanudable, webhooks/status polling y reintentos solo ante errores transitorios.' },
  { title: 'Datos y trazabilidad', text: 'Guardar IDs y estados remotos, límites, versión API y consentimiento; respetar retención/borrado de cada proveedor.' },
];

const sectionLabels: Record<Section, string> = {
  overview: 'Resumen', connections: 'Conexiones', requirements: 'Requisitos', publishing: 'Publicación', sources: 'Fuentes oficiales',
};
const tabLabels: Record<ProviderTab, string> = {
  summary: 'Resumen', requirements: 'Requisitos', auth: 'Acceso y OAuth', publishing: 'Publicación', operations: 'Operación',
};

function Mark({ provider, small = false }: { provider: Provider; small?: boolean }) {
  return <span className={`provider-mark provider-mark--${provider.id}${small ? ' provider-mark--small' : ''}`} style={{ '--brand': provider.color, '--brand-tint': provider.accent } as CSSProperties}>{provider.short}</span>;
}

function App() {
  const [section, setSection] = useState<Section>('overview');
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [providerTab, setProviderTab] = useState<ProviderTab>('summary');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [apiHealth, setApiHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const provider = providers.find((item) => item.id === selected) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API health check failed');
        return response.json() as Promise<ApiHealth>;
      })
      .then((health) => setApiHealth(health.status === 'ok' ? 'online' : 'offline'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setApiHealth('offline');
      });
    return () => controller.abort();
  }, []);

  function openProvider(id: ProviderId) {
    setSelected(id);
    setProviderTab('summary');
    setSection('overview');
    setMobileMenu(false);
  }

  function navigate(next: Section) {
    setSection(next);
    setSelected(null);
    setMobileMenu(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileMenu ? ' sidebar--open' : ''}`}>
        <div className="brand-lockup"><div className="brand-symbol">gm</div><div><strong>goodmorning</strong><span>AI INTEGRATOR</span></div></div>
        <div className="workspace-switch"><span className="workspace-avatar">MC</span><div><span>Workspace</span><strong>Micro Campaña</strong></div><span className="chevron">⌄</span></div>
        <p className="nav-caption">PRODUCTO</p>
        <nav className="main-nav" aria-label="Navegación principal">
          {(Object.keys(sectionLabels) as Section[]).map((item) => (
            <button key={item} className={`nav-item${section === item && !selected ? ' nav-item--active' : ''}`} onClick={() => navigate(item)}>
              <span className="nav-icon" aria-hidden="true">{item === 'overview' ? '⌂' : item === 'connections' ? '⌁' : item === 'requirements' ? '◫' : item === 'publishing' ? '◷' : '↗'}</span>{sectionLabels[item]}
              {item === 'connections' && <span className="nav-count">0</span>}
            </button>
          ))}
        </nav>
        <p className="nav-caption nav-caption--platforms">PLATAFORMAS</p>
        <nav className="platform-nav" aria-label="Adaptadores de plataforma">
          {providers.map((item) => <button key={item.id} className={`platform-nav-item${selected === item.id ? ' platform-nav-item--active' : ''}`} onClick={() => openProvider(item.id)}><Mark provider={item} small /><span>{item.name}</span><i className="connection-dot" title="Aún no configurado" /></button>)}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>¿Preparando una integración?</strong><span>Revisa primero requisitos y acceso de la plataforma.</span><button onClick={() => navigate('sources')}>Abrir documentación <span>↗</span></button></div><div className="user-row"><span className="user-avatar">GM</span><div><strong>GoodMorning</strong><span>Administrador</span></div><button aria-label="Abrir menú de usuario">···</button></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir navegación">☰</button>
          <div className="breadcrumbs"><span>AI Integrator</span><b>/</b><strong>{provider?.name ?? sectionLabels[section]}</strong>{provider && <><b>/</b><span>{tabLabels[providerTab]}</span></>}</div>
          <div className="topbar-actions"><span className={`api-indicator api-indicator--${apiHealth}`}><i />API {apiHealth === 'online' ? 'disponible' : apiHealth === 'offline' ? 'sin conexión' : 'comprobando'}</span><span className="research-date"><i /> Documentación revisada · 12 sep 2026</span><button className="avatar-button" aria-label="Perfil">GM</button></div>
        </header>

        <div className="content-wrap">
          {provider ? <ProviderDetail provider={provider} tab={providerTab} setTab={setProviderTab} back={() => setSelected(null)} /> : <>
            {section === 'overview' && <Overview openProvider={openProvider} navigate={navigate} />}
            {section === 'connections' && <Connections openProvider={openProvider} />}
            {section === 'requirements' && <Requirements openProvider={openProvider} />}
            {section === 'publishing' && <Publishing openProvider={openProvider} />}
            {section === 'sources' && <Sources openProvider={openProvider} />}
          </>}
          <footer className="page-footer"><span>GoodMorning · AI Integrator</span><span>Los requisitos y límites pueden cambiar; consulta siempre la documentación oficial.</span></footer>
        </div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}

function Overview({ openProvider, navigate }: { openProvider: (id: ProviderId) => void; navigate: (section: Section) => void }) {
  return <>
    <PageHeading eyebrow="ADAPTERS / OVERVIEW" title="Social publishing" description="Una sola vista para entender qué pide cada plataforma antes de conectar una cuenta o publicar una campaña." action={<button className="button button--primary" onClick={() => navigate('requirements')}><span>⌕</span> Ver requisitos</button>} />
    <div className="metric-strip"><div className="metric-item"><span className="metric-label">Adaptadores</span><strong>04</strong><small>Plataformas principales</small></div><div className="metric-item"><span className="metric-label">Conexiones activas</span><strong>00 <i className="metric-neutral">/ 4</i></strong><small>Integraciones por configurar</small></div><div className="metric-item"><span className="metric-label">Estado de publicación</span><strong className="metric-status"><i /> Preparación</strong><small>Sin credenciales conectadas</small></div><div className="metric-item"><span className="metric-label">Siguiente hito</span><strong className="metric-next">App reviews</strong><small>Acceso externo de producción</small></div></div>
    <div className="section-title-row"><div><h2>Elige una plataforma</h2><p>Abre el adaptador para revisar configuración, scopes y flujo editorial.</p></div><span className="quiet-label">4 ADAPTADORES</span></div>
    <div className="platform-grid">{providers.map((item, index) => <button key={item.id} className="platform-card" onClick={() => openProvider(item.id)}><div className="card-top"><Mark provider={item} /><span className="card-number">0{index + 1}</span></div><div className="card-copy"><span className="card-subtitle">{item.subtitle}</span><h3>{item.name}</h3><p>{item.api.split('.')[0]}.</p></div><div className="card-status"><i className="connection-dot" /><span>Pendiente de configuración</span><span className="arrow">↗</span></div></button>)}</div>
    <div className="lower-grid"><section className="panel readiness-panel"><div className="panel-heading"><div><span className="panel-kicker">READINESS</span><h2>Antes de salir a producción</h2></div><span className="pill pill--amber">4 requisitos externos</span></div><div className="readiness-list">{[
      ['Meta', 'App Review y Advanced Access', 'instagram'], ['TikTok', 'Auditoría para publicación pública', 'tiktok'], ['YouTube', 'OAuth verification y API audit', 'youtube'], ['Común', 'Privacidad, consentimiento y borrado', 'facebook'],
    ].map(([name, text, id]) => <div className="readiness-row" key={name}><span className="readiness-check">○</span><div><strong>{name}</strong><span>{text}</span></div><button onClick={() => id === 'facebook' ? navigate('requirements') : openProvider(id as ProviderId)} aria-label={`Revisar ${name}`}>↗</button></div>)}</div><button className="text-link" onClick={() => navigate('requirements')}>Ver checklist completo <span>→</span></button></section>
    <section className="panel architecture-panel"><div className="panel-heading"><div><span className="panel-kicker">AI INTEGRATOR</span><h2>Un contrato, cuatro adaptadores</h2></div><span className="architecture-mark">✳</span></div><p>El integrador normaliza conexiones y estados, pero conserva las reglas específicas de cada red para que la automatización sea segura.</p><div className="flow-steps"><span>Campaign</span><b>→</b><span>Adapter</span><b>→</b><span>Publish job</span></div><button className="text-link" onClick={() => navigate('publishing')}>Explorar flujo <span>→</span></button></section></div>
  </>;
}

function Connections({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  return <><PageHeading eyebrow="ACCOUNTS / CONNECTIONS" title="Cuentas conectadas" description="Conecta y administra identidades autorizadas por sus titulares. En este entorno aún no se han configurado credenciales de plataforma." action={<span className="pill pill--slate">0 conexiones activas</span>} /><div className="notice notice--blue"><span>i</span><p>Las conexiones OAuth todavía no están habilitadas. Primero hay que crear las apps de desarrollador, registrar callbacks y completar las revisiones externas que correspondan.</p></div><div className="connection-list">{providers.map((item) => <div className="connection-row" key={item.id}><Mark provider={item} small /><div className="connection-name"><strong>{item.name}</strong><span>{item.subtitle}</span></div><span className="pill pill--slate">No conectada</span><span className="connection-requirement">{item.readiness}</span><button className="button button--subtle" onClick={() => openProvider(item.id)}>Ver requisitos <span>→</span></button></div>)}</div><div className="empty-state"><div className="empty-icon">⌁</div><strong>Las cuentas aparecerán aquí después del consentimiento OAuth</strong><span>Una conexión representa una cuenta autorizada por su titular, no una credencial compartida.</span></div></>;
}

function Requirements({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  return <><PageHeading eyebrow="DEVELOPER SETUP / CHECKLIST" title="Requisitos de integración" description="Las credenciales son solo una parte. Cada red exige elegibilidad, scopes, revisión de app y condiciones distintas para el uso externo." /><div className="requirements-layout"><div className="requirements-main"><div className="panel common-panel"><div className="panel-heading"><div><span className="panel-kicker">TODAS LAS PLATAFORMAS</span><h2>Base común para el adaptador</h2></div><span className="step-total">6 controles</span></div><div className="common-grid">{commonRequirements.map((item, i) => <div className="common-card" key={item.title}><span>0{i + 1}</span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}</div></div><div className="platform-requirement-table"><div className="table-head"><span>PLATAFORMA</span><span>CUENTA Y ACCESO</span><span>HITO DE PRODUCCIÓN</span><span /></div>{providers.map((item) => <button className="requirement-table-row" key={item.id} onClick={() => openProvider(item.id)}><span className="table-platform"><Mark provider={item} small /><strong>{item.name}</strong></span><span>{item.account}</span><span>{item.readiness}</span><b>↗</b></button>)}</div></div><aside className="panel checklist-aside"><span className="panel-kicker">APP CHECKLIST</span><h2>Qué preparar para revisión</h2><p>Diseña el producto para pasar revisiones sin improvisar permisos ni comportamiento.</p>{['Dominio de producción y callback HTTPS', 'Política de privacidad y términos públicos', 'Descripción por scope y caso de uso real', 'Demo end-to-end con consentimiento', 'Flujo de desconexión y borrado de datos'].map((x, i) => <div className="checklist-item" key={x}><span>{i + 1}</span>{x}</div>)}<div className="aside-tip"><strong>Scopes mínimos</strong><span>Pide acceso adicional solo cuando la persona active esa función.</span></div></aside></div></>;
}

function Publishing({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  return <><PageHeading eyebrow="CAMPAIGN CORE / PUBLISH FLOW" title="Un flujo editorial con aprobación" description="La campaña es común; la variante, validación, transferencia y estado final se resuelven dentro de cada adaptador." /><div className="publish-flow">{[
    ['01', 'Idea y brief', 'Objetivo, audiencia, tono, fecha y material original.'], ['02', 'Variantes por red', 'El AI Integrator adapta formato, copy, CTA y placement.'], ['03', 'Validación', 'El adaptador comprueba cuenta, permisos, medio y opciones reales.'], ['04', 'Aprobación', 'La persona confirma cuenta destino, texto, privacidad y momento.'], ['05', 'Publicación', 'Cola idempotente, carga asíncrona, webhooks y estado verificable.'],
  ].map(([num, title, text], index) => <div className="flow-card" key={num}><span className="flow-num">{num}</span><div><h2>{title}</h2><p>{text}</p></div>{index < 4 && <span className="flow-link">→</span>}</div>)}</div><div className="panel capability-panel"><div className="panel-heading"><div><span className="panel-kicker">DIFERENCIAS DE PUBLICACIÓN</span><h2>El adaptador conserva las reglas de cada red</h2></div></div><div className="capability-grid">{providers.map((item) => <button key={item.id} className="capability-card" onClick={() => openProvider(item.id)}><div><Mark provider={item} small /><strong>{item.name}</strong></div><p>{item.flow}</p><span className="text-link">Ver capacidades →</span></button>)}</div></div></>;
}

function Sources({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  return <><PageHeading eyebrow="REFERENCE / OFFICIAL DOCS" title="Fuentes oficiales" description="Requisitos revisados al 12 de septiembre de 2026. Los enlaces van a documentación, referencias API y políticas de los proveedores." /><div className="source-platforms">{providers.map((item) => <section className="panel source-panel" key={item.id}><div className="source-heading"><Mark provider={item} small /><div><h2>{item.name}</h2><span>{item.subtitle}</span></div><button className="text-link" onClick={() => openProvider(item.id)}>Ver ficha →</button></div><div className="source-links">{item.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.label}</span><b>↗</b></a>)}</div></section>)}</div></>;
}

function ProviderDetail({ provider, tab, setTab, back }: { provider: Provider; tab: ProviderTab; setTab: (tab: ProviderTab) => void; back: () => void }) {
  return <>
    <button className="back-link" onClick={back}>← Todas las plataformas</button>
    <div className="provider-hero"><div className="provider-title"><Mark provider={provider} /><div><p className="eyebrow">PLATFORM ADAPTER</p><h1>{provider.name}</h1><span>{provider.subtitle}</span></div></div><div className="provider-hero-status"><span className="connection-dot" /><span>Pendiente de configuración</span><small>{provider.readiness}</small></div></div>
    <div className="provider-tabs" role="tablist" aria-label={`Secciones de ${provider.name}`}>{(Object.keys(tabLabels) as ProviderTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'provider-tab provider-tab--active' : 'provider-tab'} onClick={() => setTab(item)}>{tabLabels[item]}</button>)}</div>
    {tab === 'summary' && <div className="detail-grid"><section className="panel detail-main"><span className="panel-kicker">ADAPTER SNAPSHOT</span><h2>Qué conecta este adaptador</h2><p className="detail-lede">{provider.api}</p><div className="detail-facts"><div><span>Identidad</span><strong>{provider.account}</strong></div><div><span>Autorización</span><strong>{provider.login}</strong></div><div><span>Publicación</span><strong>{provider.flow}</strong></div></div><button className="button button--primary" onClick={() => setTab('requirements')}>Preparar integración <span>→</span></button></section><aside className="panel status-panel"><span className="panel-kicker">READINESS</span><div className="readiness-score"><strong>0</strong><span>/ {provider.checklist.length}</span></div><p>pasos de habilitación completados</p><div className="progress-track"><span /></div><h3>Bloqueadores externos</h3><span className="pill pill--amber">{provider.readiness}</span><small>Sin estado de conexión inventado: este dashboard aún no almacena cuentas OAuth.</small></aside><section className="panel media-panel"><div className="panel-heading"><div><span className="panel-kicker">CONTENT TYPES</span><h2>Medios y formatos</h2></div></div><div className="media-list">{provider.media.map((m) => <div key={m}><span>✓</span>{m}</div>)}</div></section><section className="panel quick-links"><div className="panel-heading"><div><span className="panel-kicker">OFFICIAL DOCS</span><h2>Fuentes principales</h2></div><span className="link-count">{provider.links.length}</span></div>{provider.links.slice(0, 3).map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<span>↗</span></a>)}</section></div>}
    {tab === 'requirements' && <div className="requirements-detail"><section className="panel checklist-panel"><div className="panel-heading"><div><span className="panel-kicker">PRE-LAUNCH CHECKLIST</span><h2>Requisitos para habilitar el adaptador</h2></div><span className="pill pill--slate">{provider.checklist.length} pasos</span></div>{provider.checklist.map((item, i) => <div className="large-checklist-row" key={item}><span className="unchecked">○</span><div><strong>{item}</strong><span>{i === 0 ? 'Requisito del proveedor' : i === provider.checklist.length - 1 ? 'Verificación antes de producción' : 'Completar antes de abrir acceso externo'}</span></div><span className="step-index">{String(i + 1).padStart(2, '0')}</span></div>)}</section><aside className="panel scope-panel"><span className="panel-kicker">SCOPES / ELIGIBILITY</span><h2>Acceso necesario</h2><p>{provider.scope}</p><h3>Quién puede conectar</h3><p>{provider.account}</p><div className="notice notice--amber"><span>!</span><p>La aprobación del proveedor no se simula en la UI. Usa este checklist para preparar solicitudes reales.</p></div></aside></div>}
    {tab === 'auth' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">AUTHORIZATION</span><h2>Conexión y credenciales</h2><div className="detail-lede">{provider.login}</div><h3>Scopes a considerar</h3><code className="scope-code">{provider.scope}</code><div className="notice notice--blue"><span>i</span><p>El usuario final autoriza la app con el proveedor. No pedir claves ni guardar credenciales de la cuenta.</p></div></section><section className="panel"><span className="panel-kicker">PLATFORM ACCESS</span><h2>Revisión y producción</h2><p className="detail-lede">{provider.access}</p><div className="access-points"><div><span>01</span><strong>App configurada</strong></div><div><span>02</span><strong>Scopes explicados</strong></div><div><span>03</span><strong>Demo + políticas públicas</strong></div></div></section></div>}
    {tab === 'publishing' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">PUBLISH PIPELINE</span><h2>Cómo publica el adaptador</h2><p className="detail-lede">{provider.flow}</p><div className="media-list">{provider.media.map((m) => <div key={m}><span>↗</span>{m}</div>)}</div></section><section className="panel"><span className="panel-kicker">LIMITS & VALIDATION</span><h2>Condiciones que bloquean o cambian la salida</h2><div className="constraint-list">{provider.constraints.map((item, i) => <div key={item}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></div>)}</div></section></div>}
    {tab === 'operations' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">RELIABILITY</span><h2>Reconciliar el estado remoto</h2><p className="detail-lede">Representa los estados originales y normalizados. Una respuesta de aceptación no equivale siempre a que el post esté disponible.</p>{provider.operations.map((item) => <div className="ops-row" key={item}><span>✓</span>{item}</div>)}</section><section className="panel"><span className="panel-kicker">SOURCE REGISTER</span><h2>Documentación oficial</h2><div className="source-links">{provider.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.label}</span><b>↗</b></a>)}</div><div className="review-date">Última revisión documental: <strong>12 sep 2026</strong></div></section></div>}
  </>;
}

export default App;
