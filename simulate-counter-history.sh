#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  source .env
fi

# Database connection parameters
DB_USER="neondb_owner"
DB_PASSWORD="npg_dR6DZk3apMIg"
DB_HOST="ep-royal-base-a5h7jn05-pooler.us-east-2.aws.neon.tech"
DB_PORT="5432"
DB_NAME="neondb"
DB_SSLMODE="require"

echo "Simulating counter history for the past week..."

# Generate SQL to insert counter history entries
# We'll create one entry every 5 minutes for the past 7 days
# Starting with a large number and incrementing randomly

# Function to generate a random number between min and max
random() {
  echo $(( $RANDOM % ($2 - $1 + 1) + $1 ))
}

# Create a temporary SQL file
TMP_SQL=$(mktemp)

# Start with a large counter value
COUNTER="1000000000000000"

# Write SQL header
cat > $TMP_SQL << EOF
-- Simulation of counter history for the past week
BEGIN;

-- First, let's clean up any existing detailed records from the past week
DELETE FROM counter_history 
WHERE granularity = 'detailed' 
AND timestamp > NOW() - INTERVAL '7 days';

EOF

# Calculate timestamps and generate SQL for each entry
# One entry every 5 minutes for 7 days = 7 * 24 * 12 = 2016 entries
TOTAL_ENTRIES=$((7 * 24 * 12))
echo "Generating $TOTAL_ENTRIES entries..."

for i in $(seq $TOTAL_ENTRIES -1 1); do
  # Calculate minutes ago
  MINUTES_AGO=$((i * 5))
  
  # Generate a random increment between 1 and 100
  INCREMENT=$(random 1 100)
  
  # Increment the counter
  COUNTER=$((COUNTER + INCREMENT))
  
  # Add SQL for this entry
  echo "INSERT INTO counter_history (count, timestamp, granularity) VALUES ('$COUNTER', NOW() - INTERVAL '$MINUTES_AGO minutes', 'detailed');" >> $TMP_SQL
  
  # Show progress every 100 entries
  if [ $((i % 100)) -eq 0 ]; then
    echo "Generated entry $((TOTAL_ENTRIES - i + 1))/$TOTAL_ENTRIES"
  fi
done

# Commit transaction
echo "COMMIT;" >> $TMP_SQL

echo "Executing SQL..."

# Execute the SQL file
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $TMP_SQL

# Clean up
rm $TMP_SQL

echo "Simulation complete!"
echo "To test aggregation, run the following API routes:"
echo "1. /api/tasks/aggregate-hourly-history - Aggregates detailed records into hourly"
echo "2. /api/tasks/aggregate-daily-history - Aggregates hourly records into daily" 