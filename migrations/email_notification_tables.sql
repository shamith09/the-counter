-- Create table for counter milestones
CREATE TABLE IF NOT EXISTS counter_milestones (
    id SERIAL PRIMARY KEY,
    milestone BIGINT NOT NULL,
    counter_value BIGINT NOT NULL,
    reached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Indexing for efficient querying
    CONSTRAINT unique_milestone UNIQUE (milestone)
);

-- Create table for leaderboard history
CREATE TABLE IF NOT EXISTS leaderboard_history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    position INT NOT NULL,
    multiplications INT NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for leaderboard history
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_user_id ON leaderboard_history(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_recorded_at ON leaderboard_history(recorded_at);

-- Create email logs table for tracking email sends
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    subscription_id INT NOT NULL REFERENCES email_subscriptions(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for email logs
CREATE INDEX IF NOT EXISTS idx_email_logs_subscription_id ON email_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);

-- Add cleanup function for old email logs
CREATE OR REPLACE FUNCTION cleanup_old_email_logs() RETURNS void AS $$
BEGIN
    -- Delete email logs older than 90 days
    DELETE FROM email_logs
    WHERE created_at < (now() - interval '90 days');
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old leaderboard history
CREATE OR REPLACE FUNCTION cleanup_old_leaderboard_history() RETURNS void AS $$
BEGIN
    -- Keep only the last 30 days of leaderboard history
    DELETE FROM leaderboard_history
    WHERE recorded_at < (now() - interval '30 days');
END;
$$ LANGUAGE plpgsql;

-- If pg_cron extension is available, set up scheduled cleanup tasks
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Create cron job to automatically clean up old email logs
        PERFORM cron.schedule('0 2 * * *', $$SELECT cleanup_old_email_logs()$$);
        
        -- Create cron job to automatically clean up old leaderboard history
        PERFORM cron.schedule('15 2 * * *', $$SELECT cleanup_old_leaderboard_history()$$);
    ELSE
        RAISE NOTICE 'pg_cron extension not available, skipping scheduled tasks';
    END IF;
END
$$; 