# URL shortener backend

Node.js and Express backend for the URL creation contract. The frontend proxies `/api` and `/s` to this service and supplies its own origin as `PUBLIC_LINK_ORIGIN`.

## Setup and configuration

Use Node.js 22 or later and npm. Verification used Node.js v25.9.0 and npm 11.12.1. Express is the only direct runtime dependency; the lockfile pins the dependency tree. Tests use Node's built-in test runner.

```sh
npm ci
# Equivalent convenience command: npm run setup
export PORT=3100
export PUBLIC_LINK_ORIGIN=http://127.0.0.1:3200
export STORAGE_DIR="$(mktemp -d /tmp/url-shortener-run.XXXXXX)"
npm run storage:init
npm start
```

Allocate distinct available backend and frontend ports before startup. The backend binds only `127.0.0.1`.

| Input | Meaning |
| --- | --- |
| `PORT` | Required integer from 1 through 65535. |
| `PUBLIC_LINK_ORIGIN` | Required absolute HTTP(S) origin, with no credentials, non-root path, query, or fragment. A trailing root slash is normalized. Use the frontend origin for integrated acceptance. |
| `STORAGE_DIR` | Storage directory, resolved at startup; defaults to `./data`. Choose a new directory for each independent run. |

Initialization creates `links.json` exclusively and fails if it already exists, even if it is corrupt. Start does not initialize storage. Preserve `STORAGE_DIR` and its contents across restart; stop the process and run `npm start` again with the same environment. Provision a new directory and initialize it for an isolated run. Runtime data in the default `data/` directory is ignored by Git; keep custom storage outside the repository.

One backend process must exclusively own each storage directory. Use a local filesystem supporting atomic rename and file/directory flushing. Each creation reads and validates a version-1 snapshot, retries random-code collisions, writes an exclusive temporary file, flushes it, closes it, renames it over the snapshot, and flushes the directory before returning success. Operations are serialized. Whole-file reads and writes make this suitable for small deployments. A failure after rename can leave a saved mapping despite a `503`, so retrying can produce another short link.

## API and readiness

```sh
curl -i http://127.0.0.1:3100/health
curl -i -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"https://www.manning.com/books/spec-driven-development?source=short-link#about"}' \
  http://127.0.0.1:3100/api/links
# Copy the code from the returned shortUrl. Do not follow redirects for inspection.
curl -i http://127.0.0.1:3100/s/COPY_CODE_HERE
```

Creation returns `201` and `{shortUrl}` under the configured public origin. Resolution returns `302` with the exact original destination in `Location`. These operations require no authentication, cookies, or credentials. Invalid input returns `400 INVALID_INPUT`; unknown codes return `404 NOT_FOUND` after a successful read; storage failures return `503 STORAGE_UNAVAILABLE`. JSON responses use `application/json`, and errors use `{error:{code,message}}`. Health reads and validates storage and returns `200` or `503`; it does not probe write access. Missing/corrupt storage remains unavailable until repaired or restored, and the running service observes recovery on subsequent requests.

## Genuine storage outage

With the service running, move its active directory to a sibling path. Run these commands in another shell with the same `STORAGE_DIR` value, using the code of a previously created link:

```sh
mv "$STORAGE_DIR" "${STORAGE_DIR}.offline"
curl -i http://127.0.0.1:3100/health
curl -i -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"https://www.manning.com/books/spec-driven-development"}' \
  http://127.0.0.1:3100/api/links
curl -i http://127.0.0.1:3100/s/COPY_CODE_HERE
curl -i http://127.0.0.1:3100/s/unknown
mv "${STORAGE_DIR}.offline" "$STORAGE_DIR"
curl -i http://127.0.0.1:3100/health
curl -i http://127.0.0.1:3100/s/COPY_CODE_HERE
```

All four outage requests return `503`. Restoring storage recovers health to `200` and the known link to its original `302`. Do not reinitialize during an outage. The automated tests additionally remove directory write permission while preserving read access: health remains `200`, creation returns `503`, and restoring write access permits creation again. Run tests as an ordinary user so permission failures are exercised.

## Verification and immutable revision

Tested implementation revision: `3a80eee9e2b65fbc691f554adf034439742fc46e`, retained in this repository's Git history. To verify that exact implementation in a separate checkout:

```sh
git worktree add --detach /tmp/url-shortener-verified 3a80eee9e2b65fbc691f554adf034439742fc46e
cd /tmp/url-shortener-verified
npm ci
npm test
openspec validate url-creation --strict
```

Verification on 2026-09-30: `npm install` installed 68 packages and reported zero vulnerabilities; `npm test` passed all 7 tests with zero failures; `openspec validate url-creation --strict` reported the change valid. Tests require permission to bind localhost ports and write temporary directories. The initial sandbox denied localhost binding; verification passed outside that sandbox.

| Automated case | Verified behavior |
| --- | --- |
| Configuration | Allocated port, public origin normalization, invalid configuration rejection. |
| HTTP contract | HTTP/HTTPS Manning creation, public-origin construction, persisted mapping before `201`, exact path/query/fragment and string preservation, malformed/missing/non-string/empty/malformed/relative/unsupported destination rejection without mutations, JSON statuses/envelopes, unknown codes. |
| Directory outage | Real missing storage produces `503` for health, creation, known and unknown resolution; restoration recovers all operations. |
| Snapshot lifecycle | Existing initialization refused, missing/corrupt/version-invalid storage not recreated, restoration recovers health. |
| Collisions and concurrency | Forced collision retry and 20 concurrent creations retain distinct correct associations. |
| Write failure | Genuine directory permission failure returns `503` despite readable storage; no mapping acknowledged; queue recovers. |
| Restart and isolation | A created link survives an actual child-process stop/start with retained storage, including query/fragment; separately provisioned storage returns `404`. |

Component verification supports frontend integration; application-level browser acceptance requires the frontend delivery as well.
