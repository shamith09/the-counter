-- Add payment_confirmed column to ads table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT false;

-- Update existing ads to have payment_confirmed set to true
-- This assumes that existing ads have already been paid for
UPDATE ads SET payment_confirmed = true WHERE payment_confirmed IS NULL; 