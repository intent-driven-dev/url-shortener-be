## 1. Setup

- [ ] 1.1 Add Node.js/Express dependencies, package metadata, a lockfile, and install, storage-initialization, start, and test scripts; configure `PORT`, `PUBLIC_LINK_ORIGIN`, and `STORAGE_DIR` and listen on `127.0.0.1`.

## 2. Persistence

- [ ] 2.1 Provision and load isolated version-1 JSON storage without overwriting existing data or automatically recreating missing/corrupt storage; serialize operations and retain mappings across restart using the accepted temporary-file write, flush, close, rename, and directory-flush approach.

## 3. Creation

- [ ] 3.1 Implement `POST /api/links`: validate required input, generate codes with collision retries, preserve destination strings, save mappings before returning `201` with `{shortUrl}`, and construct public URLs under `PUBLIC_LINK_ORIGIN`; return `400 INVALID_INPUT` or `503 STORAGE_UNAVAILABLE` in the accepted JSON error envelope as applicable.

## 4. Resolution

- [ ] 4.1 Implement `GET /s/{code}` with exact `302 Location` redirects, `404 NOT_FOUND` for unknown codes after a successful read, and `503 STORAGE_UNAVAILABLE` for storage failures using the accepted JSON error envelope.

## 5. Health

- [ ] 5.1 Implement `GET /health` by reading storage and returning `200` on success or `503` on failure.

## 6. Boundary verification

- [ ] 6.1 Verify HTTP/HTTPS creation, required invalid inputs, response statuses and JSON envelopes, public-origin construction, unknown codes, genuine storage failures and recovery, exact destination preservation including query/fragment, restart survival, storage isolation, and health behavior.

## 7. Delivery

- [ ] 7.1 Document setup, dependencies, configuration, isolated storage provisioning/retention, genuine outage simulation, and the tested immutable implementation revision with verification commands/results; ignore runtime data and run strict OpenSpec validation.
