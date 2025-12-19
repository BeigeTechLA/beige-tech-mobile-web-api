#!/bin/bash

# Apply Bug Fixes Migration Script
# Adds guest_email and user_id fields to stream_project_booking table
# Date: December 19, 2025

echo "🔧 Applying Bug Fixes Migration"
echo "================================="
echo ""

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "❌ Error: .env file not found"
  exit 1
fi

# Check if migration file exists
MIGRATION_FILE="migrations/add_guest_email_and_user_id_to_bookings.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Confirm before proceeding
echo "📋 This will:"
echo "   - Add user_id column to stream_project_booking"
echo "   - Add guest_email column to stream_project_booking"
echo "   - Create foreign key to users table"
echo ""
echo "Database: $DATABASE_NAME"
echo "Host: $DATABASE_HOST"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Migration cancelled"
  exit 1
fi

# Run migration
echo "🚀 Running migration..."
mysql -h "$DATABASE_HOST" -u "$DATABASE_USER" -p"$DATABASE_PASS" "$DATABASE_NAME" < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Migration applied successfully!"
  echo ""

  # Verify the changes
  echo "🔍 Verifying new columns..."
  mysql -h "$DATABASE_HOST" -u "$DATABASE_USER" -p"$DATABASE_PASS" "$DATABASE_NAME" -e "DESCRIBE stream_project_booking;" | grep -E "user_id|guest_email"

  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Verification complete!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Restart the server: pm2 restart revure-backend"
    echo "   2. Test guest booking endpoint"
    echo "   3. Test creator search endpoint"
    echo ""
  else
    echo "⚠️  Warning: Could not verify columns (but migration may have succeeded)"
  fi
else
  echo "❌ Migration failed!"
  echo ""
  echo "🔄 Rollback instructions:"
  echo "   mysql -h \$DATABASE_HOST -u \$DATABASE_USER -p\$DATABASE_PASS \$DATABASE_NAME"
  echo "   Then run:"
  echo "   ALTER TABLE stream_project_booking DROP FOREIGN KEY fk_booking_user;"
  echo "   ALTER TABLE stream_project_booking DROP INDEX idx_user_id;"
  echo "   ALTER TABLE stream_project_booking DROP INDEX idx_guest_email;"
  echo "   ALTER TABLE stream_project_booking DROP COLUMN user_id;"
  echo "   ALTER TABLE stream_project_booking DROP COLUMN guest_email;"
  exit 1
fi
