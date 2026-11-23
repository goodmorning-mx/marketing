# GoodMorning Marketing

Clean starting point for a general-purpose marketing automation platform.

The repository keeps the Factory deployment shape: a frontend application, a
backend API, and a private PostgreSQL resource managed outside Git.

## Social platform logos

For future social platform logo changes, follow the [social platform logo usage guide](frontend/assets/brand/social/USAGE.md). Its scope excludes GoodMarketing's own logo and customer-uploaded company logos.

## Frontend language and account status

- Public frontend pages must be available in English and Spanish.
- Keep the product name GoodMarketing unchanged in every language.
- Use the shared language selector and provide English and Spanish copy for all
  visitor-facing text. The selected language is shared between routes in the
  browser.
- The sign-up route is an early access demo request, not account registration.
- Early access is limited. A submitted request is stored for review; follow-up
  is handled by the team, and a request does not guarantee access.
- Pricing remains undecided until plan and price information is set.

## Early access requests

The bilingual `/signup/` form submits completed requests to the API and stores
them in the existing private PostgreSQL database. The bilingual `/admin/` page
lets authorized staff search requests, mark them as qualified or otherwise,
and keep internal notes. The API creates its additive `demo_requests` table
when the first request or admin list is handled.

Configure `ADMIN_USERNAME` and `ADMIN_PASSWORD` as secret environment values on
the API service before using `/admin/`. The admin API fails closed when either
value is missing. Do not put these values in Git or the frontend. `DATABASE_URL`
must point to the private PostgreSQL resource, and `CORS_ORIGINS` must include
the deployed frontend origin. The API has no email delivery integration; staff
can follow up using the contact details shown in the admin page.

## Customer accounts

Customer account activation is invitation-only at `/activate/`; customers sign
in at `/login/`. `/signup/` remains the public demo-request form. See
[`docs/accounts.md`](docs/accounts.md) for the gm-auth pin, DEV runtime
configuration, additive migrations, staff invitation workflow, permissions, and
rollback instructions. Do not add real secrets or invitation links to Git.
