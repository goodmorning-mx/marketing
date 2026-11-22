# Marketing Adapters compatibility contract

`marketing-adapters-189869c.openapi.json` is the OpenAPI document generated from
`goodmorning-mx/marketing` source revision
`189869cf7f934750f35e700bd7b0bb431be018f5`, with `APP_NAME` set to the live API
title. It is a source reference only; it does not identify the currently running
Coolify revision.

To compare the live API and the checked-out backend source, from this repository:

```sh
cd backend
PYTHONPATH=. python scripts/check_adapters_compatibility.py
```

The checker uses `curl` with certificate verification enabled. It compares
method/path operations, operation-level parameter/request/response definitions,
path-level parameters, and OpenAPI components (including schemas). A mismatch
prints removed, added, or changed operations/components and exits nonzero. To
use a previously fetched live spec, pass
`--live-openapi-file /path/to/openapi.json`.

On the account PR source, this check is expected to fail for the historical
Adapters comparison: that source currently has no Marketing Adapters routes.
Keep the check failing until the serving backend is confirmed and reconciled;
then require a passing comparison before merging.
