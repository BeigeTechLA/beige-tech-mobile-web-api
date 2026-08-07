-- Stored notification-center rows for app and web clients.

CREATE TABLE IF NOT EXISTS app_notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sender_user_id INT DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    topic VARCHAR(50) NOT NULL,
    delivery_surface VARCHAR(30) NOT NULL DEFAULT 'web_app',
    app_user_type VARCHAR(30) DEFAULT NULL,
    category VARCHAR(50) NOT NULL,
    type VARCHAR(80) NOT NULL,
    reference_id VARCHAR(100) DEFAULT NULL,
    reference_type VARCHAR(50) DEFAULT NULL,
    payload JSON DEFAULT NULL,
    action_label VARCHAR(80) DEFAULT NULL,
    priority VARCHAR(30) DEFAULT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    read_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_app_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_app_notifications_sender_user
        FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_app_notifications_user_read_created
    ON app_notifications(user_id, is_read, created_at);

CREATE INDEX idx_app_notifications_surface
    ON app_notifications(delivery_surface, app_user_type);

CREATE INDEX idx_app_notifications_user_category
    ON app_notifications(user_id, category);

CREATE INDEX idx_app_notifications_type
    ON app_notifications(type);
