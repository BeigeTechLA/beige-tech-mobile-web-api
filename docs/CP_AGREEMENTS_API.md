# Creative Partner Agreements API

Base path: `/v1/agreements`.

This feature has two agreement types:

- **General agreement**: the current published mandatory Beige agreement for every Creative Partner (CP).
- **Shoot agreement**: an immutable agreement for one `assigned_crew.id` assignment on one shoot.

## Non-negotiable acceptance rule

`assigned_crew.crew_accept` is managed only by the agreement response transaction:

| Value | Meaning | Who changes it |
| --- | --- | --- |
| `0` | Pending / awaiting agreement | assignment workflow or admin send/revision |
| `1` | Accepted / confirmed | CP accepts the current shoot agreement |
| `2` | Rejected | CP rejects the current shoot agreement |

The legacy direct shoot-response endpoints now return `409` with code `SHOOT_AGREEMENT_REQUIRED`. Frontend must never call them to accept or decline an agreement-managed shoot.

## Main business flow

1. Admin creates a general-agreement draft and publishes it.
2. CP opens `GET /creator/general/current`. The API returns their immutable copy of the current general version.
3. CP accepts it using the returned `agreement_document_id`.
4. After crew assignment and CP compensation exist, admin creates a shoot-agreement draft for the exact `assigned_crew.id`.
5. Admin sends the shoot agreement. The CP receives an in-app notification, while `crew_accept` remains `0`.
6. CP accepts or rejects the document. The API locks the document and assignment, saves a response/evidence record and event, then changes `crew_accept` to `1` or `2` atomically.
7. A changed agreement is revised to a fresh version and sent again. Existing accepted versions remain immutable history.

## Data integrity behaviour

- The server reads CP, shoot details and compensation from `assigned_crew`, `stream_project_booking` and `creator_earnings`. A client cannot submit or override compensation.
- A CP can only read/respond to documents where `agreement_documents.creator_id` is their own `crew_members.crew_member_id`.
- A shoot agreement cannot be accepted unless the CP has accepted the currently published general agreement.
- A response needs `accepted_terms: true`, a legal `signer_name`, and a drawn PNG `signature_data_url` to accept. A rejection needs `rejection_reason`.
- The drawn signature, its SHA-256 hash, the document SHA-256 hash, signer name, IP, user agent, response timestamp and event trail are saved with the response. Admin and the owning CP can see the signed record through the agreement detail endpoints.
- CP lists and detail endpoints exclude draft and cancelled agreements; only delivered agreements and their response history are visible.
- Only the current pending version can be answered. A duplicate/stale answer gets `409`.
- Publishing another general version does not overwrite historical acceptance. It creates a new required agreement for each CP when they next load it.

## Admin endpoints

All admin endpoints require authentication and the matching `admin_agreements.*` permission.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `POST` | `/admin/general` | create | Create a general-agreement draft |
| `GET` | `/admin/general` | view | List general templates |
| `GET` | `/admin/general/:templateId` | view | Fetch one template |
| `PATCH` | `/admin/general/:templateId` | edit | Edit a draft only |
| `POST` | `/admin/general/:templateId/publish` | send | Publish a draft; retires prior general version |
| `GET` | `/admin` | view | List agreement documents; supports `type`, `status`, `booking_id`, `limit` |
| `POST` | `/admin/shoots/:bookingId/assignments/:assignmentId` | create | Build a shoot agreement draft |
| `POST` | `/admin/shoots/:bookingId/assign-and-send` | create + send + `admin_shoots.edit` | Atomically assign new CPs, submit their compensation for finance approval, and send one agreement per CP |
| `GET` | `/admin/:agreementId` | view | Full agreement, responses and audit events |
| `PATCH` | `/admin/:agreementId` | edit | Edit a shoot draft only |
| `POST` | `/admin/:agreementId/send` | send | Send current draft/rejected document to CP |
| `POST` | `/admin/:agreementId/revise` | edit | Create next immutable version as a draft |
| `POST` | `/admin/:agreementId/cancel` | cancel | Cancel draft/pending agreement |

### Create general draft body

```json
{
  "title": "Beige Creative Partner General Agreement",
  "version": "1.0",
  "description": "Optional internal description",
  "content_html": "<h1>Approved legal content</h1>",
  "content_json": { "sections": [] },
  "is_mandatory": true
}
```

### Create shoot draft body

```json
{
  "title": "Shoot Agreement",
  "content_html": "<h1>Approved shoot terms</h1>",
  "content_json": { "sections": [] },
  "due_at": "2026-10-20T18:30:00.000Z",
  "snapshot_overrides": {
    "expenses": "Pre-approved expenses only"
  }
}
```

`assignmentId` is the primary key (`assigned_crew.id`), not a crew member ID. The assignment must be active, belong to `bookingId`, and be pending. Compensation must already exist in `creator_earnings` for that CP and booking.

### New assignment flow

The Add Creatives screen gathers CP selection and compensation locally, then opens the agreement editor. Until Save and Send, no assignment or compensation is persisted. Submit `POST /admin/shoots/:bookingId/assign-and-send` with `{ "compensation": { "booking_id": 123, "compensation_method": "equal_split", "creators": [...] }, "agreement": { "title": "Shoot Agreement", "content_html": "<section>...</section>", "content_json": { "sections": [...] } } }`. In individual mode, add an `agreements` object keyed by creator ID to override the shared agreement for each CP. Each creator must be new to this shoot. The server validates all recipients and role limits, then creates assignments, finance pending compensation, and pending agreements in one database transaction. If any database step fails, all three roll back. After commit, it sends each CP an agreement notification. Email delivery is not part of this endpoint.

## Creative Partner endpoints

All resolve the CP from the access token; clients must not send a `creator_id`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/creator/general/current` | Get current general agreement and `acceptance_required` |
| `POST` | `/creator/general/:agreementId/accept` | Accept current general agreement |
| `GET` | `/creator` | List own documents; supports `type`, `status`, `booking_id`, `limit` |
| `GET` | `/creator/:agreementId` | Get own agreement, response and audit history |
| `POST` | `/creator/:agreementId/accept` | Accept current shoot agreement and confirm assignment |
| `POST` | `/creator/:agreementId/reject` | Reject current shoot agreement and reject assignment |

Accept body:

```json
{
  "accepted_terms": true,
  "signer_name": "CP legal name",
  "signature_data_url": "data:image/png;base64,..."
}
```

Reject body:

```json
{
  "rejection_reason": "Compensation needs review",
  "comments": "Optional explanation for the admin team"
}
```

## Persistence

Migration: `migrations/20261012_02_create_cp_agreements.sql`.
Drawn signature evidence also requires `migrations/20261022_01_add_cp_agreement_signatures.sql` before deploying the new acceptance flow.

- `agreement_templates`: admin-owned general template versions.
- `agreement_documents`: immutable per-CP general copies and shoot agreement versions.
- `agreement_responses`: one legal response for a document version.
- `agreement_events`: append-only audit history.

The migration also grants the `admin_agreements` permission set to roles that already have active `admin_shoots` permissions. Apply it to every environment before deploying the API.

## Frontend integration notes

- The mandatory general-agreement modal must call `GET /creator/general/current`; it may only be dismissible after `acceptance_required` is false.
- Request-shoot cards with `crew_accept = 0` should show the agreement CTA when a pending shoot agreement exists. Do not render a direct accept action.
- After a `POST .../accept`, refresh both CP agreement list and shoot/request list so the assignment shows confirmed.
- Admin should use the returned `agreement_document_id` from create/revise to open, edit, send and preview the exact version.
- The API creates an in-app notification on send. Email delivery is intentionally not claimed by this first implementation; connect the existing email service later if product requires email delivery/audit.
