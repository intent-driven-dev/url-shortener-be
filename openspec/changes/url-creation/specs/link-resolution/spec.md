## Purpose

Resolve generated short-link codes to their stored destinations while preserving complete destination URLs and reporting lookup failures consistently.

## ADDED Requirements

### Requirement: Redirect known short links
The backend SHALL serve `GET /s/{code}` without authentication, cookies, or credentials. For a known code, it SHALL return `302` with a `Location` header containing the complete stored destination, preserving its path, query, and fragment.

#### Scenario: Follow a generated short link
- **WHEN** a caller requests `/s/{code}` for a successfully created link
- **THEN** the backend returns `302` with `Location` equal to the associated destination

#### Scenario: Preserve the full destination
- **WHEN** a caller requests the code associated with `https://example.com/books/item?edition=2&source=share#details`
- **THEN** the backend returns `302` with `Location` equal to `https://example.com/books/item?edition=2&source=share#details`

### Requirement: Report unknown short codes
When storage is available and a code has no mapping, the backend SHALL return `404`, `Content-Type: application/json`, and `{error:{code,message}}`, where `code` is `NOT_FOUND` and `message` is a human-readable string.

#### Scenario: Unknown code
- **WHEN** a caller requests `/s/{code}` for a code with no stored mapping and storage is available
- **THEN** the backend returns `404` with error code `NOT_FOUND`
- **AND** it does not redirect the caller

### Requirement: Report unavailable lookup storage
If required storage is unavailable or a lookup fails due to storage unavailability, the backend SHALL return `503`, `Content-Type: application/json`, and `{error:{code,message}}`, where `code` is `STORAGE_UNAVAILABLE` and `message` is a human-readable string. It SHALL NOT misreport a storage failure as an unknown code.

#### Scenario: Storage unavailable for a known code
- **WHEN** a caller requests a previously created code while required storage is unavailable
- **THEN** the backend returns `503` with error code `STORAGE_UNAVAILABLE`
- **AND** it does not return a redirect or `404`

#### Scenario: Storage unavailable for an unrecognized code
- **WHEN** a caller requests a code whose mapping cannot be checked because required storage is unavailable
- **THEN** the backend returns `503` with error code `STORAGE_UNAVAILABLE` rather than `404`
