-- Add auto_renew column to ads table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS ads_auto_renew_idx ON ads(auto_renew);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE ads TO neondb_owner;
