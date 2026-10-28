# Notification Centre Backend Contract

The MySQL `app_notifications` table is the source of truth for the dashboard
inbox. A push popup is best-effort delivery only: a failed FCM send, disabled
browser permission, or missing device token must not prevent an inbox row from
being created.

All endpoints below require the normal authenticated user session. The API
always derives the recipient from the access token; callers cannot read or
change another user's notifications.

## APIs

| Purpose | Method and path | Notes |
| --- | --- | --- |
| List inbox | `GET /v1/app-notifications` | Supports `status=all|read|unread|archived`, `category`, `search`, `page`, and `limit`. |
| Tab counts | `GET /v1/app-notifications/counts` | Returns `all`, `unread`, `mentions`, `payments`, `projects`, `files`, `messages`, `meetings`, and `archived`. |
| One item | `GET /v1/app-notifications/:id` | Active notification only. |
| Mark one read | `PATCH /v1/app-notifications/:id/read` | Use immediately when the user opens the destination. |
| Mark one unread | `PATCH /v1/app-notifications/:id/unread` | |
| Mark a tab/all read | `PATCH /v1/app-notifications/read-all` | Optional body/query: `category`. |
| Mark related items read | `PATCH /v1/app-notifications/read-by-reference` | Body: `{ "reference_type": "chat_room", "reference_id": "123" }`. Call when the related chat/page opens directly. |
| Archive | `DELETE /v1/app-notifications/:id` | Soft archive only; no notification data is deleted. |
| Restore archive | `PATCH /v1/app-notifications/:id/restore` | Restored item returns to the active inbox. |
| Read/update browser-push category mutes | `GET /v1/notification-preferences`, `PATCH /v1/notification-preferences/inbox` | PATCH body: `{ "muted_categories": ["files", "payments"] }`. Inbox rows remain visible. |
| Self-test inbox + push | `POST /v1/push-notifications/test` | Authenticated user only. Creates one `system` inbox item for that user, then sends its `notification_id` through API2. Response reports `inbox_saved`, `push_success`, token counts, and failure reason. |

The list response has `items`, relative-day `grouped` sections, and
`pagination`. Each item carries `payload`, `reference_id`, `reference_type`,
and `action_label`; the frontend should use them for the action button and
destination instead of parsing notification text.

## UI mapping

Use lowercase API categories. The visible labels can be styled however the web
design needs.

| UI tab | Query / rule |
| --- | --- |
| All | no category filter |
| Unread | `status=unread` |
| Mentions | `category=mentions` |
| Payments | `category=payments` |
| Projects | `category=projects` (includes projects, shoots, meetings, proposals) |
| Files | `category=files` |

## Behaviour rules

- `delivery_surface=web_app` is selected server-side for the web dashboard, so
  it does not mix in mobile-app records.
- Mark a row read after a dashboard click. FCM notifications emitted by this
  API include `notification_id`, allowing a browser/service-worker click to
  call the same read endpoint.
- The web notification UI is available at `/admin/notifications`,
  `/creator/dashboard/notifications`, and `/affiliate/notifications`. Each
  portal's service worker opens its own page with `notificationId`; the page
  marks the row read and then opens the related destination.
- Opening a chat room or meeting directly marks related notifications read
  through `read-by-reference`. The APIs derive the recipient from the session.
- Separate sales and production-manager portal inbox screens have not been
  added.
- Archive is reversible. The active list excludes archived rows; the archive
  screen uses `status=archived`.
- A user may explicitly mute a category. That suppresses future non-critical
  **browser push** alerts in that category, but new events are still saved in
  the MySQL inbox. Critical/urgent push alerts bypass the mute.
- Device push preferences and category push mutes are separate. Disabling a push token
  must not hide normal notifications from the MySQL inbox.
- A successful self-test response with `inbox_saved: true` does not imply FCM
  delivery succeeded; check `push_success` and `reason` separately. FCM success
  confirms Firebase accepted the message, not that the browser displayed it.
  If System push is muted, the self-test saves its inbox row and reports
  `PUSH_CATEGORY_MUTED` without attempting FCM delivery.

## Deployment prerequisite

Run `migrations/20261013_01_add_notification_inbox_foundation.sql` before
deploying this code. It adds `archived_at`, the active-list performance index,
and `muted_categories`. The earlier
`20260807_01_create_app_notifications_table.sql` migration must already have
been executed.
