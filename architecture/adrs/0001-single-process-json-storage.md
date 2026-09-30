---
status: accepted
---

# Store link mappings in one JSON file managed by one backend process

## Context and Problem Statement

The [url-creation change](../../openspec/changes/url-creation/proposal.md) requires acknowledged links to survive restart, isolated acceptance storage, and explicit storage-failure responses. The user selected JSON-file persistence without a database. The initial deployment has one backend process and a local filesystem; persistence must remain replaceable behind a storage interface.

## Considered Options

- One versioned JSON snapshot managed by one backend process.
- SQLite with transactional local storage.
- A separately operated database service.

## Decision Outcome

Chosen option: "One versioned JSON snapshot managed by one backend process", because it satisfies the selected deployment model without database provisioning and allows each acceptance run to use an independent directory. This records the user's selected persistence choice.

Store `<STORAGE_DIR>/links.json` as `{ "version": 1, "links": { "<code>": "<destinationUrl>" } }`. Serialize all storage operations through one queue. Each creation validates the current snapshot and replaces it using an exclusively created temporary file in the same directory: write, flush, close, rename, and flush the directory before acknowledging success. Lookups read the current file rather than a persistent memory cache. Explicit initialization creates new storage without overwriting existing data; the service never recreates missing or corrupt storage automatically.

Support one process per storage directory on a local filesystem with atomic replacement and directory flushing. SQLite is a future option if whole-file writes or concurrency requirements exceed this model; a database service adds unnecessary operational dependencies now. See the [design](../../openspec/changes/url-creation/design.md) for failure handling and verification, and the [durability requirements](../../openspec/changes/url-creation/specs/link-creation/spec.md).

### Consequences

- Good, because provisioning, isolation, backup, and restore require only a storage directory, with no database installation.
- Good, because replacement preserves the previous snapshot if a write fails before rename, and fresh reads expose storage outages and operator repairs.
- Bad, because every operation reads the snapshot and every creation rewrites it; cost grows with the number of links and the queue limits throughput.
- Bad, because concurrent backend processes and network filesystems are unsupported; operators must enforce exclusive ownership of the directory.
- Bad, because a failure after rename can persist a link while returning `503`; retrying creation can create another code for the same destination.
