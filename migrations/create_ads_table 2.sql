-- Create ads table for storing marquee advertisements
CREATE TABLE ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 50),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT
);

-- Create indexes for performance
CREATE INDEX ads_active_idx ON ads(active);
CREATE INDEX ads_expires_at_idx ON ads(expires_at);
CREATE INDEX ads_stripe_subscription_id_idx ON ads(stripe_subscription_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE ads TO neondb_owner;
