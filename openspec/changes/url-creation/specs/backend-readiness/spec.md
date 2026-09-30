## Purpose

Expose backend usability and provide the configuration and storage lifecycle needed to run the backend independently and support integrated acceptance.

## ADDED Requirements

### Requirement: Storage-aware health
The backend SHALL expose `GET /health`, reading the current storage snapshot and returning `200` when that read succeeds and `503` when it fails. Health response body content is not prescribed.

#### Scenario: Backend ready
- **WHEN** a caller requests `/health` and the current storage snapshot can be read
- **THEN** the backend returns `200`

#### Scenario: Storage unavailable
- **WHEN** a caller requests `/health` and the current storage snapshot cannot be read
- **THEN** the backend returns `503`

### Requirement: Configurable backend and public addresses
The backend SHALL listen on `127.0.0.1` using its supplied `PORT`. It SHALL use the supplied `PUBLIC_LINK_ORIGIN` as the origin of generated short URLs. Acceptance SHALL be supported with an HTTP backend origin and a distinct HTTP frontend public origin, without an additional path prefix.

#### Scenario: Start on the allocated backend port
- **WHEN** the backend starts with an available allocated `PORT`
- **THEN** its `/health`, `/api/links`, and `/s/{code}` endpoints are reachable at `http://127.0.0.1:<PORT>`

#### Scenario: Public links use the frontend origin
- **WHEN** the backend runs on one allocated port with `PUBLIC_LINK_ORIGIN` set to `http://127.0.0.1:<frontend-port>` and successfully creates a link
- **THEN** the returned short URL uses `http://127.0.0.1:<frontend-port>/s/{code}`

### Requirement: Isolated durable acceptance storage
The delivered backend SHALL support provisioning storage independently for each acceptance run and retaining that storage during backend restart within the run. A fresh isolated run SHALL NOT expose mappings from another run.

#### Scenario: Independent acceptance runs
- **WHEN** one acceptance run creates a link and another starts with separately provisioned fresh storage
- **THEN** the second run has no mapping for the first run's code

#### Scenario: Retain storage during restart
- **WHEN** a backend is restarted during an acceptance run using the retained storage for that run
- **THEN** its previously acknowledged links remain resolvable

### Requirement: Reproducible component delivery
The backend delivery SHALL document install and start commands, dependencies, all required environment and configuration inputs, listening address, readiness checks, isolated storage provisioning and retention, and a method to exercise genuine storage unavailability without test-only product endpoints. It SHALL identify a reachable full Git commit SHA or immutable revision and provide verification commands and results for creation, invalid input, unknown codes, storage failures, destination preservation, and restart survival.

#### Scenario: Start the delivered revision
- **WHEN** an acceptance operator follows the delivered setup instructions for the identified immutable revision with allocated addresses and isolated storage
- **THEN** the backend can be installed and started and its readiness can be checked using `/health`

#### Scenario: Exercise genuine storage failure
- **WHEN** an acceptance operator follows the documented method for making required storage unavailable
- **THEN** genuine storage unavailability can be exercised without a test-only product endpoint
- **AND** `/health` and valid creation or resolution requests return `503`

#### Scenario: Inspect component verification evidence
- **WHEN** an acceptance operator inspects the delivery evidence
- **THEN** it includes commands and results covering the required backend behavior and identifies the immutable revision tested
