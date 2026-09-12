# APIs sociales para gm-marketing

## Evaluación técnica y de producto de Meta, Instagram, TikTok y YouTube

**Corte de documentación: 12 de septiembre de 2026.** Este informe revisa documentación oficial de las plataformas y repositorios oficiales de SDK. Los permisos, límites y formatos cambian con frecuencia; cada adaptador debe tratar esas reglas como datos versionados y verificar capacidades en ejecución cuando la API lo permita.

## Dictamen ejecutivo

Micro Campaña puede recopilar ideas y archivos, generar un paquete editorial y conectar cuentas sociales para preparar y publicar contenido. La automatización es viable, pero no significa “un botón publica cualquier pieza en todas las redes”: Instagram limita el acceso a cuentas profesionales; Facebook publica como Página; TikTok requiere una experiencia de publicación con decisión y consentimiento del creador y una auditoría para publicación pública a escala; YouTube requiere autorización OAuth por canal y una auditoría del proyecto para publicar contenido públicamente.

`gm-marketing` debería ser una capa de **adaptadores REST oficiales**, con autenticación, ingestión de medios, trabajos asíncronos y normalización de estados. El modelo común debe exponer las diferencias —cuentas elegibles, formatos, revisión, opciones de privacidad y límites— en vez de esconderlas. El flujo seguro de producto es: idea → propuesta de campaña por red → edición/aprobación → conexión OAuth → vista previa → publicación o programación → estado verificable.

“Campaña” puede significar contenido orgánico o anuncios pagados. Este informe cubre principalmente publicación y gestión orgánica. Meta Marketing API y TikTok for Business Ads son superficies distintas, con acceso y permisos propios; no debe prometerse compra/optimización de anuncios como parte del MVP orgánico.

## Qué significa “SDK” en estas cuatro plataformas

No hay un SDK multiplataforma oficial ni una abstracción común que publique a las cuatro redes. Las APIs de servidor se pueden consumir por HTTP; los SDK oficiales son clientes idiomáticos que encapsulan solo partes de cada API o flujos nativos.

| Plataforma | Oferta oficial de SDK/client library | Consecuencia para `gm-marketing` |
|---|---|---|
| Meta | Business SDK mantenido por Meta (Node.js, Python, PHP, Java, Ruby); integra Marketing API y muchos objetos de Pages/Business/Instagram. Existen también SDKs de plataforma para clientes web/móvil. | Es útil si el backend usa un lenguaje soportado y los objetos/endpoints requeridos están implementados. No significa que se aprueben scopes ni evita Graph API versioning. El módulo orgánico debe seguir contrastando los requests reales con la documentación de la versión actual. |
| TikTok | OpenSDK para iOS/Android, con Login Kit y Share Kit; Login Kit también usa OAuth web/desktop. Content Posting API es una API HTTPS de servidor para cargas cloud. | Usar el SDK de app solo si Micro Campaña tiene clientes móviles que integran login/compartir nativo. Para el backend web/cloud, implementar Content Posting API directamente con un cliente HTTP pequeño; no enviar `client_secret` a una app. |
| YouTube | Google API Client Libraries en varios lenguajes, con distintas etapas de madurez; la API pública es REST y hay client libraries para acelerar OAuth/serialización/carga reanudable. | Elegir la librería estable correspondiente al runtime o usar REST para un núcleo portable. La librería no resuelve cuota, auditoría del proyecto, borrado de datos ni aprobación OAuth. |

**Recomendación:** empaquetar en `gm-marketing` contratos, validadores, OAuth adapters y transportes específicos, no intentar envolver cuatro librerías de terceros en un “SDK universal”. Para la capa backend, el criterio de selección es cobertura actual del endpoint, soporte de versión, manejo de uploads y capacidad de probar el request HTTP resultante. Guardar fixtures de requests/responses y probar con cuentas de test minimiza el acoplamiento a las abstracciones del SDK. [Meta Business SDK Node.js](https://github.com/facebook/facebook-nodejs-business-sdk) · [Meta Business SDK Python](https://github.com/facebook/facebook-python-business-sdk) · [TikTok OpenSDK / Login Kit](https://developers.tiktok.com/docs/en/mobile-sdk-ios-quickstart) · [TikTok Content Posting API](https://developers.tiktok.com/products/content-posting-api) · [Google client libraries de YouTube](https://developers.google.com/youtube/v3/libraries)

## Hallazgos comparados

| Red | API principal para Micro Campaña | Cuentas conectables | Publicación automatizable | Condición de producción que puede bloquear el lanzamiento |
|---|---|---|---|---|
| Facebook | Graph API / Pages API | Páginas que el usuario puede administrar | Posts de Página, fotos/videos y Reels mediante flujos de subida | Permisos de Página y acceso de la app; no es publicación general en perfiles personales |
| Instagram | Instagram Platform / Graph API | Business y Creator profesionales | Fotos, videos, Reels y carruseles; Stories tienen restricciones de elegibilidad | Scopes de publicación y aprobación de Meta para usuarios de terceros; los medios deben estar disponibles para que Meta los obtenga |
| TikTok | Login Kit + Content Posting API | Cuenta TikTok autorizada por OAuth | Direct Post o envío a borradores, videos y fotos | Scope `video.publish` aprobado y auditoría para publicar públicamente; UX obligatoria y topes de uso |
| YouTube | YouTube Data API v3 | Canal asociado a una cuenta Google autorizada | Subida de video, metadatos y programación | Proyecto no auditado restringe subidas a privado; cuota de 100 subidas/día por defecto |

## Recomendaciones de diseño

1. **Definir un contrato de capacidades, no fingir paridad.** Cada conector debe informar `supported_media`, `account_requirements`, `can_schedule`, `requires_user_confirmation`, `privacy_options`, `max_media` y estado de auditoría. Los resultados de creación, publicación y analítica deben conservar el estado original y el ID remoto.
2. **Separar campaña editorial de publicación.** La campaña contiene estrategia, textos, piezas y calendario; cada destino genera una variante validada y un `publish_job`. La persona debe aprobar el texto, los medios, la cuenta destino, la privacidad y el momento de publicación antes de crear la acción remota.
3. **Hacer los trabajos de medios reanudables y asíncronos.** Guardar la URL de carga/sesión, avance, `publish_id` o container ID, y el resultado del procesamiento. Evitar que una desconexión del navegador duplique una publicación.
4. **OAuth solo desde backend.** Mantener secretos, refresh tokens y tokens de página/canal en almacenamiento cifrado y aislado por cliente/cuenta. Implementar revocación y borrado de tokens/datos, rotación de secretos, `state` anti-CSRF, scopes mínimos y registro auditable del consentimiento.
5. **Cola por cuenta y plataforma.** Añadir control de concurrencia, límites por usuario/cuenta, idempotencia, reintentos con backoff solo para errores transitorios, y reconciliación de estados mediante polling y webhooks. No reintentar automáticamente fallos permanentes de permisos, moderación o contenido.
6. **Preparar auditorías como entregable del producto.** Las plataformas no solo revisan código: esperan una app pública real, políticas visibles, demostración de flujos y explicación de cada permiso. La aprobación es un hito externo y debe figurar en el plan de lanzamiento.

## Meta: Facebook Pages e Instagram

### Superficies y configuración

Facebook e Instagram comparten infraestructura Graph API, pero son productos y permisos diferenciados. Para Facebook, el recurso publicable central es la **Página** y se obtiene un Page Access Token en el contexto de una persona que administra esa Página; la colección oficial de Meta muestra la consulta de páginas administradas y sus tareas. No diseñar publicación desde perfiles personales como capacidad estándar de `gm-marketing`. [Colección oficial de Facebook API de Meta](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)

Para Instagram hay al menos dos configuraciones importantes:

- **Instagram API with Instagram Login**: Business y Creator pueden autorizar directamente Instagram, sin requerir una Página de Facebook enlazada. Los scopes actuales incluyen `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments` e `instagram_business_manage_messages`. Meta indica que los scopes antiguos `business_*` dejaron de ser válidos desde el 27 de enero de 2025; no iniciar una integración nueva con esos nombres. La configuración Instagram Login no cubre anuncios ni tagging, según la colección oficial. [Colección oficial de Instagram API de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- **Instagram API with Facebook Login**: usa la conexión con Página y permisos como `instagram_basic`, `instagram_content_publish`, `pages_show_list` y `pages_read_engagement`. La colección de Meta señala que no accede a cuentas personales/consumer y que la publicación de Stories está limitada a cuentas Business. Conviene elegir conscientemente un flujo principal; evitar duplicar conexiones a una misma identidad por dos login paths salvo que exista una función que lo justifique.

Para una app que sirve a clientes externos, hay que presupuestar App Review y acceso avanzado a los permisos que requiera el flujo en producción. En la ruta de Facebook Pages, `pages_show_list` se usa para descubrir las Páginas autorizadas y `pages_manage_posts` para administrar/publicar contenido; el Page token debe tener además la tarea de Página adecuada para la operación solicitada. En Instagram Login, pedir solo los scopes `instagram_business_*` que requiera la función. Los roles de desarrollador/tester sirven para construir y probar con cuentas propias; no son una estrategia de acceso para usuarios generales. La aprobación concreta depende del permiso y del producto Meta configurado, por lo que `gm-marketing` debe solicitar solo scopes que use en funciones entregadas. [Permisos Meta](https://developers.facebook.com/docs/permissions/) · [App Review](https://developers.facebook.com/docs/apps/review/)

### Publicación y medios

Instagram Content Publishing funciona como un flujo de contenedores: se crea el contenedor de cada pieza, se espera a que el medio esté listo y luego se publica con el ID del contenedor. La API admite publicación de imágenes, videos, Reels y carruseles; un carrusel se prepara por elementos y se publica como una unidad. El servidor de Meta necesita obtener los archivos desde URL accesible públicamente durante el procesamiento; los medios privados de Micro Campaña deben recibir un enlace temporal, firmado y con vencimiento adecuado, o usarse la modalidad de transferencia soportada por el endpoint/versión escogidos. [Guía de publicación de Instagram en documentación de Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing) · [Ejemplo oficial de carga y publicación de Reels](https://www.postman.com/meta/instagram/folder/f95kq5e/reels-publishing)

La colección oficial describe para Reels MP4/MOV, H.264/HEVC, 23–60 FPS, hasta 1920 píxeles horizontales, máximo 1 GB y de 3 segundos a 15 minutos; recomienda 9:16. Validar los límites por endpoint y versión: los valores soportados para Reels no deben convertirse en validación global de todo formato Instagram. El usuario debe poder elegir opciones como compartir Reel al feed cuando estén disponibles.

Meta publica límites de contenido que han aparecido distintos en páginas y muestras; por eso el servicio debe consultar el endpoint de límite de publicación del usuario de Instagram cuando esté disponible y no codificar un número diario como regla inmutable. [Referencia de límite de publicación](https://developers.facebook.com/docs/instagram-platform/reference/ig-user/content_publishing_limit)

Facebook Pages tiene flujos propios. El endpoint `/me/accounts` o su equivalente versionado permite listar Páginas y tokens con tareas concedidas; la colección de Meta documenta la subida de Reels en etapas (inicio, transferencia/procesamiento y finalización). Para calendarización, es más robusto que Micro Campaña posea la cola y lance el publish en el momento aprobado, en vez de asumir que todas las superficies aceptan un mismo objeto de programación.

### Lectura, comentarios, webhooks y métricas

Instagram permite funcionalidades adicionales según scopes: lectura de perfil y medios, comentarios, mensajes, menciones e insights. Son módulos optativos, no requisitos para publicar contenido. La mensajería requiere permisos separados y reglas propias (por ejemplo, la persona debe iniciar la conversación); no incluir inbox o respuestas automáticas en el alcance de publicación sin revisar esa superficie específicamente. [Colección oficial Meta Instagram](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)

Para Facebook e Instagram, el consumo operativo debe respetar paginación por cursores, límites por producto y permisos concedidos; guardar `platform_request_id`/códigos de error para diagnóstico, pero no exponer tokens en logs. Revalidar campos y métricas al cambiar la versión de Graph API.

### Estado de versión en 2026

Meta anunció Graph API v26.0 el 29 de julio de 2026; es la versión más reciente al corte de este informe. Tiene cambios incompatibles y el ciclo de versiones implica vencimientos: v20.0 aparece con fecha de expiración del 24 de septiembre de 2026, a doce días del corte. `gm-marketing` debe fijar una versión explícita por conector, mantener pruebas de contrato para la versión nueva y planificar una ventana de actualización antes de cada sunset. No usar la versión implícita. [Anuncio de Graph API v26.0](https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/) · [Versiones y fechas](https://developers.facebook.com/docs/graph-api/changelog/versions) · [Cambios de v26.0](https://developers.facebook.com/docs/graph-api/changelog/version26.0)

Meta ofrece repositorios oficiales de Business SDK para Node.js, Python, PHP y Java, entre otros. El repositorio Node define el paquete como SDK de Marketing API, aunque incluye objetos Graph API y varias superficies; el SDK no sustituye la elegibilidad de permisos ni los flujos y reglas por endpoint. Para `gm-marketing`, usar el SDK solo donde cubra el endpoint efectivamente usado; mantener un adaptador REST delgado y la versión explícita suele ser más portable para una librería multi-plataforma. [Meta Business SDK para Node.js](https://github.com/facebook/facebook-nodejs-business-sdk) · [Meta Business SDK para Python](https://github.com/facebook/facebook-python-business-sdk)

## TikTok

### Productos y autorización

El flujo servidor típico combina **Login Kit (OAuth 2.0)** y **Content Posting API**. TikTok exige registro de app, callback URI, solicitud/revisión de scopes y consentimiento de cada persona; que el scope esté habilitado para la app no significa que el usuario ya lo haya otorgado. Mantener `client_secret` y refresh token solo en backend, validar `state`, guardar expiraciones y soportar renovación/revocación. `user.info.basic` es de solo lectura; publicación requiere `video.publish` o `video.upload` según la opción elegida. [Login Kit](https://developers.tiktok.com/docs/en/login-kit-overview) · [Scopes](https://developers.tiktok.com/docs/en/scopes-overview) · [Gestión de tokens](https://developers.tiktok.com/docs/en/login-kit-manage-user-access-tokens)

### Direct Post versus borrador

- **Direct Post (`video.publish`)**: Micro Campaña transmite el contenido para publicarlo en TikTok. Antes de publicar se debe consultar `creator_info/query`, representar la cuenta destino y las opciones devueltas, permitir que la persona seleccione privacidad y ajustes de interacción, mostrar el preview y pedir consentimiento expreso antes de iniciar la transferencia. La aplicación no debe preseleccionar privacidad ni permisos de comentarios/duet/stitch cuando las pautas requieren elección del usuario.
- **Upload to TikTok (`video.upload`)**: el contenido se entrega a la bandeja de entrada de TikTok para que la persona lo revise, edite y termine de publicar dentro de TikTok. No equivale a “publicado”; el producto debe mostrarlo como borrador enviado y esperar webhook/estado o confirmación correspondiente.

A 4 de agosto de 2026 Content Posting API ya incluye fotos. Direct Post requiere que los medios alojados en servidor provengan de un dominio o prefijo verificado por la app; `FILE_UPLOAD` sirve para archivo del dispositivo. La API usa endpoints distintos para el flujo de foto y video, y la operación es asíncrona. [Direct Post y publicación de fotos](https://developers.tiktok.com/docs/en/content-posting-api-get-started) · [Upload de borradores](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content) · [Transferencia de medios](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)

### Auditoría, UX y topes: criterio crítico de producto

Los clientes API no auditados solo publican en modo privado `SELF_ONLY` y están limitados a cinco usuarios que publiquen dentro de una ventana de 24 horas. Para salir de ese modo se requiere auditoría de TikTok; incluso aprobados, la app tiene un límite de creadores activos basado en lo declarado, y cada creador suele tener un límite Direct Post de alrededor de 15 publicaciones por día, compartido entre clientes API. Son límites del proveedor, no cuotas que Micro Campaña pueda aumentar pagando un plan.

Las directrices de 2026 exigen una experiencia dirigida a creadores reales y a una audiencia amplia. La app no debe ser meramente una utilidad interna para subir contenidos de cuentas del equipo, ni copiar a TikTok contenido arbitrario de otras plataformas. Debe mostrar el creador correcto, permitir editar título/hashtags y privacidad, obtener consentimiento expreso antes de enviar archivos, permitir disclosure de contenido comercial, no añadir logos/marcas promocionales sobre el video, informar sobre procesamiento y reflejar las opciones reales del creador. Esta revisión de UX debe convertirse en requisito de producto desde el MVP, no en un arreglo posterior. [Directrices de publicación y UX de TikTok](https://developers.tiktok.com/docs/en/content-sharing-guidelines)

TikTok requiere un sitio público funcional, enlaces visibles a privacidad y términos, una descripción precisa de cada producto/scope y un video de demostración end-to-end en su revisión. Si se utiliza `PULL_FROM_URL`, el dominio debe verificarse. [Revisión de apps](https://developers.tiktok.com/docs/en/app-review-guidelines) · [Registro y verificación de URLs](https://developers.tiktok.com/docs/en/getting-started-create-an-app)

### Estado, webhooks y fiabilidad

Content Posting entrega `publish_id` y permite consultar estado; también ofrece webhooks como `post.publish.failed`, `post.publish.complete`, `post.publish.publicly_available` e `inbox_delivered`. El estado final puede tardar, especialmente si hay moderación de contenido público; no informar “publicado” al recibir solo aceptación de la subida. Los webhooks tienen entrega al menos una vez y reintentos hasta 72 horas, así que deduplicar por ID/evento y responder HTTP 200 rápidamente. El status endpoint limita cada token a 30 requests por minuto; inicialización tiene límite de seis requests por minuto por token. [Consulta de estado y eventos](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status) · [Webhooks](https://developers.tiktok.com/docs/en/webhooks-overview)

TikTok permite distinguir tareas `ready_for_direct_post`, `processing_upload`, `PUBLISH_COMPLETE`, `FAILED`, etc. Mapearlos en estados internos como `queued`, `uploading`, `processing`, `needs_user_action`, `published`, `failed_permanent`; conservar `fail_reason` para que Micro Campaña sugiera corregir formato, duración o dominio, sin reintentos ciegos.

## YouTube

### API y autorización

La superficie general para canal y contenido es **YouTube Data API v3**. Lecturas públicas pueden usar API key según endpoint; operaciones de cuenta y cualquier upload/update/delete requieren OAuth 2.0. El flujo de servidor puede conservar refresh token y solicitar el scope mínimo; para subir video es `https://www.googleapis.com/auth/youtube.upload`. YouTube Data API no acepta service accounts como sustituto de una persona/canal conectado. La conexión representa el canal cuya cuenta autorizó el acceso. [Autenticación OAuth de YouTube](https://developers.google.com/youtube/v3/guides/authentication) · [Scopes](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)

### Subida, programación y estado

`videos.insert` sube el archivo y metadatos (título, descripción, tags, categoría y privacidad). Soporta carga reanudable, recomendada para archivos grandes o conexiones inestables; almacenar la URI de sesión y usar `308 Resume Incomplete`/`Range` para retomar, con backoff ante fallos transitorios. El endpoint admite videos de hasta 256 GB. Tras la transferencia, el procesamiento continúa; consultar `videos.list` por `processingDetails.processingStatus` o el recurso del video y no confundir upload completo con video procesado/publicado. [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) · [Carga reanudable](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol) · [Comprobar procesamiento](https://developers.google.com/youtube/v3/guides/implementation/videos)

La API tiene `status.privacyStatus` y `status.publishAt`: se puede programar una publicación futura cuando el video queda privado y nunca se ha publicado previamente. Para Shorts no existe un endpoint distinto de upload: `videos.insert` sube el video ordinario y YouTube lo clasifica como Short conforme a sus reglas de formato/longitud. Para canales estándar, videos cuadrados o verticales de hasta tres minutos subidos desde el 15 de octubre de 2024 se categorizan como Shorts. No vender una etiqueta “Shorts” controlada por la API; validar encuadre/duración y comunicar que la clasificación la hace YouTube. [Recurso Video y `publishAt`](https://developers.google.com/youtube/v3/docs/videos) · [Regla oficial de Shorts de 3 minutos](https://support.google.com/youtube/answer/15424877?hl=es-419)

### Auditoría, cuota y cumplimiento

Uploads desde proyectos API no verificados creados después del 28 de julio de 2020 se quedan privados hasta que el proyecto supere auditoría de cumplimiento. La cuota por defecto contempla 100 llamadas/día a `videos.insert` y 100 a `search.list`, más 10.000 unidades combinadas para otras operaciones; la cuota real y su renovación deben vigilarse desde Google Cloud Console. Las lecturas normales suelen costar una unidad, pero las operaciones de escritura pueden tener costos diferentes; los uploads disponen de su bucket descrito por Google. Tratar límites como configuración por proyecto. [Auditoría de `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) · [Cuotas](https://developers.google.com/youtube/v3/determine_quota_cost)

Los requisitos de YouTube son más amplios que una pantalla de OAuth: política de privacidad visible, consentimiento y scopes con beneficio claro, revocación fácil, identificación del canal, visibilidad y acciones antes de ejecutarlas. Cuando se revoca el acceso, el token debe revocarse y los datos autorizados eliminados dentro de siete días; gran parte de los datos API almacenados deben refrescarse o eliminarse en un máximo de 30 días. No recopilar credenciales de Google/YouTube ni combinar datos de propietarios distintos para inferir actividad de YouTube. Hacer que privacidad/borrado del usuario sean operaciones de primera clase. [Políticas de desarrollador de YouTube](https://developers.google.com/youtube/terms/developer-policies) · [Guía de cumplimiento](https://developers.google.com/youtube/terms/developer-policies-guide)

## Arquitectura inicial propuesta

```text
Micro Campaña
  ├─ Campaign Core: brief, calendario, aprobaciones, variantes por red
  ├─ Asset Service: originales, versiones optimizadas, URLs firmadas, retención
  ├─ Account Connections: OAuth, scopes concedidos, expiración, revocación
  ├─ Capability Registry: formatos, opciones, requisitos y límites por conexión
  ├─ Publish Orchestrator: cola, idempotencia, reintentos, auditoría y alertas
  └─ Platform Adapters
       ├─ Meta Facebook Pages (Graph API v26+)
       ├─ Instagram Platform (Instagram Login; alternativa FB Login si necesaria)
       ├─ TikTok (Login Kit + Content Posting API)
       └─ YouTube (Data API v3)
```

Contrato orientativo por adaptador:

```text
connect(scopes) → authorization_url
list_accounts() → connected_accounts[]
capabilities(account_id) → formats, options, limits, approval_state
validate_draft(account_id, media, metadata) → errors/warnings
create_publish_job(account_id, approved_payload, schedule_at?) → remote_job
get_job_status(remote_job_id) → normalized_status + platform_details
handle_webhook(request) → accepted / deduplicated event
revoke(account_id) → revoke provider token + delete linked data
```

No todos los proveedores aceptan `schedule_at`: el orquestador puede programar el momento de iniciar la publicación; YouTube además expone `publishAt`. En TikTok, un envío a inbox debe permanecer como `needs_user_action`. Esos tres casos deben verse diferentes en la UI y en las métricas.

Modelo mínimo sugerido:

- `SocialConnection`: tenant, provider, remote account ID, nombre visible, scopes concedidos, estado de token, estado de revisión/capacidad, timestamps de consentimiento/revocación.
- `Campaign`: brief, objetivo, audiencia declarada, tema, periodo, aprobador y versión.
- `Asset`: objeto original, MIME/duración/dimensiones, derechos/declaración de uso, variantes, checksum y políticas de borrado.
- `PlatformDraft`: connection, texto, hashtags, asset mapping, configuración de privacidad/comercial, revisión humana.
- `PublishJob`: scheduled time UTC, estado interno, idempotency key, remote ID, sesiones de carga, últimos errores, intentos y huella de consentimiento.

El almacenamiento de originales puede ser privado; crear copias o URL firmadas de vida corta para que cada proveedor obtenga los medios. No usar un bucket público permanente. Aplicar antivirus/validación MIME, límites de tamaño, duración y codec antes de ocupar cuotas remotas.

## Secuencia de entrega recomendada

**Fase 0 — habilitación externa:** crear apps/proyectos oficiales y dominios públicos; redactar política de privacidad y términos; diseñar pantallas y video de demo para revisión; probar scopes con cuentas propias. Meta v26 debe quedar pinneada explícitamente. TikTok y YouTube requieren auditoría para producción con publicaciones públicas.

**Fase 1 — MVP publicador:** Facebook Page post/foto; Instagram foto/Reel/carrusel para profesional; TikTok draft upload como fallback más Direct Post tras aprobación; YouTube video upload privado/programado. Todas las acciones visibles antes del envío y con aprobación de persona.

**Fase 2 — insights y comunidad:** métricas, comentarios y notificaciones/webhooks después de completar las aprobaciones y mapear retención. Separar estos scopes y productos del publicador base.

**Fase 3 — medios pagados:** evaluar Meta Marketing API y TikTok for Business como módulos independientes (cuentas publicitarias, billing, audiencias, campañas de ads, roles y compliance). No mezclar publicación orgánica con gasto en ads en el mismo permiso o estado.

## Registro de riesgos a cerrar antes de comprometer fechas

| Riesgo | Consecuencia | Mitigación concreta |
|---|---|---|
| Revisión o auditoría de plataforma tarda o rechaza | MVP puede conectar cuentas propias pero no publicar públicamente para clientes | Iniciar procesos de revisión al comienzo; MVP con borradores/descargas y cola de aprobación manual como fallback |
| El cliente tiene perfil personal en Instagram o carece de Página/tipo elegible | Cuenta no conectable al flujo elegido | Verificación previa de elegibilidad e instrucciones de conversión/administración; nunca pedir contraseña |
| TikTok UX no cumple pautas | App review denegada o Direct Post limitado a privado | Implementar preview, privacidad sin default, disclosure, consentimiento y editor antes de subir |
| URLs de medios o codec no cumplen | Fallo de importación/procesamiento en proveedor | Transcodificación, storage firmado y validación previa por plataforma |
| Token revocado/expirado | Trabajos programados fallan | Renovación preventiva, webhooks donde existan, reconexión guiada y reintentos clasificados |
| Un mismo contenido no sirve a todas las redes | Recorte, texto truncado, audio/branding o metadata inadecuados | Variantes de campaña por destino; consentimiento explícito para cambios/editorialización |
| Límites/versiones cambian | Interrupción de publicación | Registro de versión, lectura de límites en runtime, monitor de changelogs y contract tests |

## Conclusión

La oportunidad de Micro Campaña está en convertir una idea en **una campaña editorial adaptada, aprobable y medible**, y en resolver la complejidad de conectar/publicar sin pedir credenciales ni depender de automatización no oficial. El diferenciador técnico de `gm-marketing` sería hacer transparentes las capacidades reales por cuenta y red, y operar uploads y permisos de manera confiable.

La prioridad inmediata debe ser construir el esqueleto de conexiones y empezar en paralelo el onboarding/review externo. Antes de vender publicación pública automática, confirmar tres hitos de acceso: aprobación de Meta para los permisos de clientes, auditoría TikTok para uso público a escala y auditoría de YouTube para quitar el modo privado de proyectos no verificados.

## Fuentes oficiales consultadas

### Meta / Facebook / Instagram

1. Meta, [Facebook API — colección oficial de Postman](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api).
2. Meta, [Instagram API — colección oficial de Postman](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).
3. Meta, [Instagram API with Instagram Login — colección](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login).
4. Meta, [Reels Publishing — colección de ejemplos](https://www.postman.com/meta/instagram/folder/f95kq5e/reels-publishing).
5. Meta, [Instagram Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).
6. Meta, [IG User `content_publishing_limit`](https://developers.facebook.com/docs/instagram-platform/reference/ig-user/content_publishing_limit).
7. Meta, [Graph API v26.0 y Marketing API v26.0 — anuncio](https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/).
8. Meta, [versiones y expiraciones de Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions); [changelog v26.0](https://developers.facebook.com/docs/graph-api/changelog/version26.0).
9. Meta, [Business SDK para Node.js](https://github.com/facebook/facebook-nodejs-business-sdk); [para Python](https://github.com/facebook/facebook-python-business-sdk).
10. Meta, [permisos de Facebook Login y Graph API](https://developers.facebook.com/docs/permissions/); [App Review](https://developers.facebook.com/docs/apps/review/).

### TikTok

11. TikTok for Developers, [Login Kit overview](https://developers.tiktok.com/docs/en/login-kit-overview); [scopes](https://developers.tiktok.com/docs/en/scopes-overview); [gestión de tokens](https://developers.tiktok.com/docs/en/login-kit-manage-user-access-tokens).
12. TikTok for Developers, [Content Posting API — Direct Post, incluidas fotos](https://developers.tiktok.com/docs/en/content-posting-api-get-started); [borradores](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content); [transferencia de medios](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).
13. TikTok for Developers, [Direct Post UX y contenido compartido](https://developers.tiktok.com/docs/en/content-sharing-guidelines).
14. TikTok for Developers, [estado y webhooks de Content Posting](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status); [webhooks overview](https://developers.tiktok.com/docs/en/webhooks-overview).
15. TikTok for Developers, [app review guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines); [registro de app y URL verification](https://developers.tiktok.com/docs/en/getting-started-create-an-app).
16. TikTok for Developers, [iOS OpenSDK quickstart](https://developers.tiktok.com/docs/en/mobile-sdk-ios-quickstart); [producto Login Kit](https://developers.tiktok.com/products/login-kit/); [producto Share Kit](https://developers.tiktok.com/products/share-kit/).

### YouTube / Google

17. Google for Developers, [YouTube Data API: OAuth](https://developers.google.com/youtube/v3/guides/authentication); [OAuth para servidor](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps).
18. Google for Developers, [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert); [Video resource](https://developers.google.com/youtube/v3/docs/videos); [resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol).
19. Google for Developers, [YouTube Data API quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost); [video processing status](https://developers.google.com/youtube/v3/guides/implementation/videos); [client libraries](https://developers.google.com/youtube/v3/libraries).
20. Google for Developers, [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies); [compliance guide](https://developers.google.com/youtube/terms/developer-policies-guide).
21. YouTube Help, [clasificación de Shorts de hasta tres minutos](https://support.google.com/youtube/answer/15424877?hl=es-419).
