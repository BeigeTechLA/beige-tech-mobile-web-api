-- Notification-centre foundation: preserve archive history and per-user
-- category mute choices independently from device-push preferences.

ALTER TABLE app_notifications
    ADD COLUMN archived_at DATETIME DEFAULT NULL AFTER read_at;

CREATE INDEX idx_app_notifications_user_active_created
    ON app_notifications(user_id, is_active, created_at);

ALTER TABLE user_notification_preferences
    ADD COLUMN muted_categories JSON DEFAULT NULL AFTER email_topics;
