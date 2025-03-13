-- Set schema to public
SET search_path TO public;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Viewers table for tracking active viewers
CREATE TABLE viewers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id TEXT UNIQUE NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX viewers_last_seen_idx ON viewers(last_seen);
CREATE INDEX viewers_client_id_idx ON viewers(client_id);

-- Grant permissions to production user
GRANT ALL PRIVILEGES ON TABLE viewers TO neondb_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;

-- Users table with OAuth support
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    oauth_provider VARCHAR(20), -- 'github', 'google', etc.
    oauth_id VARCHAR(100),     -- ID from the OAuth provider
    avatar_url TEXT,
    paypal_account_id TEXT UNIQUE,
    paypal_email TEXT UNIQUE,
    paypal_verified_at TIMESTAMPTZ
);

-- Create unique index for OAuth provider + ID combination
CREATE UNIQUE INDEX users_oauth_idx ON users (oauth_provider, oauth_id) 
WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

-- Create index for PayPal account lookup
CREATE INDEX users_paypal_idx ON users (paypal_account_id) 
WHERE paypal_account_id IS NOT NULL;

-- User statistics
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    increment_count BIGINT NOT NULL DEFAULT 0,
    total_value_added BIGINT NOT NULL DEFAULT 0,
    last_increment TIMESTAMPTZ,
    streak_days INTEGER DEFAULT 0,      -- Current streak of days with increments
    longest_streak INTEGER DEFAULT 0,   -- Longest streak achieved
    last_streak_date DATE              -- Last date counted for streak
);

-- Counter history with support for different granularities
CREATE TABLE counter_history (
    id SERIAL PRIMARY KEY,
    count TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granularity VARCHAR(10) NOT NULL DEFAULT 'detailed', -- 'detailed', 'hourly', 'daily'
    start_count TEXT,                                    -- For aggregated records
    end_count TEXT,                                      -- For aggregated records
    avg_count TEXT,                                      -- For aggregated records
    min_count TEXT,                                      -- For aggregated records
    max_count TEXT,                                      -- For aggregated records
    UNIQUE (timestamp, granularity)
);

-- Indexes for performance
CREATE INDEX counter_history_timestamp_granularity_idx ON counter_history(timestamp, granularity);
CREATE INDEX counter_history_granularity_idx ON counter_history(granularity);
CREATE INDEX user_stats_increment_count_idx ON user_stats(increment_count DESC);
CREATE INDEX user_stats_total_value_added_idx ON user_stats(total_value_added DESC);

-- Country-wise statistics
CREATE TABLE country_stats (
    country_code CHAR(2) PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,
    increment_count BIGINT NOT NULL DEFAULT 0,
    last_increment TIMESTAMPTZ
);

-- User sessions for tracking active viewers
CREATE TABLE active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX active_sessions_last_seen_idx ON active_sessions(last_seen);

-- PayPal payouts table for tracking all payouts
CREATE TABLE payouts (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    paypal_email TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    batch_id TEXT NOT NULL,
    status TEXT NOT NULL,
    transaction_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for payout lookups
CREATE INDEX payouts_user_id_idx ON payouts(user_id);
CREATE INDEX payouts_batch_id_idx ON payouts(batch_id);
CREATE INDEX payouts_created_at_idx ON payouts(created_at DESC);
CREATE INDEX payouts_status_idx ON payouts(status);
CREATE INDEX payouts_transaction_id_idx ON payouts(transaction_id);

-- PayPal payout settings table
CREATE TABLE payout_settings (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default payout settings
INSERT INTO payout_settings (amount) 
SELECT 10.00
WHERE NOT EXISTS (SELECT 1 FROM payout_settings);

-- Activity tracking tables for time-windowed statistics
CREATE TABLE user_activity (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    value_diff BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE country_activity (
    id SERIAL PRIMARY KEY,
    country_code CHAR(2) NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    value_diff BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX user_activity_user_id_created_at_idx ON user_activity(user_id, created_at);
CREATE INDEX user_activity_created_at_idx ON user_activity(created_at);
CREATE INDEX country_activity_country_code_created_at_idx ON country_activity(country_code, created_at);
CREATE INDEX country_activity_created_at_idx ON country_activity(created_at);

-- Legacy leaderboard payouts table (for historical records)
CREATE TABLE leaderboard_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL, -- in cents
    week_start TIMESTAMPTZ NOT NULL,
    week_end TIMESTAMPTZ NOT NULL,
    paypal_payout_id TEXT,
    status TEXT NOT NULL, -- 'pending', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    batch_id TEXT,  -- Added for compatibility with new system
    paypal_email TEXT -- Added for compatibility with new system
);

-- Indexes for payout-related queries
CREATE INDEX leaderboard_payouts_week_start_idx ON leaderboard_payouts(week_start);
CREATE INDEX leaderboard_payouts_status_idx ON leaderboard_payouts(status);

-- Grant permissions for all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neondb_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;
