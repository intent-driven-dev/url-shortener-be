## Context

The [proposal](proposal.md) and the [creation](specs/link-creation/spec.md), [resolution](specs/link-resolution/spec.md), and [readiness](specs/backend-readiness/spec.md) specifications define the accepted backend contract. The backend uses JavaScript, Node.js, Express, and JSON-file persistence without a database. Backend implementation remains pending.

## Goals / Non-Goals

**Goals:** Create public short links, resolve them to exact destinations, and retain acknowledged mappings across restart with isolated storage for each acceptance run.

**Non-Goals:** Expiry, accounts, analytics, link management, custom aliases, frontend UI/proxying, multiple processes sharing storage, and network filesystems.

## Decisions

### Runtime and configuration

Use Node.js and Express with install, storage-initialization, start, and test scripts. Keep configuration, HTTP behavior, and persistence separate. Listen on `127.0.0.1` at the supplied `PORT`; require an integer port from 1 through 65535. Require `PUBLIC_LINK_ORIGIN` to be an absolute HTTP(S) origin without credentials, a non-root path, query, or fragment; normalize a trailing root slash. Construct public links as `<PUBLIC_LINK_ORIGIN>/s/{code}`. Resolve optional `STORAGE_DIR` at startup, defaulting to `./data`.

### Isolated JSON persistence

Reuse [ADR 0001](../../../architecture/adrs/0001-single-process-json-storage.md). One backend process owns one local storage directory. Store `<STORAGE_DIR>/links.json` as:

```json
{ "version": 1, "links": { "<code>": "<destinationUrl>" } }
```

Provide explicit initialization that creates fresh storage without overwriting existing data. Load and validate the current snapshot for storage operations; do not automatically recreate missing or corrupt storage. Serialize storage operations through one queue. For creation, generate a random code, retry collisions, and save the original destination using an exclusively created temporary file in the same directory: write, flush, close, rename over the snapshot, then flush the directory before acknowledging success. Repeated destinations may receive different codes.

Lookups read the current snapshot and distinguish an absent code from a failed storage read. Retain the same directory across restart; provision a separate directory for each isolated run. A failed durable write returns `503`; a failure after rename may leave a persisted mapping despite the failed acknowledgement, so retries can create another link.

### Creation and resolution

Accept `POST /api/links` with JSON `{destinationUrl}`. Require a string containing a valid absolute HTTP(S) URL with a host, parsed without a base URL. Reject malformed JSON, missing/non-string/empty/malformed destinations, relative URLs, and other schemes before saving mappings. Destination input is assumed to be ASCII; no special ASCII validation or tests are required. Preserve the original validated string without reserializing or fetching it.

Return `201` with `{shortUrl}` only after durable storage succeeds. Return `400` with `INVALID_INPUT` for invalid input. For `GET /s/{code}`, explicitly set the exact stored destination as `Location` and return `302`, preserving path, query, and fragment. Return `404` with `NOT_FOUND` only when a successful read finds no mapping. Creation or resolution storage failures return `503` with `STORAGE_UNAVAILABLE`. JSON responses use `Content-Type: application/json`; errors use `{error:{code,message}}` with a human-readable message. These endpoints require no authentication, cookies, or credentials.

### Storage-read health

`GET /health` reads the current storage snapshot. Return `200` when the read succeeds and `503` when it fails; the body is unspecified. Health does not perform a temporary-file write probe. Keep HTTP available during storage outages so health and requests can report failures and subsequent reads can observe restored storage.

### Boundary verification and delivery

Verify HTTP and HTTPS Manning destinations, the required invalid inputs, unknown codes, exact destination preservation including query and fragment, and configured public-origin construction. Verify genuine storage failures through HTTP by moving the active storage directory to a sibling path, then restoring it: health, valid creation, and both known/unknown resolution return `503` during the outage, and health/resolution recover afterward. Verify acknowledged links survive a process restart with retained storage and are absent from a separately provisioned run.

Document setup, dependencies, configuration, storage initialization and retention, outage simulation, verification commands/results, and the reachable full Git SHA or immutable implementation revision tested. Ignore runtime data. These are implementation deliverables; this change currently updates specification artifacts only.

## Risks / Trade-offs

- Whole-file reads and writes grow with link count; the initial deployment remains small and persistence stays behind a replaceable boundary.
- Local durable replacement requires one process per directory and filesystem support for atomic rename and directory flushing.
- Storage deletion or corruption prevents resolution until storage is restored; the service reports `503` instead of silently starting empty.
- A successful health read is a point-in-time observation and does not guarantee a later write will succeed.

## Migration Plan

No existing data needs migration. During implementation, add dependencies, scripts, tests, and setup documentation. Initialize isolated storage, configure the allocated addresses, start the backend, and verify the contract. Retain storage when restarting the backend.
