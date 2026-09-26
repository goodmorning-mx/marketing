import { createContext, useContext, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type ProviderId = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
type Section = 'overview' | 'connections' | 'requirements' | 'publishing' | 'sources';
type ProviderTab = 'summary' | 'requirements' | 'auth' | 'publishing' | 'operations';
type Locale = 'en' | 'es' | 'fr' | 'de' | 'ar';

const localeOptions: { id: Locale; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'es', label: 'Spanish', native: 'Español' },
  { id: 'fr', label: 'French', native: 'Français' },
  { id: 'de', label: 'German', native: 'Deutsch' },
  { id: 'ar', label: 'Arabic', native: 'العربية' },
];

const translations: Record<Locale, Record<string, string>> = {
  en: {
    overview: 'Overview', connections: 'Connections', requirements: 'Requirements', publishing: 'Publishing', sources: 'Official sources', summary: 'Summary', auth: 'Access & OAuth', operations: 'Operations',
    socialPublishing: 'Social publishing', overviewDescription: 'One view to understand what each platform requires before connecting an account or publishing a campaign.',
    viewRequirements: 'View requirements', adapters: 'Adapters', activeConnections: 'Active connections', publishingStatus: 'Publishing status', preparation: 'Preparation', nextMilestone: 'Next milestone', appReviews: 'App reviews',
    choosePlatform: 'Choose a platform', choosePlatformDescription: 'Open an adapter to review configuration, scopes, and editorial flow.', pending: 'Pending configuration', beforeProduction: 'Before production', flowExplore: 'Explore flow', connectedAccounts: 'Connected accounts',
    connectionsDescription: 'Connect and manage identities authorized by their owners. No platform credentials are configured in this environment yet.', noConnections: 'No active connections', oauthNotice: 'OAuth connections are not enabled yet. Developer apps, callbacks, and external reviews must be completed first.', notConnected: 'Not connected', seeRequirements: 'See requirements', oauthEmpty: 'Accounts will appear here after OAuth consent', oauthEmptyDescription: 'A connection represents an account authorized by its owner, not a shared credential.',
    integrationRequirements: 'Integration requirements', requirementsDescription: 'Credentials are only one part. Each network has different eligibility, scopes, app review, and external-use conditions.', allPlatforms: 'All platforms', commonAdapter: 'Common adapter foundation', controls: 'controls', appChecklist: 'App checklist', prepareReview: 'What to prepare for review',
    publishingFlow: 'An editorial flow with approval', publishingDescription: 'The campaign is common; each adapter resolves the variant, validation, transfer, and final state.', ideaBrief: 'Idea and brief', variants: 'Variants by network', validation: 'Validation', approval: 'Approval', publication: 'Publication', publicationDifferences: 'Publishing differences', adapterRules: 'Each adapter preserves each network’s rules',
    officialSources: 'Official sources', sourcesDescription: 'Requirements reviewed September 12, 2026. Links go to provider documentation, API references, and policies.', platformAdapter: 'Platform adapter', allPlatformsBack: 'All platforms', adapterSnapshot: 'Adapter snapshot', whatConnects: 'What this adapter connects', prepareIntegration: 'Prepare integration', readiness: 'Readiness', completedSteps: 'enablement steps completed', externalBlockers: 'External blockers', mediaFormats: 'Media and formats', mainSources: 'Main sources', prelaunchChecklist: 'Pre-launch checklist', enableAdapter: 'Requirements to enable the adapter', steps: 'steps', scopesEligibility: 'Scopes / eligibility', accessNeeded: 'Access needed', authorization: 'Authorization', credentials: 'Connection and credentials', scopesConsider: 'Scopes to consider', platformAccess: 'Platform access', reviewProduction: 'Review and production', publishPipeline: 'Publish pipeline', howPublishes: 'How the adapter publishes', limitsValidation: 'Limits & validation', conditions: 'Conditions that block or change output', reliability: 'Reliability', reconcile: 'Reconcile remote state', sourceRegister: 'Source register', documentation: 'Official documentation', lastReview: 'Last documentation review', apiAvailable: 'API available', apiOffline: 'API offline', checking: 'checking', reviewed: 'Documentation reviewed', requirementsMayChange: 'Requirements and limits can change; always consult official documentation.', language: 'Language', readinessCard: 'Before production', fourExternalRequirements: '4 external requirements', commonReview: 'Common', metaReview: 'Meta App Review and Advanced Access', tiktokReview: 'Audit for public posting', youtubeReview: 'OAuth verification and API audit', commonReviewText: 'Privacy, consent, and deletion', viewCompleteChecklist: 'View complete checklist', integratorContract: 'One contract, four adapters', integratorDescription: 'The integrator normalizes connections and states while preserving each network’s rules so automation stays safe.', campaign: 'Campaign', adapter: 'Adapter', publishJob: 'Publish job', productionCallback: 'Production domain and HTTPS callback', privacyTerms: 'Public privacy policy and terms', scopeUseCase: 'Scope description and real use case', consentDemo: 'End-to-end consent demo', deletionFlow: 'Disconnect and data deletion flow', minimumScopes: 'Minimum scopes', minimumScopesText: 'Request extra access only when the person activates that function.', publishingStep1Text: 'Objective, audience, tone, timing, and source material.', publishingStep2Text: 'The AI Integrator adapts format, copy, CTA, and placement.', publishingStep3Text: 'The adapter checks account, permissions, media, and real options.', publishingStep4Text: 'The person confirms destination, copy, privacy, and timing.', publishingStep5Text: 'Idempotent queue, asynchronous upload, webhooks, and verifiable state.', platformTable: 'PLATFORM', accountAccess: 'ACCOUNT & ACCESS', productionMilestone: 'PRODUCTION MILESTONE',
  },
  es: {
    overview: 'Resumen', connections: 'Conexiones', requirements: 'Requisitos', publishing: 'Publicación', sources: 'Fuentes oficiales', summary: 'Resumen', auth: 'Acceso y OAuth', operations: 'Operación', socialPublishing: 'Publicación social', overviewDescription: 'Una vista para entender qué requiere cada plataforma antes de conectar una cuenta o publicar una campaña.', viewRequirements: 'Ver requisitos', adapters: 'Adaptadores', activeConnections: 'Conexiones activas', publishingStatus: 'Estado de publicación', preparation: 'Preparación', nextMilestone: 'Próximo hito', appReviews: 'Revisiones de apps', choosePlatform: 'Elige una plataforma', choosePlatformDescription: 'Abre un adaptador para revisar configuración, permisos y flujo editorial.', pending: 'Configuración pendiente', beforeProduction: 'Antes de producción', flowExplore: 'Explorar flujo', connectedAccounts: 'Cuentas conectadas', connectionsDescription: 'Conecta y administra identidades autorizadas por sus propietarios. Todavía no hay credenciales configuradas.', noConnections: 'Sin conexiones activas', oauthNotice: 'Las conexiones OAuth aún no están habilitadas. Primero deben completarse las apps, callbacks y revisiones externas.', notConnected: 'No conectada', seeRequirements: 'Ver requisitos', oauthEmpty: 'Las cuentas aparecerán después del consentimiento OAuth', oauthEmptyDescription: 'Una conexión representa una cuenta autorizada por su propietario, no una credencial compartida.', integrationRequirements: 'Requisitos de integración', requirementsDescription: 'Las credenciales son solo una parte. Cada red tiene requisitos distintos de elegibilidad, permisos, revisión y uso externo.', allPlatforms: 'Todas las plataformas', commonAdapter: 'Base común del adaptador', controls: 'controles', appChecklist: 'Lista de la app', prepareReview: 'Qué preparar para revisión', publishingFlow: 'Flujo editorial con aprobación', publishingDescription: 'La campaña es común; cada adaptador resuelve la variante, validación, transferencia y estado final.', ideaBrief: 'Idea y briefing', variants: 'Variantes por red', validation: 'Validación', approval: 'Aprobación', publication: 'Publicación', publicationDifferences: 'Diferencias de publicación', adapterRules: 'Cada adaptador conserva las reglas de su red', officialSources: 'Fuentes oficiales', sourcesDescription: 'Requisitos revisados el 12 de septiembre de 2026. Los enlaces llevan a documentación, APIs y políticas.', platformAdapter: 'Adaptador de plataforma', allPlatformsBack: 'Todas las plataformas', adapterSnapshot: 'Resumen del adaptador', whatConnects: 'Qué conecta este adaptador', prepareIntegration: 'Preparar integración', readiness: 'Preparación', completedSteps: 'pasos completados', externalBlockers: 'Bloqueos externos', mediaFormats: 'Medios y formatos', mainSources: 'Fuentes principales', prelaunchChecklist: 'Lista previa al lanzamiento', enableAdapter: 'Requisitos para habilitar el adaptador', steps: 'pasos', scopesEligibility: 'Permisos / elegibilidad', accessNeeded: 'Acceso necesario', authorization: 'Autorización', credentials: 'Conexión y credenciales', scopesConsider: 'Permisos a considerar', platformAccess: 'Acceso a la plataforma', reviewProduction: 'Revisión y producción', publishPipeline: 'Pipeline de publicación', howPublishes: 'Cómo publica el adaptador', limitsValidation: 'Límites y validación', conditions: 'Condiciones que bloquean o cambian la salida', reliability: 'Fiabilidad', reconcile: 'Conciliar estado remoto', sourceRegister: 'Registro de fuentes', documentation: 'Documentación oficial', lastReview: 'Última revisión', apiAvailable: 'API disponible', apiOffline: 'API sin conexión', checking: 'comprobando', reviewed: 'Documentación revisada', requirementsMayChange: 'Los requisitos y límites pueden cambiar; consulta siempre la documentación oficial.', language: 'Idioma', readinessCard: 'Antes de salir a producción', fourExternalRequirements: '4 requisitos externos', commonReview: 'Común', metaReview: 'Revisión de Meta y Advanced Access', tiktokReview: 'Auditoría para publicación pública', youtubeReview: 'Verificación OAuth y auditoría de API', commonReviewText: 'Privacidad, consentimiento y borrado', viewCompleteChecklist: 'Ver checklist completo', integratorContract: 'Un contrato, cuatro adaptadores', integratorDescription: 'El integrador normaliza conexiones y estados, pero conserva las reglas de cada red para mantener segura la automatización.', campaign: 'Campaña', adapter: 'Adaptador', publishJob: 'Trabajo de publicación', exploreFlow: 'Explorar flujo', productionCallback: 'Dominio de producción y callback HTTPS', privacyTerms: 'Política de privacidad y términos públicos', scopeUseCase: 'Descripción de permisos y caso de uso real', consentDemo: 'Demo de consentimiento de extremo a extremo', deletionFlow: 'Flujo de desconexión y borrado', minimumScopes: 'Permisos mínimos', minimumScopesText: 'Solicita acceso adicional solo cuando la persona active esa función.', publishingStep1Text: 'Objetivo, audiencia, tono, calendario y material de origen.', publishingStep2Text: 'El integrador adapta formato, copy, CTA y ubicación.', publishingStep3Text: 'El adaptador comprueba cuenta, permisos, medios y opciones reales.', publishingStep4Text: 'La persona confirma destino, copy, privacidad y calendario.', publishingStep5Text: 'Cola idempotente, carga asíncrona, webhooks y estado verificable.', platformTable: 'PLATAFORMA', accountAccess: 'CUENTA Y ACCESO', productionMilestone: 'HITO DE PRODUCCIÓN',
  },
  fr: {
    overview: 'Vue d’ensemble', connections: 'Connexions', requirements: 'Exigences', publishing: 'Publication', sources: 'Sources officielles', summary: 'Résumé', auth: 'Accès et OAuth', operations: 'Opérations', socialPublishing: 'Publication sociale', overviewDescription: 'Une vue pour comprendre les exigences de chaque plateforme avant de connecter un compte ou de publier une campagne.', viewRequirements: 'Voir les exigences', adapters: 'Adaptateurs', activeConnections: 'Connexions actives', publishingStatus: 'État de publication', preparation: 'Préparation', nextMilestone: 'Prochaine étape', appReviews: 'Revues des applications', choosePlatform: 'Choisir une plateforme', choosePlatformDescription: 'Ouvrez un adaptateur pour vérifier la configuration, les autorisations et le flux éditorial.', pending: 'Configuration en attente', beforeProduction: 'Avant la production', flowExplore: 'Explorer le flux', connectedAccounts: 'Comptes connectés', connectionsDescription: 'Connectez et gérez les identités autorisées par leurs propriétaires. Aucune information d’accès n’est configurée ici.', noConnections: 'Aucune connexion active', oauthNotice: 'Les connexions OAuth ne sont pas encore activées. Les applications, callbacks et revues externes doivent d’abord être terminés.', notConnected: 'Non connecté', seeRequirements: 'Voir les exigences', oauthEmpty: 'Les comptes apparaîtront après le consentement OAuth', oauthEmptyDescription: 'Une connexion représente un compte autorisé par son propriétaire, pas un identifiant partagé.', integrationRequirements: 'Exigences d’intégration', requirementsDescription: 'Les identifiants ne sont qu’un élément. Chaque réseau possède ses propres règles d’éligibilité, autorisations et revues.', allPlatforms: 'Toutes les plateformes', commonAdapter: 'Fondation commune de l’adaptateur', controls: 'contrôles', appChecklist: 'Checklist de l’application', prepareReview: 'Préparer la revue', publishingFlow: 'Flux éditorial avec approbation', publishingDescription: 'La campagne est commune ; chaque adaptateur gère la variante, la validation, le transfert et l’état final.', ideaBrief: 'Idée et brief', variants: 'Variantes par réseau', validation: 'Validation', approval: 'Approbation', publication: 'Publication', publicationDifferences: 'Différences de publication', adapterRules: 'Chaque adaptateur respecte les règles de son réseau', officialSources: 'Sources officielles', sourcesDescription: 'Exigences vérifiées le 12 septembre 2026. Les liens renvoient vers les documents, API et politiques des fournisseurs.', platformAdapter: 'Adaptateur de plateforme', allPlatformsBack: 'Toutes les plateformes', adapterSnapshot: 'Résumé de l’adaptateur', whatConnects: 'Ce que connecte cet adaptateur', prepareIntegration: 'Préparer l’intégration', readiness: 'Préparation', completedSteps: 'étapes terminées', externalBlockers: 'Blocages externes', mediaFormats: 'Médias et formats', mainSources: 'Sources principales', prelaunchChecklist: 'Checklist de pré-lancement', enableAdapter: 'Exigences pour activer l’adaptateur', steps: 'étapes', scopesEligibility: 'Autorisations / éligibilité', accessNeeded: 'Accès requis', authorization: 'Autorisation', credentials: 'Connexion et identifiants', scopesConsider: 'Autorisations à considérer', platformAccess: 'Accès à la plateforme', reviewProduction: 'Revue et production', publishPipeline: 'Pipeline de publication', howPublishes: 'Comment publie l’adaptateur', limitsValidation: 'Limites et validation', conditions: 'Conditions qui bloquent ou modifient la sortie', reliability: 'Fiabilité', reconcile: 'Réconcilier l’état distant', sourceRegister: 'Registre des sources', documentation: 'Documentation officielle', lastReview: 'Dernière revue documentaire', apiAvailable: 'API disponible', apiOffline: 'API hors ligne', checking: 'vérification', reviewed: 'Documentation vérifiée', requirementsMayChange: 'Les exigences et limites peuvent changer ; consultez toujours la documentation officielle.', language: 'Langue', readinessCard: 'Avant la production', fourExternalRequirements: '4 exigences externes', commonReview: 'Commun', metaReview: 'Revue Meta et accès avancé', tiktokReview: 'Audit pour la publication publique', youtubeReview: 'Vérification OAuth et audit API', commonReviewText: 'Confidentialité, consentement et suppression', viewCompleteChecklist: 'Voir la checklist complète', integratorContract: 'Un contrat, quatre adaptateurs', integratorDescription: 'L’intégrateur normalise les connexions et les états tout en conservant les règles propres à chaque réseau.', campaign: 'Campagne', adapter: 'Adaptateur', publishJob: 'Tâche de publication', exploreFlow: 'Explorer le flux', productionCallback: 'Domaine de production et callback HTTPS', privacyTerms: 'Politique de confidentialité et conditions publiques', scopeUseCase: 'Description des autorisations et cas d’usage réel', consentDemo: 'Démo de consentement de bout en bout', deletionFlow: 'Flux de déconnexion et suppression', minimumScopes: 'Autorisations minimales', minimumScopesText: 'Demandez un accès supplémentaire uniquement lorsque la personne active la fonction.', publishingStep1Text: 'Objectif, audience, ton, calendrier et contenu source.', publishingStep2Text: 'L’intégrateur adapte le format, le texte, le CTA et l’emplacement.', publishingStep3Text: 'L’adaptateur vérifie le compte, les autorisations, les médias et les options réelles.', publishingStep4Text: 'La personne confirme la destination, le texte, la confidentialité et le calendrier.', publishingStep5Text: 'File idempotente, transfert asynchrone, webhooks et état vérifiable.', platformTable: 'PLATEFORME', accountAccess: 'COMPTE ET ACCÈS', productionMilestone: 'JALON DE PRODUCTION',
  },
  de: {
    overview: 'Übersicht', connections: 'Verbindungen', requirements: 'Anforderungen', publishing: 'Veröffentlichung', sources: 'Offizielle Quellen', summary: 'Übersicht', auth: 'Zugriff & OAuth', operations: 'Betrieb', socialPublishing: 'Social Publishing', overviewDescription: 'Eine Ansicht der Anforderungen jeder Plattform, bevor ein Konto verbunden oder eine Kampagne veröffentlicht wird.', viewRequirements: 'Anforderungen anzeigen', adapters: 'Adapter', activeConnections: 'Aktive Verbindungen', publishingStatus: 'Veröffentlichungsstatus', preparation: 'Vorbereitung', nextMilestone: 'Nächster Meilenstein', appReviews: 'App-Prüfungen', choosePlatform: 'Plattform auswählen', choosePlatformDescription: 'Öffnen Sie einen Adapter, um Konfiguration, Berechtigungen und den redaktionellen Ablauf zu prüfen.', pending: 'Konfiguration ausstehend', beforeProduction: 'Vor dem Produktivbetrieb', flowExplore: 'Ablauf öffnen', connectedAccounts: 'Verbundene Konten', connectionsDescription: 'Verwalten Sie Identitäten, die von ihren Inhabern autorisiert wurden. Hier sind noch keine Zugangsdaten konfiguriert.', noConnections: 'Keine aktiven Verbindungen', oauthNotice: 'OAuth-Verbindungen sind noch nicht aktiviert. Apps, Callbacks und externe Prüfungen müssen zuerst abgeschlossen werden.', notConnected: 'Nicht verbunden', seeRequirements: 'Anforderungen anzeigen', oauthEmpty: 'Konten erscheinen nach der OAuth-Einwilligung', oauthEmptyDescription: 'Eine Verbindung steht für ein vom Inhaber autorisiertes Konto, nicht für gemeinsame Zugangsdaten.', integrationRequirements: 'Integrationsanforderungen', requirementsDescription: 'Zugangsdaten sind nur ein Teil. Jedes Netzwerk hat eigene Regeln für Eignung, Berechtigungen, Prüfung und externe Nutzung.', allPlatforms: 'Alle Plattformen', commonAdapter: 'Gemeinsame Adapterbasis', controls: 'Kontrollen', appChecklist: 'App-Checkliste', prepareReview: 'Für die Prüfung vorbereiten', publishingFlow: 'Redaktioneller Ablauf mit Freigabe', publishingDescription: 'Die Kampagne ist gemeinsam; jeder Adapter löst Variante, Validierung, Übertragung und Endstatus.', ideaBrief: 'Idee und Briefing', variants: 'Varianten je Netzwerk', validation: 'Validierung', approval: 'Freigabe', publication: 'Veröffentlichung', publicationDifferences: 'Unterschiede bei der Veröffentlichung', adapterRules: 'Jeder Adapter bewahrt die Regeln seines Netzwerks', officialSources: 'Offizielle Quellen', sourcesDescription: 'Anforderungen geprüft am 12. September 2026. Links führen zu Anbieter-Dokumentation, APIs und Richtlinien.', platformAdapter: 'Plattformadapter', allPlatformsBack: 'Alle Plattformen', adapterSnapshot: 'Adapterübersicht', whatConnects: 'Was dieser Adapter verbindet', prepareIntegration: 'Integration vorbereiten', readiness: 'Bereitschaft', completedSteps: 'abgeschlossene Schritte', externalBlockers: 'Externe Blocker', mediaFormats: 'Medien und Formate', mainSources: 'Hauptquellen', prelaunchChecklist: 'Checkliste vor dem Start', enableAdapter: 'Anforderungen zum Aktivieren', steps: 'Schritte', scopesEligibility: 'Berechtigungen / Eignung', accessNeeded: 'Benötigter Zugriff', authorization: 'Autorisierung', credentials: 'Verbindung und Zugangsdaten', scopesConsider: 'Zu prüfende Berechtigungen', platformAccess: 'Plattformzugriff', reviewProduction: 'Prüfung und Produktion', publishPipeline: 'Veröffentlichungs-Pipeline', howPublishes: 'So veröffentlicht der Adapter', limitsValidation: 'Limits und Validierung', conditions: 'Bedingungen, die die Ausgabe blockieren oder ändern', reliability: 'Zuverlässigkeit', reconcile: 'Remote-Status abgleichen', sourceRegister: 'Quellenregister', documentation: 'Offizielle Dokumentation', lastReview: 'Letzte Dokumentationsprüfung', apiAvailable: 'API verfügbar', apiOffline: 'API offline', checking: 'wird geprüft', reviewed: 'Dokumentation geprüft', requirementsMayChange: 'Anforderungen und Limits können sich ändern; konsultieren Sie immer die offizielle Dokumentation.', language: 'Sprache', readinessCard: 'Vor dem Produktivbetrieb', fourExternalRequirements: '4 externe Anforderungen', commonReview: 'Allgemein', metaReview: 'Meta-App-Prüfung und Advanced Access', tiktokReview: 'Audit für öffentliche Veröffentlichung', youtubeReview: 'OAuth-Verifizierung und API-Audit', commonReviewText: 'Datenschutz, Einwilligung und Löschung', viewCompleteChecklist: 'Vollständige Checkliste', integratorContract: 'Ein Vertrag, vier Adapter', integratorDescription: 'Der Integrator vereinheitlicht Verbindungen und Status, bewahrt aber die Regeln jedes Netzwerks für eine sichere Automatisierung.', campaign: 'Kampagne', adapter: 'Adapter', publishJob: 'Veröffentlichungsauftrag', exploreFlow: 'Ablauf öffnen', productionCallback: 'Produktionsdomain und HTTPS-Callback', privacyTerms: 'Öffentliche Datenschutzrichtlinie und Bedingungen', scopeUseCase: 'Berechtigungsbeschreibung und echter Anwendungsfall', consentDemo: 'Einwilligungsdemo von Anfang bis Ende', deletionFlow: 'Trennungs- und Löschablauf', minimumScopes: 'Minimale Berechtigungen', minimumScopesText: 'Fordern Sie zusätzlichen Zugriff erst an, wenn die Person die Funktion aktiviert.', publishingStep1Text: 'Ziel, Zielgruppe, Ton, Zeitpunkt und Ausgangsmaterial.', publishingStep2Text: 'Der Integrator passt Format, Text, CTA und Platzierung an.', publishingStep3Text: 'Der Adapter prüft Konto, Berechtigungen, Medien und verfügbare Optionen.', publishingStep4Text: 'Die Person bestätigt Ziel, Text, Datenschutz und Zeitpunkt.', publishingStep5Text: 'Idempotente Warteschlange, asynchroner Upload, Webhooks und prüfbarer Status.', platformTable: 'PLATTFORM', accountAccess: 'KONTO UND ZUGRIFF', productionMilestone: 'PRODUKTIONSMEILENSTEIN',
  },
  ar: {
    overview: 'نظرة عامة', connections: 'الاتصالات', requirements: 'المتطلبات', publishing: 'النشر', sources: 'المصادر الرسمية', summary: 'ملخص', auth: 'الوصول وOAuth', operations: 'العمليات', socialPublishing: 'النشر الاجتماعي', overviewDescription: 'عرض واحد لفهم ما تتطلبه كل منصة قبل ربط حساب أو نشر حملة.', viewRequirements: 'عرض المتطلبات', adapters: 'الموصلات', activeConnections: 'الاتصالات النشطة', publishingStatus: 'حالة النشر', preparation: 'التحضير', nextMilestone: 'المرحلة التالية', appReviews: 'مراجعات التطبيقات', choosePlatform: 'اختر منصة', choosePlatformDescription: 'افتح موصلاً لمراجعة الإعدادات والصلاحيات والتدفق التحريري.', pending: 'الإعداد قيد الانتظار', beforeProduction: 'قبل الإنتاج', flowExplore: 'استكشف التدفق', connectedAccounts: 'الحسابات المتصلة', connectionsDescription: 'اربط وأدر الهويات التي فوضها أصحابها. لا توجد بيانات اعتماد للمنصات مهيأة في هذه البيئة بعد.', noConnections: 'لا توجد اتصالات نشطة', oauthNotice: 'اتصالات OAuth غير مفعلة بعد. يجب إكمال التطبيقات وعمليات callback والمراجعات الخارجية أولاً.', notConnected: 'غير متصل', seeRequirements: 'عرض المتطلبات', oauthEmpty: 'ستظهر الحسابات بعد موافقة OAuth', oauthEmptyDescription: 'يمثل الاتصال حساباً فوضه صاحبه، وليس بيانات اعتماد مشتركة.', integrationRequirements: 'متطلبات التكامل', requirementsDescription: 'بيانات الاعتماد جزء واحد فقط. لكل شبكة شروط مختلفة للأهلية والصلاحيات والمراجعة والاستخدام الخارجي.', allPlatforms: 'كل المنصات', commonAdapter: 'الأساس المشترك للموصل', controls: 'ضوابط', appChecklist: 'قائمة التطبيق', prepareReview: 'ما يجب تحضيره للمراجعة', publishingFlow: 'تدفق تحريري مع موافقة', publishingDescription: 'الحملة مشتركة؛ ويعالج كل موصل النسخة والتحقق والنقل والحالة النهائية.', ideaBrief: 'الفكرة والموجز', variants: 'نسخ حسب الشبكة', validation: 'التحقق', approval: 'الموافقة', publication: 'النشر', publicationDifferences: 'اختلافات النشر', adapterRules: 'يحافظ كل موصل على قواعد شبكته', officialSources: 'المصادر الرسمية', sourcesDescription: 'تمت مراجعة المتطلبات في 12 سبتمبر 2026. الروابط تقود إلى وثائق ومراجع API وسياسات المزودين.', platformAdapter: 'موصل المنصة', allPlatformsBack: 'كل المنصات', adapterSnapshot: 'ملخص الموصل', whatConnects: 'ما يربطه هذا الموصل', prepareIntegration: 'تحضير التكامل', readiness: 'الجاهزية', completedSteps: 'خطوات تمكين مكتملة', externalBlockers: 'عوائق خارجية', mediaFormats: 'الوسائط والصيغ', mainSources: 'المصادر الرئيسية', prelaunchChecklist: 'قائمة ما قبل الإطلاق', enableAdapter: 'متطلبات تفعيل الموصل', steps: 'خطوات', scopesEligibility: 'الصلاحيات / الأهلية', accessNeeded: 'الوصول المطلوب', authorization: 'التفويض', credentials: 'الاتصال وبيانات الاعتماد', scopesConsider: 'الصلاحيات المقترحة', platformAccess: 'الوصول إلى المنصة', reviewProduction: 'المراجعة والإنتاج', publishPipeline: 'مسار النشر', howPublishes: 'كيف ينشر الموصل', limitsValidation: 'الحدود والتحقق', conditions: 'شروط تمنع أو تغير الناتج', reliability: 'الموثوقية', reconcile: 'مزامنة الحالة البعيدة', sourceRegister: 'سجل المصادر', documentation: 'الوثائق الرسمية', lastReview: 'آخر مراجعة للوثائق', apiAvailable: 'واجهة API متاحة', apiOffline: 'واجهة API غير متصلة', checking: 'جارٍ التحقق', reviewed: 'تمت مراجعة الوثائق', requirementsMayChange: 'قد تتغير المتطلبات والحدود؛ راجع الوثائق الرسمية دائماً.', language: 'اللغة', readinessCard: 'قبل الإنتاج', fourExternalRequirements: '4 متطلبات خارجية', commonReview: 'مشترك', metaReview: 'مراجعة Meta والوصول المتقدم', tiktokReview: 'تدقيق للنشر العام', youtubeReview: 'تحقق OAuth وتدقيق API', commonReviewText: 'الخصوصية والموافقة والحذف', viewCompleteChecklist: 'عرض القائمة الكاملة', integratorContract: 'عقد واحد وأربعة موصلات', integratorDescription: 'يوحد المدمج الاتصالات والحالات مع الحفاظ على قواعد كل شبكة حتى تبقى الأتمتة آمنة.', campaign: 'حملة', adapter: 'موصل', publishJob: 'مهمة نشر', exploreFlow: 'استكشاف التدفق', productionCallback: 'نطاق الإنتاج وHTTPS callback', privacyTerms: 'سياسة الخصوصية والشروط العامة', scopeUseCase: 'وصف الصلاحيات وحالة الاستخدام الفعلية', consentDemo: 'عرض موافقة متكامل', deletionFlow: 'تدفق فصل الحساب وحذف البيانات', minimumScopes: 'الحد الأدنى من الصلاحيات', minimumScopesText: 'اطلب وصولاً إضافياً فقط عندما يفعّل الشخص تلك الوظيفة.', publishingStep1Text: 'الهدف والجمهور والنبرة والتوقيت والمواد المصدرية.', publishingStep2Text: 'يعدل المدمج الصيغة والنص وCTA ومكان العرض.', publishingStep3Text: 'يتحقق الموصل من الحساب والصلاحيات والوسائط والخيارات الفعلية.', publishingStep4Text: 'يؤكد الشخص الوجهة والنص والخصوصية والتوقيت.', publishingStep5Text: 'قائمة انتظار تمنع التكرار، ورفع غير متزامن، وwebhooks، وحالة قابلة للتحقق.', platformTable: 'المنصة', accountAccess: 'الحساب والوصول', productionMilestone: 'مرحلة الإنتاج',
  },
};

const I18nContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (key: string) => string }>({ locale: 'en', setLocale: () => undefined, t: (key) => key });
function useI18n() { return useContext(I18nContext); }

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

const localizedCommonRequirements: Record<Locale, { title: string; text: string }[]> = {
  en: [
    { title: 'Identity and consent', text: 'Backend OAuth, minimum scopes, CSRF state, granular consent, and visible revocation.' },
    { title: 'Public app and review', text: 'Working domain, linked terms and privacy policy, HTTPS callback, and a real-use demo.' },
    { title: 'Credential protection', text: 'Encrypt tokens by tenant/account, keep them out of logs, rotate them, and purge on disconnect.' },
    { title: 'Approved content', text: 'The person confirms account, variant, copy, media, privacy, and timing before publishing.' },
    { title: 'Async operations', text: 'Queue, idempotency, resumable uploads, webhooks/status polling, and transient-only retries.' },
    { title: 'Data and traceability', text: 'Store remote IDs, states, limits, API version, consent, retention, and deletion events.' },
  ],
  es: commonRequirements,
  fr: [
    { title: 'Identité et consentement', text: 'OAuth côté serveur, scopes minimaux, protection CSRF, consentement précis et révocation visible.' },
    { title: 'App publique et validation', text: 'Domaine fonctionnel, conditions et politique de confidentialité, callback HTTPS et démo réelle.' },
    { title: 'Protection des identifiants', text: 'Chiffrer les tokens par compte, les exclure des logs, les renouveler et les supprimer à la déconnexion.' },
    { title: 'Contenu approuvé', text: 'La personne confirme le compte, la variante, le texte, le média, la confidentialité et le moment.' },
    { title: 'Opérations asynchrones', text: 'File, idempotence, uploads reprenables, webhooks/status polling et retries temporaires uniquement.' },
    { title: 'Données et traçabilité', text: 'Conserver les IDs, états, limites, version API, consentement et événements de rétention/suppression.' },
  ],
  de: [
    { title: 'Identität und Einwilligung', text: 'OAuth im Backend, minimale Scopes, CSRF-Schutz, genaue Einwilligung und sichtbarer Widerruf.' },
    { title: 'Öffentliche App und Prüfung', text: 'Funktionierende Domain, verknüpfte Bedingungen und Datenschutz, HTTPS-Callback und echte Demo.' },
    { title: 'Schutz der Zugangsdaten', text: 'Tokens pro Konto verschlüsseln, nicht loggen, rotieren und bei Trennung löschen.' },
    { title: 'Freigegebene Inhalte', text: 'Konto, Variante, Text, Medien, Datenschutz und Zeitpunkt werden vor dem Veröffentlichen bestätigt.' },
    { title: 'Asynchrone Abläufe', text: 'Queue, Idempotenz, fortsetzbare Uploads, Webhooks/Status und Retries nur bei temporären Fehlern.' },
    { title: 'Daten und Nachverfolgbarkeit', text: 'Remote-IDs, Status, Limits, API-Version, Einwilligung sowie Löschereignisse speichern.' },
  ],
  ar: [
    { title: 'الهوية والموافقة', text: 'استخدام OAuth في الخادم، أقل الصلاحيات، حماية CSRF، موافقة واضحة وإلغاء ظاهر.' },
    { title: 'التطبيق والمراجعة', text: 'نطاق فعال، شروط وسياسة خصوصية، استدعاء HTTPS، وتجربة استخدام حقيقية.' },
    { title: 'حماية بيانات الاعتماد', text: 'تشفير الرموز لكل حساب، منعها من السجلات، تدويرها وحذفها عند الفصل.' },
    { title: 'المحتوى المعتمد', text: 'يؤكد المستخدم الحساب والنسخة والنص والوسائط والخصوصية والوقت قبل النشر.' },
    { title: 'العمليات غير المتزامنة', text: 'طابور، منع التكرار، رفع قابل للاستئناف، webhooks وإعادة محاولة للأخطاء المؤقتة فقط.' },
    { title: 'البيانات والتتبع', text: 'حفظ المعرفات والحالات والحدود وإصدار API والموافقة وأحداث الاحتفاظ والحذف.' },
  ],
};

const localizedProviderCopy: Record<Exclude<Locale, 'es'>, { readiness: string; api: string; login: string; scope: string; account: string; access: string; flow: string; media: string[]; constraints: string[]; checklist: string[]; operations: string[] }> = {
  en: { readiness: 'Provider review required', api: 'Connect the professional account and prepare platform-specific publishing through the official API.', login: 'Use the provider OAuth flow with a secure HTTPS callback and backend token exchange.', scope: 'Request only the scopes needed for the account, publishing, and analytics features enabled by the workspace.', account: 'The account owner must authorize the destination account and confirm its publishing eligibility.', access: 'The developer app, privacy policy, terms, redirect URI, and review requirements must be completed before production.', flow: 'Connect → validate eligibility → prepare media → request approval → publish asynchronously → reconcile status.', media: ['Text and links', 'Images and video', 'Short-form video or reels', 'Platform-specific formats'], constraints: ['Eligibility and media limits vary by platform.', 'Remote processing may be asynchronous.', 'Respect rate limits and provider moderation.', 'Never expose credentials in the frontend.'], checklist: ['Create the developer app', 'Configure HTTPS callback', 'Request minimum scopes', 'Complete provider review', 'Test with a QA account', 'Add revocation and deletion'], operations: ['Store remote IDs and original states', 'Use idempotency to prevent duplicate posts', 'Retry only transient failures', 'Record request IDs without secrets'] },
  fr: { readiness: 'Validation du fournisseur requise', api: 'Connectez le compte professionnel et préparez la publication via l’API officielle de la plateforme.', login: 'Utilisez OAuth avec un callback HTTPS sécurisé et un échange de token côté serveur.', scope: 'Demandez uniquement les scopes nécessaires aux fonctions activées dans l’espace de travail.', account: 'Le propriétaire doit autoriser le compte cible et confirmer son éligibilité à la publication.', access: 'L’app, la politique de confidentialité, les conditions, le callback et les validations doivent être prêts avant la production.', flow: 'Connecter → vérifier → préparer le média → approuver → publier de façon asynchrone → réconcilier.', media: ['Texte et liens', 'Images et vidéos', 'Vidéos courtes ou reels', 'Formats propres à la plateforme'], constraints: ['L’éligibilité et les limites varient selon la plateforme.', 'Le traitement distant peut être asynchrone.', 'Respectez les limites et la modération.', 'Ne jamais exposer les identifiants au frontend.'], checklist: ['Créer l’app développeur', 'Configurer le callback HTTPS', 'Demander les scopes minimaux', 'Terminer la validation', 'Tester avec un compte QA', 'Ajouter révocation et suppression'], operations: ['Conserver les IDs et états distants', 'Utiliser l’idempotence', 'Réessayer seulement les erreurs temporaires', 'Journaliser les IDs sans secrets'] },
  de: { readiness: 'Prüfung durch den Anbieter erforderlich', api: 'Verbinden Sie das professionelle Konto und bereiten Sie die Veröffentlichung über die offizielle API vor.', login: 'Nutzen Sie OAuth mit sicherem HTTPS-Callback und Token-Austausch im Backend.', scope: 'Fordern Sie nur Scopes für die im Workspace aktivierten Konto-, Publishing- und Analysefunktionen an.', account: 'Der Kontoinhaber muss das Zielkonto autorisieren und die Veröffentlichungseignung bestätigen.', access: 'App, Datenschutz, Bedingungen, Redirect-URI und Prüfungen müssen vor dem Produktivbetrieb abgeschlossen sein.', flow: 'Verbinden → Eignung prüfen → Medien vorbereiten → Freigabe → asynchron veröffentlichen → Status abgleichen.', media: ['Text und Links', 'Bilder und Videos', 'Kurzvideos oder Reels', 'Plattformspezifische Formate'], constraints: ['Eignung und Medienlimits unterscheiden sich.', 'Remote-Verarbeitung kann asynchron sein.', 'Limits und Moderation beachten.', 'Zugangsdaten nie im Frontend speichern.'], checklist: ['Entwickler-App erstellen', 'HTTPS-Callback konfigurieren', 'Minimale Scopes anfordern', 'Anbieterprüfung abschließen', 'Mit QA-Konto testen', 'Widerruf und Löschung ergänzen'], operations: ['Remote-IDs und Originalstatus speichern', 'Idempotenz gegen Duplikate einsetzen', 'Nur temporäre Fehler erneut versuchen', 'Request-IDs ohne Geheimnisse protokollieren'] },
  ar: { readiness: 'مراجعة المزود مطلوبة', api: 'اربط الحساب المهني وجهّز النشر عبر واجهة API الرسمية للمنصة.', login: 'استخدم OAuth مع استدعاء HTTPS آمن وتبادل الرموز في الخادم.', scope: 'اطلب الصلاحيات اللازمة فقط للميزات المفعلة في مساحة العمل.', account: 'يجب أن يوافق مالك الحساب على الحساب المستهدف ويؤكد أهليته للنشر.', access: 'يجب إعداد التطبيق وسياسة الخصوصية والشروط وعنوان الاستدعاء والمراجعة قبل الإنتاج.', flow: 'ربط → التحقق من الأهلية → تجهيز الوسائط → الموافقة → النشر غير المتزامن → مزامنة الحالة.', media: ['نص وروابط', 'صور وفيديو', 'فيديو قصير أو Reels', 'تنسيقات خاصة بالمنصة'], constraints: ['تختلف الأهلية وحدود الوسائط حسب المنصة.', 'قد تكون المعالجة البعيدة غير متزامنة.', 'احترم الحدود والمراجعة.', 'لا تعرض بيانات الاعتماد في الواجهة.'], checklist: ['إنشاء تطبيق المطور', 'إعداد استدعاء HTTPS', 'طلب أقل الصلاحيات', 'إكمال مراجعة المزود', 'الاختبار بحساب QA', 'إضافة الإلغاء والحذف'], operations: ['حفظ المعرفات والحالات البعيدة', 'استخدام منع التكرار', 'إعادة محاولة الأخطاء المؤقتة فقط', 'تسجيل معرفات الطلب دون أسرار'] },
};

function localizedProviders(locale: Locale) {
  if (locale === 'es') return providers;
  const copy = localizedProviderCopy[locale];
  return providers.map((provider) => ({ ...provider, ...copy, name: provider.name, subtitle: provider.subtitle, links: provider.links }));
}

const sidebarProviders = (['facebook', 'instagram', 'tiktok', 'youtube'] as ProviderId[])
  .map((id) => providers.find((item) => item.id === id))
  .filter((item): item is Provider => Boolean(item));

const sectionLabels: Record<Section, string> = {
  overview: 'Resumen', connections: 'Conexiones', requirements: 'Requisitos', publishing: 'Publicación', sources: 'Fuentes oficiales',
};
const tabLabels: Record<ProviderTab, string> = {
  summary: 'Resumen', requirements: 'Requisitos', auth: 'Acceso y OAuth', publishing: 'Publicación', operations: 'Operación',
};

function Mark({ provider, small = false }: { provider: Provider; small?: boolean }) {
  return <span className={`provider-mark provider-mark--${provider.id}${small ? ' provider-mark--small' : ''}`} style={{ '--brand': provider.color, '--brand-tint': provider.accent } as CSSProperties}>{provider.short}</span>;
}

function AppShell() {
  const { locale, setLocale, t } = useI18n();
  const [section, setSection] = useState<Section>('overview');
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [providerTab, setProviderTab] = useState<ProviderTab>('summary');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [apiHealth, setApiHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const provider = localizedProviders(locale).find((item) => item.id === selected) ?? null;

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
        <nav className="platform-nav" aria-label={t('adapters')}>
          {sidebarProviders.map((item) => <button key={item.id} className={`platform-nav-item${selected === item.id ? ' platform-nav-item--active' : ''}`} onClick={() => openProvider(item.id)}><Mark provider={item} small /><span>{item.name}</span><i className="connection-dot" title="Aún no configurado" /></button>)}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label={t('overview')}>☰</button>
          <div className="breadcrumbs"><span>AI Integrator</span><b>/</b><strong>{provider?.name ?? t(section)}</strong>{provider && <><b>/</b><span>{t(providerTab)}</span></>}</div>
          <div className="topbar-actions"><span className={`api-indicator api-indicator--${apiHealth}`}><i />API {apiHealth === 'online' ? t('apiAvailable') : apiHealth === 'offline' ? t('apiOffline') : t('checking')}</span><span className="research-date"><i /> {t('reviewed')} · 12 sep 2026</span><label className="language-picker"><span>{t('language')}</span><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('language')}>{localeOptions.map((option) => <option key={option.id} value={option.id}>{option.native}</option>)}</select></label><button className="avatar-button" aria-label="Profile">GM</button></div>
        </header>

        <div className="content-wrap">
          {provider ? <ProviderDetail provider={provider} tab={providerTab} setTab={setProviderTab} back={() => setSelected(null)} /> : <>
            {section === 'overview' && <Overview openProvider={openProvider} navigate={navigate} />}
            {section === 'connections' && <Connections openProvider={openProvider} />}
            {section === 'requirements' && <Requirements openProvider={openProvider} />}
            {section === 'publishing' && <Publishing openProvider={openProvider} />}
            {section === 'sources' && <Sources openProvider={openProvider} />}
          </>}
          <footer className="page-footer"><span>GoodMorning · AI Integrator</span><span>{t('requirementsMayChange')}</span></footer>
        </div>
      </main>
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem('gm-locale') as Locale) || 'en');
  const t = (key: string) => translations[locale][key] ?? translations.en[key] ?? key;
  useEffect(() => {
    const direction = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    localStorage.setItem('gm-locale', locale);
  }, [locale]);
  return <I18nContext.Provider value={{ locale, setLocale, t }}><AppShell /></I18nContext.Provider>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}

function Overview({ openProvider, navigate }: { openProvider: (id: ProviderId) => void; navigate: (section: Section) => void }) {
  const { t, locale } = useI18n();
  const localized = localizedProviders(locale);
  return <>
    <PageHeading eyebrow="ADAPTERS / OVERVIEW" title={t('socialPublishing')} description={t('overviewDescription')} action={<button className="button button--primary" onClick={() => navigate('requirements')}><span>⌕</span> {t('viewRequirements')}</button>} />
    <div className="metric-strip"><div className="metric-item"><span className="metric-label">{t('adapters')}</span><strong>04</strong><small>{t('choosePlatform')}</small></div><div className="metric-item"><span className="metric-label">{t('activeConnections')}</span><strong>00 <i className="metric-neutral">/ 4</i></strong><small>{t('pending')}</small></div><div className="metric-item"><span className="metric-label">{t('publishingStatus')}</span><strong className="metric-status"><i /> {t('preparation')}</strong><small>{t('notConnected')}</small></div><div className="metric-item"><span className="metric-label">{t('nextMilestone')}</span><strong className="metric-next">{t('appReviews')}</strong><small>{t('beforeProduction')}</small></div></div>
    <div className="section-title-row"><div><h2>{t('choosePlatform')}</h2><p>{t('choosePlatformDescription')}</p></div><span className="quiet-label">4 {t('adapters').toUpperCase()}</span></div>
    <div className="platform-grid">{localized.map((item, index) => <button key={item.id} className="platform-card" onClick={() => openProvider(item.id)}><div className="card-top"><Mark provider={item} /><span className="card-number">0{index + 1}</span></div><div className="card-copy"><span className="card-subtitle">{item.subtitle}</span><h3>{item.name}</h3><p>{item.api.split('.')[0]}.</p></div><div className="card-status"><i className="connection-dot" /><span>{t('pending')}</span><span className="arrow">↗</span></div></button>)}</div>
    <div className="lower-grid"><section className="panel readiness-panel"><div className="panel-heading"><div><span className="panel-kicker">{t('readiness').toUpperCase()}</span><h2>{t('readinessCard')}</h2></div><span className="pill pill--amber">{t('fourExternalRequirements')}</span></div><div className="readiness-list">{[
      ['Meta', t('metaReview'), 'instagram'], ['TikTok', t('tiktokReview'), 'tiktok'], ['YouTube', t('youtubeReview'), 'youtube'], [t('commonReview'), t('commonReviewText'), 'facebook'],
    ].map(([name, text, id]) => <div className="readiness-row" key={name}><span className="readiness-check">○</span><div><strong>{name}</strong><span>{text}</span></div><button onClick={() => id === 'facebook' ? navigate('requirements') : openProvider(id as ProviderId)} aria-label={`${t('seeRequirements')}: ${name}`}>↗</button></div>)}</div><button className="text-link" onClick={() => navigate('requirements')}>{t('viewCompleteChecklist')} <span>→</span></button></section>
    <section className="panel architecture-panel"><div className="panel-heading"><div><span className="panel-kicker">AI INTEGRATOR</span><h2>{t('integratorContract')}</h2></div><span className="architecture-mark">✳</span></div><p>{t('integratorDescription')}</p><div className="flow-steps"><span>{t('campaign')}</span><b>→</b><span>{t('adapter')}</span><b>→</b><span>{t('publishJob')}</span></div><button className="text-link" onClick={() => navigate('publishing')}>{t('flowExplore')} <span>→</span></button></section></div>
  </>;
}

function Connections({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  const { t, locale } = useI18n();
  const localized = localizedProviders(locale);
  return <><PageHeading eyebrow="ACCOUNTS / CONNECTIONS" title={t('connectedAccounts')} description={t('connectionsDescription')} action={<span className="pill pill--slate">{t('noConnections')}</span>} /><div className="notice notice--blue"><span>i</span><p>{t('oauthNotice')}</p></div><div className="connection-list">{localized.map((item) => <div className="connection-row" key={item.id}><Mark provider={item} small /><div className="connection-name"><strong>{item.name}</strong><span>{item.subtitle}</span></div><span className="pill pill--slate">{t('notConnected')}</span><span className="connection-requirement">{item.readiness}</span><button className="button button--subtle" onClick={() => openProvider(item.id)}>{t('seeRequirements')} <span>→</span></button></div>)}</div><div className="empty-state"><div className="empty-icon">⌁</div><strong>{t('oauthEmpty')}</strong><span>{t('oauthEmptyDescription')}</span></div></>;
}

function Requirements({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  const { t, locale } = useI18n();
  const localized = localizedProviders(locale);
  const common = localizedCommonRequirements[locale];
  return <><PageHeading eyebrow="DEVELOPER SETUP / CHECKLIST" title={t('integrationRequirements')} description={t('requirementsDescription')} /><div className="requirements-layout"><div className="requirements-main"><div className="panel common-panel"><div className="panel-heading"><div><span className="panel-kicker">{t('allPlatforms').toUpperCase()}</span><h2>{t('commonAdapter')}</h2></div><span className="step-total">6 {t('controls')}</span></div><div className="common-grid">{common.map((item, i) => <div className="common-card" key={item.title}><span>0{i + 1}</span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}</div></div><div className="platform-requirement-table"><div className="table-head"><span>{t('platformTable')}</span><span>{t('accountAccess')}</span><span>{t('productionMilestone')}</span><span /></div>{localized.map((item) => <button className="requirement-table-row" key={item.id} onClick={() => openProvider(item.id)}><span className="table-platform"><Mark provider={item} small /><strong>{item.name}</strong></span><span>{item.account}</span><span>{item.readiness}</span><b>↗</b></button>)}</div></div><aside className="panel checklist-aside"><span className="panel-kicker">{t('appChecklist').toUpperCase()}</span><h2>{t('prepareReview')}</h2><p>{t('requirementsDescription')}</p>{[t('productionCallback'), t('privacyTerms'), t('scopeUseCase'), t('consentDemo'), t('deletionFlow')].map((x, i) => <div className="checklist-item" key={x}><span>{i + 1}</span>{x}</div>)}<div className="aside-tip"><strong>{t('minimumScopes')}</strong><span>{t('minimumScopesText')}</span></div></aside></div></>;
}

function Publishing({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  const { t } = useI18n();
  const localized = localizedProviders(useI18n().locale);
  return <><PageHeading eyebrow="CAMPAIGN CORE / PUBLISH FLOW" title={t('publishingFlow')} description={t('publishingDescription')} /><div className="publish-flow">{[
    ['01', t('ideaBrief'), t('publishingStep1Text')], ['02', t('variants'), t('publishingStep2Text')], ['03', t('validation'), t('publishingStep3Text')], ['04', t('approval'), t('publishingStep4Text')], ['05', t('publication'), t('publishingStep5Text')],
    ].map(([num, title, text], index) => <div className="flow-card" key={num}><span className="flow-num">{num}</span><div><h2>{title}</h2><p>{text}</p></div>{index < 4 && <span className="flow-link">→</span>}</div>)}</div><div className="panel capability-panel"><div className="panel-heading"><div><span className="panel-kicker">{t('publicationDifferences').toUpperCase()}</span><h2>{t('adapterRules')}</h2></div></div><div className="capability-grid">{localized.map((item) => <button key={item.id} className="capability-card" onClick={() => openProvider(item.id)}><div><Mark provider={item} small /><strong>{item.name}</strong></div><p>{item.flow}</p><span className="text-link">{t('viewRequirements')} →</span></button>)}</div></div></>;
}

function Sources({ openProvider }: { openProvider: (id: ProviderId) => void }) {
  const { t, locale } = useI18n();
  const localized = localizedProviders(locale);
  return <><PageHeading eyebrow="REFERENCE / OFFICIAL DOCS" title={t('officialSources')} description={t('sourcesDescription')} /><div className="source-platforms">{localized.map((item) => <section className="panel source-panel" key={item.id}><div className="source-heading"><Mark provider={item} small /><div><h2>{item.name}</h2><span>{item.subtitle}</span></div><button className="text-link" onClick={() => openProvider(item.id)}>{t('summary')} →</button></div><div className="source-links">{item.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.label}</span><b>↗</b></a>)}</div></section>)}</div></>;
}

function ProviderDetail({ provider, tab, setTab, back }: { provider: Provider; tab: ProviderTab; setTab: (tab: ProviderTab) => void; back: () => void }) {
  const { t } = useI18n();
  return <>
    <button className="back-link" onClick={back}>← {t('allPlatformsBack')}</button>
    <div className="provider-hero"><div className="provider-title"><Mark provider={provider} /><div><p className="eyebrow">{t('platformAdapter').toUpperCase()}</p><h1>{provider.name}</h1><span>{provider.subtitle}</span></div></div><div className="provider-hero-status"><span className="connection-dot" /><span>{t('pending')}</span><small>{provider.readiness}</small></div></div>
    <div className="provider-tabs" role="tablist" aria-label={`Secciones de ${provider.name}`}>{(Object.keys(tabLabels) as ProviderTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'provider-tab provider-tab--active' : 'provider-tab'} onClick={() => setTab(item)}>{tabLabels[item]}</button>)}</div>
    {tab === 'summary' && <div className="detail-grid"><section className="panel detail-main"><span className="panel-kicker">{t('adapterSnapshot').toUpperCase()}</span><h2>{t('whatConnects')}</h2><p className="detail-lede">{provider.api}</p><div className="detail-facts"><div><span>Identity</span><strong>{provider.account}</strong></div><div><span>{t('authorization')}</span><strong>{provider.login}</strong></div><div><span>{t('publication')}</span><strong>{provider.flow}</strong></div></div><button className="button button--primary" onClick={() => setTab('requirements')}>{t('prepareIntegration')} <span>→</span></button></section><aside className="panel status-panel"><span className="panel-kicker">{t('readiness').toUpperCase()}</span><div className="readiness-score"><strong>0</strong><span>/ {provider.checklist.length}</span></div><p>{t('completedSteps')}</p><div className="progress-track"><span /></div><h3>{t('externalBlockers')}</h3><span className="pill pill--amber">{provider.readiness}</span><small>OAuth account connections are not stored in this dashboard yet.</small></aside><section className="panel media-panel"><div className="panel-heading"><div><span className="panel-kicker">CONTENT TYPES</span><h2>{t('mediaFormats')}</h2></div></div><div className="media-list">{provider.media.map((m) => <div key={m}><span>✓</span>{m}</div>)}</div></section><section className="panel quick-links"><div className="panel-heading"><div><span className="panel-kicker">OFFICIAL DOCS</span><h2>{t('mainSources')}</h2></div><span className="link-count">{provider.links.length}</span></div>{provider.links.slice(0, 3).map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<span>↗</span></a>)}</section></div>}
    {tab === 'requirements' && <div className="requirements-detail"><section className="panel checklist-panel"><div className="panel-heading"><div><span className="panel-kicker">PRE-LAUNCH CHECKLIST</span><h2>Requisitos para habilitar el adaptador</h2></div><span className="pill pill--slate">{provider.checklist.length} pasos</span></div>{provider.checklist.map((item, i) => <div className="large-checklist-row" key={item}><span className="unchecked">○</span><div><strong>{item}</strong><span>{i === 0 ? 'Requisito del proveedor' : i === provider.checklist.length - 1 ? 'Verificación antes de producción' : 'Completar antes de abrir acceso externo'}</span></div><span className="step-index">{String(i + 1).padStart(2, '0')}</span></div>)}</section><aside className="panel scope-panel"><span className="panel-kicker">SCOPES / ELIGIBILITY</span><h2>Acceso necesario</h2><p>{provider.scope}</p><h3>Quién puede conectar</h3><p>{provider.account}</p><div className="notice notice--amber"><span>!</span><p>La aprobación del proveedor no se simula en la UI. Usa este checklist para preparar solicitudes reales.</p></div></aside></div>}
    {tab === 'auth' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">AUTHORIZATION</span><h2>Conexión y credenciales</h2><div className="detail-lede">{provider.login}</div><h3>Scopes a considerar</h3><code className="scope-code">{provider.scope}</code><div className="notice notice--blue"><span>i</span><p>El usuario final autoriza la app con el proveedor. No pedir claves ni guardar credenciales de la cuenta.</p></div></section><section className="panel"><span className="panel-kicker">PLATFORM ACCESS</span><h2>Revisión y producción</h2><p className="detail-lede">{provider.access}</p><div className="access-points"><div><span>01</span><strong>App configurada</strong></div><div><span>02</span><strong>Scopes explicados</strong></div><div><span>03</span><strong>Demo + políticas públicas</strong></div></div></section></div>}
    {tab === 'publishing' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">PUBLISH PIPELINE</span><h2>Cómo publica el adaptador</h2><p className="detail-lede">{provider.flow}</p><div className="media-list">{provider.media.map((m) => <div key={m}><span>↗</span>{m}</div>)}</div></section><section className="panel"><span className="panel-kicker">LIMITS & VALIDATION</span><h2>Condiciones que bloquean o cambian la salida</h2><div className="constraint-list">{provider.constraints.map((item, i) => <div key={item}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></div>)}</div></section></div>}
    {tab === 'operations' && <div className="detail-grid detail-grid--two"><section className="panel"><span className="panel-kicker">RELIABILITY</span><h2>Reconciliar el estado remoto</h2><p className="detail-lede">Representa los estados originales y normalizados. Una respuesta de aceptación no equivale siempre a que el post esté disponible.</p>{provider.operations.map((item) => <div className="ops-row" key={item}><span>✓</span>{item}</div>)}</section><section className="panel"><span className="panel-kicker">SOURCE REGISTER</span><h2>Documentación oficial</h2><div className="source-links">{provider.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><span>{link.label}</span><b>↗</b></a>)}</div><div className="review-date">Última revisión documental: <strong>12 sep 2026</strong></div></section></div>}
  </>;
}

export default App;
