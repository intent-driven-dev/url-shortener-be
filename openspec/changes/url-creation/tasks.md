## 1. Runtime and configuration

- [ ] 1.1 Add JavaScript package metadata, Express 5, a lockfile, a pinned supported Node runtime, and install/start/test scripts; verify a clean dependency installation and that the documented runtime can run the test command.
- [ ] 1.2 Separate configuration/startup, HTTP, link behavior, and storage modules with injectable filesystem and randomness boundaries; verify the module structure exists and imports without starting a listener.
- [ ] 1.3 Validate required PORT (1–65535) and PUBLIC_LINK_ORIGIN (HTTP(S) origin without credentials, non-root path, query, or fragment), normalize a root trailing slash, and resolve optional STORAGE_DIR with default ./data; verify configuration tests cover accepted values, rejected values, and startup failure before listening for invalid configuration.

## 2. Snapshot provisioning and reads

- [ ] 2.1 Implement version-1 links.json snapshot validation with own-property lookups, generated-code keys, and valid HTTP(S) destination strings; verify valid snapshots load and malformed, unsupported, or invalid mappings fail without modifying their bytes.
- [ ] 2.2 Implement a separate initialization command that creates the directory and exclusively provisions, flushes, and closes an empty snapshot and flushes its directory; verify fresh initialization succeeds, existing valid storage is retained, and existing invalid storage fails without overwrite.
- [ ] 2.3 Implement a recoverable queue for all storage operations and fresh snapshot reads for every lookup; verify concurrent operations serialize, missing or unreadable storage raises a storage error, absent mappings are distinguished from failed reads, and a failed operation does not prevent later recovery.

## 3. Durable creation and health

- [ ] 3.1 Generate codes from 12 cryptographically random bytes encoded as base64url and retry collisions against existing own keys; verify forced collisions retry, repeated destinations get distinct codes, and mappings retain their complete original destination strings.
- [ ] 3.2 Implement queued read-modify-replace creation using an exclusive unique same-directory temporary file, awaited write/flush/close, atomic rename, and directory flush/close before success; verify concurrent creations lose no mappings and injected write, file-flush, close, and rename failures retain the previous snapshot.
- [ ] 3.3 Clean up only the operation's own temporary file and handles on failure, preserve the original error, and never promote leftover files or roll back an uncertain replacement; verify injected directory-flush failures report failure after rename, subsequent operations recover, and unrelated temporary files remain untouched.
- [ ] 3.4 Implement queued health validation plus a temporary-file write/flush/close/delete and directory-flush probe; verify healthy storage succeeds, read or probe failures fail health, and probes never alter acknowledged mappings.

## 4. HTTP behavior

- [ ] 4.1 Implement POST /api/links JSON parsing and destination validation before storage access, preserving the submitted absolute HTTP(S) string and rejecting unsafe raw control characters without fetching destinations; verify malformed JSON, missing/non-string/empty/malformed/relative/non-HTTP(S) destinations return 400 INVALID_INPUT and create no mappings.
- [ ] 4.2 Return 201 JSON {shortUrl} only after durable creation, constructing /s/{code} under configured PUBLIC_LINK_ORIGIN, and translate storage errors to 503 STORAGE_UNAVAILABLE; verify HTTP and HTTPS creation, distinct destination associations, configured-origin use despite request headers, JSON envelopes/content types, and failed writes never returning 201.
- [ ] 4.3 Implement GET /s/{code} with an explicitly set exact Location header and 302 for known codes, JSON 404 NOT_FOUND only after a successful absent lookup, and JSON 503 STORAGE_UNAVAILABLE for failed reads; verify path/query/fragment preservation and both known and unknown lookups during outages without requiring credentials.
- [ ] 4.4 Expose GET /health and listen on 127.0.0.1 at configured PORT while keeping HTTP available when storage is unavailable at startup or later; verify 200/503 readiness and recovery on later requests without restarting or silently recreating storage.

## 5. Process and filesystem integration

- [ ] 5.1 Add process-level tests that create a link, stop and restart the backend with retained storage, and start another backend with separately initialized storage; verify exact redirects survive restart and isolated runs do not expose each other's mappings.
- [ ] 5.2 Exercise a real HTTP storage outage by moving the active storage directory to a sibling path and restoring it; verify health, valid creation, known lookup, and unknown lookup return 503 during the outage and health/resolution recover after restoration without restart.
- [ ] 5.3 Exercise missing snapshots, corrupt snapshots, unsupported versions, and repaired/restored storage through HTTP; verify original corrupt bytes are retained, failures use the specified envelopes, and fresh reads detect repair without a persistent cache.

## 6. Operator documentation and delivery

- [ ] 6.1 Document installation, pinned runtime/dependencies, initialization, startup, required and optional configuration, loopback addressing, readiness, isolated storage retention, and one-process local-filesystem operation; verify the documented commands provision and start a fresh isolated instance.
- [ ] 6.2 Document stopped-process backup/restore, compatible rollback, leftover temporary-file handling, genuine outage simulation, and possible persisted mappings after failed acknowledgement or lost responses; add Git ignores for default runtime data and temporary artifacts and verify runtime files remain untracked.
- [ ] 6.3 Run the complete component verification suite and strict OpenSpec validation, and record commands/results with the reachable full Git SHA or immutable implementation revision tested; verify delivery evidence covers valid creation, invalid input, unknown codes, durable write failures, exact destinations, concurrency, outages/recovery, isolation, and restart survival.
