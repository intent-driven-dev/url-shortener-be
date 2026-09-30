## Context

See [proposal.md](proposal.md) for motivation and the [creation](specs/link-creation/spec.md), [resolution](specs/link-resolution/spec.md), and [readiness](specs/backend-readiness/spec.md) specifications for the accepted contract. This is a new backend with no existing application data to migrate. The user selected JavaScript with Node.js and Express, and one JSON file managed by one backend process without a database.

## Goals / Non-Goals

**Goals:** Make durable acknowledgement, exact destination preservation, storage outage detection and recovery, and isolated acceptance runs explicit. Separate HTTP, link behavior, and persistence so storage can change without changing the API.

**Non-Goals:** Cross-process writers, network filesystems, unbounded-scale storage, and automatic repair or recreation of damaged storage. The feature exclusions remain those in the proposal.

## Decisions

### Runtime and boundaries

Use JavaScript and Express 5 for routing, JSON parsing, and centralized error handling; use Node's filesystem, crypto, and test modules. Express provides the needed HTTP boundary with little application infrastructure compared with hand-written HTTP parsing or a larger framework. Its [migration documentation](https://expressjs.com/en/guide/migrating-5/) describes the Node runtime requirement. Implementation delivery will pin a supported Node release and Express dependency through the package metadata and lockfile.

Separate configuration/startup, the Express application, link validation and code generation, and a storage adapter exposing initialization, create, lookup, and health operations. Tests may inject filesystem operations and randomness through these internal boundaries; expose no product test endpoints. Convert storage failures into a typed internal error handled as `503` without exposing paths or filesystem diagnostics to callers.

### Persistent snapshot and explicit provisioning

Follow [ADR 0001](../../../architecture/adrs/0001-single-process-json-storage.md), which records the accepted persistence model and alternatives. Resolve `STORAGE_DIR` once at startup, defaulting to `./data` relative to the startup working directory. Use `<STORAGE_DIR>/links.json` with this schema:

```json
{ "version": 1, "links": { "<code>": "<destinationUrl>" } }
```

Validate the entire snapshot on every read: object envelope, supported version, object mapping, valid generated-code keys, and string HTTP(S) destinations. Use own-property lookup to avoid inherited keys being treated as mappings. Reject missing, unreadable, malformed, or unsupported snapshots as unavailable, retaining the original bytes for operator repair.

Provide a separate initialization command that creates the directory and exclusively creates an empty snapshot, flushes and closes it, and flushes the directory. It must never overwrite an existing snapshot; existing valid storage can be reported as already initialized, while invalid storage fails. Initialization runs only during provisioning, with the service stopped. Startup and request handling never create missing storage. Unlike implicit bootstrapping, this preserves evidence of accidental deletion and makes outage simulation meaningful.

### Serialized durable creation

Use one queue for all storage operations, including lookups and health checks. A rejected operation must not poison the queue; subsequent requests must retry against the filesystem. Node's [filesystem documentation](https://nodejs.org/api/fs.html) cautions against overlapping writes, so await every operation and serialize the complete read-modify-replace sequence rather than only its write step.

For each valid creation:

1. Read and validate the current snapshot inside the queue.
2. Generate 12 cryptographically random bytes encoded as base64url, producing a 16-character code. Retry collisions against own keys in that snapshot. Repeated destinations get new codes; no destination deduplication index is needed.
3. Add the mapping, preserving the submitted validated destination string.
4. Exclusively open a unique temporary file in the same directory, write the complete updated snapshot, flush the file, and close it.
5. Atomically rename the temporary file over `links.json`, then open, flush, and close the containing directory. Return success only when the sequence completes.

Before rename, any failure leaves the previous snapshot intact. Close handles and best-effort remove the operation's own temporary file on failure without hiding the original error. Never promote leftover temporary files on startup; operators may remove them while the service is stopped. A failure after rename, including directory flushing, returns `503` even though the new mapping may exist. Do not attempt to roll back a replacement whose durability is uncertain. Creation retries may therefore create additional links.

### Fresh lookup and storage-aware health

Lookups read and validate `links.json` each time, rather than retaining a process-wide cache. Return `404` only after a successful storage read proves the code absent; storage failure returns `503` even for an unknown code. For known codes, explicitly set `Location` to the complete stored string and return `302`, avoiding redirect helpers that may transform the destination.

Health validates the current snapshot and performs an exclusive temporary-file write, flush, close, delete, and directory-flush probe in the storage directory through the queue. Return `200` only after the probe completes; any failure returns `503`. A readable snapshot alone does not prove creation is usable. Probe cleanup must not touch the snapshot or other operations' files.

Keep HTTP listening during storage outages, including unavailable storage at startup. Invalid configuration prevents listening, but storage failure does not. Subsequent operations retry fresh filesystem access, enabling recovery when the original directory or repaired snapshot is restored.

### Input, addressing, and HTTP errors

Require `PORT` as an integer TCP port from 1 through 65535 and `PUBLIC_LINK_ORIGIN` as an absolute HTTP(S) origin. Reject credentials, non-root paths, queries, and fragments; allow a trailing root slash and normalize to the parsed origin. Validate configuration before listening on `127.0.0.1`. Construct links from that configured origin and `/s/{code}`, never from request headers or the backend address.

Parse JSON at the HTTP boundary and require an object containing a string `destinationUrl`. Validate it as an absolute HTTP(S) URL with a host using Node's URL parser, without a base URL. Retain the original validated string, including path, query, and fragment, instead of storing a reserialized URL. Reject raw control characters that cannot safely appear in a redirect header. Do not fetch destinations.

Preserve the specified responses: `POST /api/links` returns `201` and `{shortUrl}` only after durable storage succeeds; invalid JSON or destination input returns `400` with `INVALID_INPUT`; unknown codes return `404` with `NOT_FOUND`; storage failures return `503` with `STORAGE_UNAVAILABLE`. JSON responses use `Content-Type: application/json` and errors use `{error:{code,message}}` with human-readable messages. Validate input before accessing storage so invalid requests never create mappings.

### Verification and delivery

Use Node's test runner for component and storage tests. Cover valid HTTP and HTTPS destinations, malformed JSON and all specified invalid inputs, exact redirects with path/query/fragment, independent associations, unknown codes, public-origin construction, and concurrent creations with no lost mappings. Test forced random collisions and repeated destinations.

Use isolated temporary directories for storage tests. Verify restart survival using a stopped and restarted backend process with the same directory; prove another directory does not expose those mappings. Test missing files/directories, corrupt snapshots, unsupported versions, and recovery after repair or restoration. Inject failures at write, file flush, close, rename, and directory flush. Verify failures before replacement retain the prior snapshot and no failed durable operation returns `201`; explicitly cover post-rename uncertainty and queue recovery.

Exercise a genuine filesystem outage through HTTP: with the service running and a known code saved, temporarily move its storage directory to a sibling path. Health, valid creation, known-code lookup, and unknown-code lookup must return `503`. Restore the directory to its original path and verify health and resolution recover without restarting. Use this instead of permission-only simulations that privileged processes can bypass.

Implementation delivery will document installation, initialization, startup, dependencies and pinned runtime, required `PORT` and `PUBLIC_LINK_ORIGIN`, optional `STORAGE_DIR`, listening address, readiness, isolated storage retention, the outage procedure, and verification commands/results. Ignore default runtime data and temporary artifacts in Git; keep operator-selected storage outside tracked source files. Record a reachable full Git commit SHA or immutable revision tested once implementation is delivered.

## Risks / Trade-offs

- [Snapshot size and serialized throughput grow with link count] → Keep the initial deployment small and preserve the storage boundary for later replacement.
- [Two processes can overwrite each other's snapshots] → Operate exactly one backend process per directory; initialization, restore, and manual repair happen with that process stopped.
- [Durability depends on filesystem rename and flush semantics] → Support a local filesystem with same-directory atomic replacement and directory flushing; unsupported operations fail rather than weakening acknowledgement guarantees.
- [A post-rename failure or lost response makes creation outcome uncertain] → Return `503` on failed durability operations and document that retries can create another link.
- [Corruption or deletion prevents all lookups] → Preserve damaged storage, expose `503`, and restore a validated backup rather than silently starting empty.
- [Health is a point-in-time check] → Each request independently reads storage and handles failures; health does not reserve future capacity.

## Migration Plan

No data migration is needed. During implementation, add the package metadata, initialization/start commands, tests, and operator documentation. Provision an isolated directory, initialize once, configure the allocated addresses, start the sole backend process, and verify health and the component contract before integrated acceptance.

Back up by stopping the process and copying the validated `links.json` snapshot. Restore by stopping the process, replacing storage with a validated version-1 backup, and restarting with the same directory. Roll back application code only to a revision compatible with the stored schema; retain the directory and acknowledged mappings. Do not rerun initialization to repair an outage.
