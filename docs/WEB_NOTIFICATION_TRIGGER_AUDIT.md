# Web Notification Triggers and Preferences

This is the implementation reference for notifications shown in the admin, creator, and client web dashboards. It describes the code present on 22 October 2026, not a certification of delivery on `dev.beige.app`. A trigger is eligible only when its business event occurs, the recipient resolves to an active user account, and its particular workflow calls the notification sender.

## Delivery contract

Web business events normally call `createAndPushNotification` in `src/services/app-notification.service.js`. It saves a per-user `web_app` row in MySQL `app_notifications` first, then attempts an FCM push through the centralized API2 service. Browser permission, token state, API2 availability, and Firebase determine whether a popup appears; failure does not delete the inbox row. The service worker opens the relevant portal inbox with `notificationId`; the page marks that item read and routes to its destination. Directly opening a related chat or meeting also has a reference-based read path.

Admin/internal notifications are addressed to an assigned owner or actual participant, not broadcast to everyone with admin-dashboard access. Guests without an authenticated user account may receive workflow emails but cannot receive a personal web inbox row. The web inbox lists `delivery_surface=web_app`; it is not a combined view of API2's Mongo notification records or mobile-app rows. API2-originated pushes that bypass the main web backend are **not guaranteed** to have a matching MySQL inbox row.

The supported web inbox routes are `/admin/notifications`, `/creator/dashboard/notifications`, and `/affiliate/notifications`. The `All` tab shows all active categories; other tabs are narrower: Unread, Mentions, Payments, Projects, and Files. Archived rows are available separately. `Projects` is a grouping of project-related categories, not a separate business trigger.

## Admin and internal-owner triggers

“Owner” below means the assigned sales representative or shoot owner resolved by the relevant workflow. Unassigned records do not broadcast to admins.

| Category | Trigger and condition | Recipient | View details |
| --- | --- | --- | --- |
| Leads | New Book a Shoot lead assigned | Assigned internal/sales member | Lead |
| Leads | Lead passes explicit `response_due_at` without owner response | Assigned member; one reminder per lead | Lead |
| Shoots | Client submits shoot-details form | Assigned shoot owner | Submitted form |
| Shoots | Confirmed shoot date, time, or location changes in supported booking-edit flows | Shoot owner if included and not the actor | Shoot |
| Shoots | Shoot cancelled in supported booking-edit flows | Shoot owner if included and not the actor | Shoot |
| Shoots | Confirmed creator is removed or shoot team changes | Assigned owner when replacement/action is needed | Shoot/team |
| Payments | Booking payment succeeds, partially succeeds, or fails in supported payment/webhook flows | Assigned booking owner | Booking/payment |
| Proposals | Client accepts/signs a quote through the client acceptance flow | Quote owner/assigned sales member | Quote |
| Proposals | Client declines or requests quote changes | Quote owner/assigned sales member | Quote |
| Proposals | Sent quote is one day before its recorded `valid_until` date | Quote owner, with owner-specific message | Quote |
| Agreements | Creator accepts or rejects shoot agreement | Booking owner; fallback to the agreement sender or record creator | Shoot agreement |
| Agreements | Pending shoot agreement passes its explicit due date | Booking owner; one reminder per agreement | Shoot agreement |
| Files | Revision delivery passes an explicit due date while undelivered | Assigned owner | Shoot files/revision |
| Files | Booking remains in post-production after `estimated_delivery_date` | Assigned owner; one follow-up per booking and date | Shoot files |
| Disputes | Client/creator raises or comments on a finance dispute | Assigned booking owner | Dispute |
| Messages | Direct message, mention, or chat-room initiation/addition | Admin only if a chat recipient; sender excluded | Chat room |
| Meetings | Scheduled, updated, rescheduled, cancelled/deleted, or participant added | Admin only if a relevant meeting participant | Meeting or meeting list |

The deliverables follow-up is based on an **estimated** date, not a contractual SLA. Refund/finance ownership does not fan out to a finance role by default; it follows the assigned owner mapping.

## Creator and Creative Partner triggers

| Category | Trigger and condition | Recipient | View details |
| --- | --- | --- | --- |
| Shoots | New shoot request after the creator-compensation assignment workflow | Newly assigned creator | Shoot request |
| Shoots | Confirmed shoot date, time, or location changes | Affected confirmed creator | Shoot |
| Shoots | Shoot cancelled | Assigned or affected creator | Shoot |
| Shoots | Creator removed from assignment | Removed creator | Shoot requests |
| Shoots | Confirmed shoot is tomorrow | Accepted creator | Shoot |
| Agreements | Shoot agreement requires action | Assigned creator | Agreement |
| Files | Client selects files for editing | Assigned creator | Project files |
| Files | Client requests an edit revision | Assigned creator | Project files/revision |
| Files | Client approves final files | Assigned creator | Project files |
| Files | Revision comment/reply added | Assigned creator | Project files/revision |
| Payouts | Creator compensation approved, changed, rejected, or paid | That creator | Earnings |
| Disputes | Internal comment/update or resolution on creator's dispute | That creator | Dispute |
| Reviews | Client leaves a creator review | That creator | Review |
| Messages | Direct message, mention, or chat-room initiation/addition | Creator if a chat recipient; sender excluded | Chat room |
| Meetings | Scheduled, updated, rescheduled, cancelled/deleted, or participant added | Creator if a relevant meeting participant | Meeting or meeting list |

## Client triggers

| Category | Trigger and condition | Recipient | View details |
| --- | --- | --- | --- |
| Shoots | Booking payment fully confirms a web booking | Booking's linked client user | Shoot |
| Shoots | Creator accepts shoot agreement | Booking's linked client user | Shoot/team |
| Shoots | Confirmed shoot date, time, location, or team changes | Affected client | Shoot |
| Shoots | Shoot cancelled | Affected client | Shoot |
| Shoots | Confirmed shoot is tomorrow | Booking's linked client user | Shoot |
| Proposals | Quote sent or revised after successful quote-email send | Quote's linked client user | Quote |
| Proposals | Sent quote is one day before explicit `valid_until` | Quote's linked client user | Quote |
| Files | Raw files uploaded and available | Booking's client user | File manager |
| Files | Edited files delivered for review | Booking's client user | File manager |
| Files | New file version uploaded | Booking's client user | File manager |
| Disputes | Internal comment/update or resolution on client's dispute | That client | Dispute/transactions |
| Disputes | Refund approved or rejected; manually marked completed after finance records method and transaction ID | Affected client | Dispute/transactions |
| Messages | Direct message, mention, or chat-room initiation/addition | Client if a chat recipient; sender excluded | Chat room |
| Meetings | Scheduled, updated, rescheduled, cancelled/deleted, or participant added | Client if a relevant meeting participant | Meeting or meeting list |

“Refund marked completed” records a **manual finance confirmation**, not a provider-verified Stripe refund webhook. A client payment-receipt push separate from `booking_confirmed` is not listed here because this web implementation does not establish one.

## Event keys and payloads

The `type` value identifies the event; `category` controls the inbox label and browser-push mute. The FCM data payload includes `notification_id` for main-backend-sent web pushes and the relevant reference IDs. Consumers should route by those IDs, not parse the title or message.

| Category | Web `type` values | Principal payload/reference |
| --- | --- | --- |
| Leads | `lead_assigned`, `lead_response_overdue` | `lead_id`; `sales_lead` reference |
| Shoots | `new_shoot_request`, `booking_confirmed`, `shoot_details_submitted`, `shoot_schedule_location_changed`, `shoot_cancelled`, `shoot_creator_confirmed`, `shoot_creator_removed`, `shoot_creator_removed_owner`, `shoot_team_changed`, `shoot_approaching` | `booking_id`; booking reference |
| Payments | `booking_payment_succeeded`, `booking_payment_partial`, `booking_payment_failed` | `booking_id`, `payment_id`; payment reference |
| Messages | `direct_message`, `mention`, `messaging_initiated` | `room_id`, `chat_room_id`, optional `booking_id`; chat-room reference. A participant-added event uses `messaging_initiated` as the stored type and `participant_added` as `event_type`. |
| Meetings | `meeting_scheduled`, `meeting_updated`, `meeting_rescheduled`, `meeting_cancelled`, `meeting_participant_added` | `meeting_id`, `booking_id`, `starts_at`, `display_timezone`; meeting reference. Deletion sends `meeting_cancelled`. |
| Proposals | `quote_sent`, `quote_revised`, `client_quote_accepted`, `client_quote_declined`, `client_quote_change_requested`, `quote_expiring_soon` | `sales_quote_id`; quote reference |
| Agreements | `agreement_action_required`, `shoot_agreement_accepted`, `shoot_agreement_rejected`, `shoot_agreement_overdue` | `agreement_document_id` and/or `booking_id` |
| Files | `files_selected_for_editing`, `raw_files_uploaded`, `edited_files_delivered`, `revision_requested_on_edit`, `final_files_approved`, `new_version_uploaded`, `revision_comment_added`, `revision_delivery_overdue`, `delivery_follow_up` | `booking_id`, optionally file path/version or due date |
| Payouts | `creator_compensation_approved`, `creator_compensation_changed`, `creator_compensation_rejected`, `creator_compensation_paid` | `creator_earning_id`, `booking_id` |
| Disputes | `dispute_raised`, `dispute_updated`, `dispute_resolved`, `dispute_rejected`, `refund_approved`, `refund_rejected`, `refund_completed` | `dispute_id`, `booking_id`; finance-dispute reference |
| Reviews | `creator_review_received` | `creator_id`, `review_id` |
| System | `push_module_test` | `notification_id` |

The frontend destination map is `lib/notificationCenterApi.ts` in the web repository. A cancelled meeting opens the meeting list; most other event actions open the related record. If an event has no safe destination, the inbox opens its details modal instead of inventing a link.

## Preferences and inbox behavior

The shared preferences screen is available under each portal's `/notifications/preferences` path. Its category controls cover Shoots, Leads, Payments, Payouts, Messages, Meetings, Proposals, Agreements, Files, Disputes, Reviews, and System. These switches write lowercase names to `user_notification_preferences.muted_categories` through `PATCH /v1/notification-preferences/inbox`. They suppress future **non-critical browser push only**; new MySQL inbox rows are retained. Critical/urgent pushes bypass category mutes. `System` currently primarily covers the authenticated self-test, not a broad catalogue of account-alert triggers.

The master Push switch changes the current browser session's API2 token preferences; it does not remove inbox history. Browser permission and a valid registered token are also required for a popup. The Email switch saves a user email preference, but only email paths that check `isEmailAllowedForUser` or `filterEmailRecipientsByPreference` respect it; do not present it as a global unsubscribe for every direct workflow email. API2-originated direct pushes may not check the main web backend's category mutes.

The inbox API supports list/search/filter/counts, one/all/reference-based read, unread, archive, and restore. A popup click with a web `notification_id` marks the item read. Merely receiving a popup does not. A muted-category event remains unread until opened or marked read.

## Verification and known limits

The notification-focused tests verify owner-only routing, guest quote exclusion, shoot-audience exclusion, reminder conditions, and that a muted or failed browser push still leaves a MySQL inbox row. Backend syntax and targeted frontend lint pass. No live business-event matrix or Firebase popup test was performed for this audit. The local MySQL server was unavailable during verification, so applied migration state and real inbox writes could not be checked.

The full backend `node --test test/*.test.js` run passed 11 test files and failed the unrelated `quote-analytics.service.test.js` file (two quote-analytics assertions). The full frontend TypeScript check also fails on existing repository-wide errors; targeted lint on the changed notification components passed. These failures must not be described as notification delivery success or failure.

Remaining coverage gaps: a creator payout request does not currently have a proven web-inbox alert to the assigned internal owner; API2-direct events may bypass the MySQL inbox and its category mutes; guest quotes without a linked user have email but no web inbox; and the Email switch is not enforced by every direct email-sending path. These should be handled as separate workflow work, not represented as tested triggers above.

Before production sign-off, use controlled admin, creator, and client accounts with valid browser tokens and exercise one event from each row above. Check: business state changed, correct recipient only, MySQL `web_app` row exists, category/type/reference/payload are correct, FCM accepted or reported a reason, popup click marks read and opens the right page, mute blocks popup but retains inbox row, and a direct API2 event does not silently bypass the desired inbox or preference policy. Do not trigger real payments or refunds merely to test notification UI; use sandbox/test workflows.

## Source map

- Main persistence, preference, and recipient logic: `src/services/app-notification.service.js`, `src/services/push-notification.service.js`, `src/services/business-notification.service.js`.
- Web event paths: `src/controllers/external-chat.controller.js`, `src/controllers/external-meetings.controller.js`, `src/controllers/external-file-manager.controller.js`, `src/controllers/payments.controller.js`, `src/services/sales-quote.service.js`, `src/services/agreements.service.js`, `src/services/cp-compensation.service.js`, `src/services/finance-dispute.service.js`, `src/services/overdue-notification.service.js`.
- Frontend routes and destination rules: `../../beige-web-mobile-front/components/notifications/NotificationPreferencesPage.tsx`, `../../beige-web-mobile-front/components/notifications/NotificationCenterPage.tsx`, `../../beige-web-mobile-front/lib/notificationCenterApi.ts`.
- API2 direct-push exception: `../../beige-tech-mobile-web-api-2/src/services/socket.service.js`, `../../beige-tech-mobile-web-api-2/src/services/fcm.service.js`.
