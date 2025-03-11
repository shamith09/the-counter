import { Redis } from "ioredis";
import { neon } from "@neondatabase/serverless";
import { Pool, PoolClient } from "@neondatabase/serverless";

// Create a database client
export const sql = neon(process.env.DATABASE_URL!);

// Create a connection pool for transactions and more complex queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Define types for database operations
type SqlQuery = ReturnType<typeof sql>;
type DbClient = PoolClient;

// Define a custom QueryResult interface
interface QueryResult {
  rows: Record<string, unknown>[];
  [key: string]: unknown;
}

// Export a db object with query and transaction methods
export const db = {
  sql,
  query: async (query: SqlQuery): Promise<QueryResult> => {
    const result = await query;
    return {
      rows: Array.isArray(result) ? (result as Record<string, unknown>[]) : [],
    };
  },
  transaction: async <T>(
    callback: (client: DbClient) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};

// Redis connection
let redisClient: Redis | null = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      username: process.env.REDIS_USERNAME || "",
      password: process.env.REDIS_PASSWORD || "",
    });
  }
  return redisClient;
}

// Helper function to close connections when needed (e.g., during testing or server shutdown)
export async function closeConnections() {
  // Close Redis connection if it exists
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }

  // Close Neon pool
  await pool.end();
}
