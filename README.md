# GoodMorning Marketing Adapters

Dashboard de AI Integrator para planear y operar adaptadores de publicación orgánica en Facebook Pages, Instagram, TikTok y YouTube. Presenta requisitos de cuentas, OAuth, permisos, revisiones, medios, estados y fuentes oficiales; no afirma que haya cuentas conectadas ni que las apps de plataforma estén aprobadas.

## Producto

Micro Campaña convierte una idea en variantes editoriales por red, revisa que cada pieza y cuenta sean elegibles y somete la publicación a aprobación de la persona. Este primer corte entrega un dashboard navegable y una referencia técnica de requisitos. Las integraciones OAuth reales, colas de publicación, webhooks y credenciales aún requieren configuración e implementación por plataforma.

## Dashboard

- **Resumen:** cuatro adaptadores, estado de preparación y próximos hitos externos.
- **Conexiones:** estados vacíos honestos hasta implementar OAuth.
- **Requisitos:** checklist común y diferencias por proveedor.
- **Publicación:** flujo editorial común con pasos propios de cada adaptador.
- **Fuentes oficiales:** enlaces directos a documentación, políticas y referencias API.

La ficha de cada plataforma tiene tabs para resumen, requisitos, acceso/OAuth, publicación y operación. La investigación completa está en [`docs/platform-requirements.md`](docs/platform-requirements.md). Meta publishing remains explicitly blocked until `META_CLIENT_ID`, `META_CLIENT_SECRET`, a secure redirect URI, and Meta App Review are configured.

## Stack y desarrollo

- React, TypeScript y Vite en `frontend/`.
- FastAPI, PostgreSQL y Alembic as the full-stack foundation. The Phase 3 API persists brands, campaign briefs, content variants, platform connections, and publishing jobs.
- Coolify despliega frontend, API y PostgreSQL como recursos independientes.

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

Para ejecutar el stack completo en local, sigue [docs/development.md](docs/development.md). La configuración remota y los dominios están descritos en [docs/deployment.md](docs/deployment.md).

## Contrato de integración previsto

Los adaptadores deberán exponer capacidades por cuenta y distinguir autenticación, elegibilidad, aprobación de app, límites y estado de publicación. La orquestación común deberá ofrecer validación previa, aprobación explícita, trabajos idempotentes, estado remoto, reintentos clasificados, revocación y borrado; cada conector conserva sus requisitos y errores originales.

No se deben guardar contraseñas sociales ni registrar tokens en logs. Los tokens OAuth se almacenarán cifrados en backend y separados por tenant y cuenta. Las credenciales reales se configuran fuera del repositorio y fuera del frontend.

## Ramas y releases

`dev` es integración; `main` es producción. Crear ramas de trabajo desde `dev`, abrir PR a `dev` y promover a `main` con PR de release después de pasar checks. No hacer push directo a `main`.
