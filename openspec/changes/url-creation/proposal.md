## Why

Visitors need shareable short URLs that reliably resolve to their destinations, including after the backend restarts. [INT-58 — Implement URL creation backend](https://linear.app/intent-driven-dev/issue/INT-58/implement-url-creation-backend-backend) supplies the accepted backend contract needed to deliver the application's URL creation flow with the frontend component.

## What Changes

- Introduce `POST /api/links` accepting JSON `{destinationUrl}` for absolute HTTP(S) destinations. Return `201` with JSON `{shortUrl}` only after the code-to-destination mapping is durably stored; construct public links under `PUBLIC_LINK_ORIGIN` at `/s/{code}`.
- Reject malformed JSON, missing or non-string destinations, relative URLs, and non-HTTP(S) schemes with `400` and error code `INVALID_INPUT`.
- Introduce `GET /s/{code}` returning `302` with the complete stored destination in `Location`, preserving its path, query, and fragment. Return `404` with `NOT_FOUND` for unknown codes.
- Preserve successful mappings across backend restarts using storage that can be isolated for each acceptance run. Return `503` with `STORAGE_UNAVAILABLE` when creation or resolution cannot access required storage.
- Use JSON error envelopes `{error:{code,message}}` and `Content-Type: application/json` for JSON responses.
- Expose storage-aware `GET /health`, returning `200` when storage can be read and `503` otherwise. Support the allocated `PORT`, listen on `127.0.0.1`, and accept the frontend origin through `PUBLIC_LINK_ORIGIN`.
- Provide component verification and delivery instructions covering installation, startup, configuration, isolated durable storage, restart survival, genuine storage unavailability, and an immutable implementation revision.

Expiry, accounts, analytics, link management, custom aliases, browser UI, and frontend proxying are outside this change. The component design uses Node.js, Express, and isolated JSON-file storage as recorded in the accepted ADR. Destination input is assumed to be ASCII; no special ASCII validation is required.

## Capabilities

### New Capabilities

- `link-creation`: Validate destination input, generate short codes, durably store mappings, and return public links through the accepted creation API.
- `link-resolution`: Resolve stored short codes to redirects preserving the complete destination, including unknown-code and storage-failure behavior.
- `backend-readiness`: Expose storage-aware health and support the addressing, configuration, and storage lifecycle required by integrated acceptance.

### Modified Capabilities

None. This repository currently has no existing capability specifications.

## Impact

This introduces the backend service, durable storage integration, component tests, and setup documentation in this repository. The frontend delivery tracked by [INT-59](https://linear.app/intent-driven-dev/issue/INT-59/implement-url-creation-frontend-frontend) consumes `/api/links` and `/s/{code}` through its same-origin proxy and supplies the public origin used in generated links.

The accepted application component split/proxy and durability agreements govern these interfaces; incompatible contract changes require application-level coordination. Integrated acceptance remains in the application specification repository and requires both components. No data migration is required for this new application, and runtime dependencies and setup commands will be added during implementation.
