#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  source .env
fi

# Database connection parameters
DB_USER=${POSTGRES_USER:-postgres}
DB_PASSWORD=${POSTGRES_PASSWORD:-postgres}
DB_HOST=${POSTGRES_HOST:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DB:-counter}

echo "Applying schema to database $DB_NAME on $DB_HOST:$DB_PORT..."

# Apply the schema
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f schema.sql

if [ $? -eq 0 ]; then
  echo "Schema applied successfully!"
else
  echo "Error applying schema!"
  exit 1
fi 