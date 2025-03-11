#!/bin/bash

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create database and user if they don't exist
# psql postgres -c "SELECT 1 FROM pg_user WHERE usename = 'postgres'" | grep -q 1 || {
#     echo "Creating postgres user..."
#     psql postgres -c "CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;"
# }

# psql postgres -c "SELECT 1 FROM pg_database WHERE datname = 'counter_db'" | grep -q 1 || {
#     echo "Creating counter_db database..."
#     psql postgres -c "CREATE DATABASE counter_db;"
# }

# # Apply schema
# echo "Applying database schema..."
# psql -U postgres counter_db < "$DIR/stats-service/schema.sql"

# Load environment variables
source "$DIR/counter-ws-server/.env.development"

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "Starting Redis..."
    brew services start redis
    sleep 2
fi

# Start counter websocket server
cd "$DIR/counter-ws-server"
GO_ENV=development go run main.go &
WS_PID=$!

# Go back to root and start Next.js
cd "$DIR"
bun run dev &
NEXT_PID=$!

# Function to kill all servers and stop services
cleanup() {
    echo "Shutting down servers..."
    kill $WS_PID
    kill $NEXT_PID

    echo "Resetting Redis counter..."
    redis-cli DEL counter

    # echo "Resetting PostgreSQL tables..."
    # psql -U postgres counter_db -c "
    #     -- Disable foreign key constraints temporarily
    #     SET session_replication_role = 'replica';

    #     -- Truncate all tables
    #     TRUNCATE TABLE users CASCADE;
    #     TRUNCATE TABLE user_stats CASCADE;
    #     TRUNCATE TABLE user_activity CASCADE;
    #     TRUNCATE TABLE country_stats CASCADE;
    #     TRUNCATE TABLE country_activity CASCADE;
    #     TRUNCATE TABLE counter_history CASCADE;
    #     TRUNCATE TABLE viewers CASCADE;
    #     TRUNCATE TABLE active_sessions CASCADE;
    #     TRUNCATE TABLE payout_settings CASCADE;
    #     TRUNCATE TABLE leaderboard_payouts CASCADE;

    #     -- Reset all sequences
    #     ALTER SEQUENCE users_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE user_stats_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE user_activity_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE country_stats_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE country_activity_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE counter_history_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE viewers_id_seq RESTART WITH 1;
    #     ALTER SEQUENCE payout_settings_id_seq RESTART WITH 1;

    #     -- Re-enable foreign key constraints
    #     SET session_replication_role = 'origin';

    #     -- Reinsert initial payout setting
    #     INSERT INTO payout_settings (weekly_payout_amount) VALUES (1000);
    # "

    echo "Stopping Redis..."
    brew services stop redis
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Wait for any process to exit
wait
