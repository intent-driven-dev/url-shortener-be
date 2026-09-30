# link-creation Specification

## Purpose

Provide the backend API for generating shareable short links from valid destinations and durably retaining their mappings for later resolution.

## Assumptions

Destination input is ASCII. This assumption does not require special validation or tests.

## Requirements

### Requirement: Create a public short link
The backend SHALL accept `POST /api/links` with `Content-Type: application/json` and a JSON object containing a string `destinationUrl` that is an absolute HTTP(S) URL. After durable storage succeeds, it SHALL return `201` with `Content-Type: application/json` and `{shortUrl}`, where `shortUrl` is an absolute URL under the configured `PUBLIC_LINK_ORIGIN` at `/s/{code}`. The generated code SHALL resolve to its associated destination. This operation SHALL require no authentication, cookies, or credentials.

#### Scenario: Create an HTTPS destination link
- **WHEN** a caller posts `{ "destinationUrl": "https://www.manning.com/books/spec-driven-development" }` and storage is available
- **THEN** the backend returns `201` and JSON containing a public short URL under `PUBLIC_LINK_ORIGIN` at `/s/{code}`
- **AND** the mapping has been durably stored before the success response

#### Scenario: Create an HTTP destination link
- **WHEN** a caller posts `{ "destinationUrl": "http://www.manning.com/books/spec-driven-development" }` and storage is available
- **THEN** the backend returns `201` with a short URL associated with that complete destination

#### Scenario: Generated links retain their associations
- **WHEN** a caller successfully creates links for two different destinations
- **THEN** each returned short URL resolves to its own associated destination

### Requirement: Reject invalid destination input
The backend SHALL reject malformed JSON, a missing or non-string `destinationUrl`, relative URLs, and non-HTTP(S) schemes with `400`, `Content-Type: application/json`, and `{error:{code,message}}`, where `code` is `INVALID_INPUT` and `message` is a human-readable string. Invalid requests SHALL NOT create mappings.

#### Scenario: Malformed JSON
- **WHEN** a caller posts an incomplete JSON body such as `{` to `/api/links`
- **THEN** the backend returns `400` with error code `INVALID_INPUT` and a human-readable message

#### Scenario: Missing destination
- **WHEN** a caller posts `{}` to `/api/links`
- **THEN** the backend returns `400` with error code `INVALID_INPUT`

#### Scenario: Non-string destination
- **WHEN** a caller posts a `destinationUrl` value that is null, numeric, boolean, an array, or an object
- **THEN** the backend returns `400` with error code `INVALID_INPUT`

#### Scenario: Empty or malformed destination
- **WHEN** a caller posts an empty string or a string that is not a valid absolute URL
- **THEN** the backend returns `400` with error code `INVALID_INPUT`

#### Scenario: Relative destination
- **WHEN** a caller posts `{ "destinationUrl": "/books/spec-driven-development" }`
- **THEN** the backend returns `400` with error code `INVALID_INPUT`

#### Scenario: Unsupported destination scheme
- **WHEN** a caller posts a destination using a scheme such as `ftp:`, `mailto:`, or `javascript:`
- **THEN** the backend returns `400` with error code `INVALID_INPUT`

### Requirement: Creation requires durable storage
The backend SHALL acknowledge creation only after its mapping is durably stored. If required storage is unavailable or the durable write fails, it SHALL return `503`, `Content-Type: application/json`, and `{error:{code,message}}`, with code `STORAGE_UNAVAILABLE` and a human-readable string message, instead of a successful short-link response.

#### Scenario: Storage unavailable during creation
- **WHEN** a caller posts a valid destination while required storage is unavailable
- **THEN** the backend returns `503` with error code `STORAGE_UNAVAILABLE`
- **AND** it does not return a successful short-link response

#### Scenario: Durable write fails
- **WHEN** a caller posts a valid destination and the mapping cannot be durably written
- **THEN** the backend returns `503` with error code `STORAGE_UNAVAILABLE` rather than `201`

### Requirement: Successful mappings survive restart
The backend SHALL retain mappings for successfully created links across backend restart when restarted with the same storage. It SHALL preserve the complete destination, including its path, query, and fragment.

#### Scenario: Resolve a link after backend restart
- **WHEN** a link for `https://www.manning.com/books/spec-driven-development?source=short-link#about` is successfully created and the backend is restarted using the same storage
- **THEN** following that short link returns a redirect to `https://www.manning.com/books/spec-driven-development?source=short-link#about`
