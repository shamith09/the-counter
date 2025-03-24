import { NextRequest, NextResponse } from "next/server";
import { db, getRedisClient } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  console.log("[test-connections] GET request received");

  // Define more specific types for our results
  interface PostgresStatus {
    status: string;
    version?: string;
    message?: string;
    payoutsCount?: number | string;
  }

  interface RedisStatus {
    status: string;
    ping?: string;
    counterValue?: string | null;
    message?: string;
  }

  interface TwitterStatus {
    status: string;
    apiKeyConfigured?: boolean;
    apiKeySecretConfigured?: boolean;
    accessTokenConfigured?: boolean;
    accessTokenSecretConfigured?: boolean;
  }

  interface TestResults {
    postgresql?: PostgresStatus;
    redis?: RedisStatus;
    twitter?: TwitterStatus;
  }

  const results: TestResults = {};

  try {
    // Check authorization
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";
    const authHeader = request.headers.get("Authorization");
    const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // If request isn't from an admin, return unauthorized
    if (!isVercelCron && !isValidApiKey) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Test PostgreSQL connection
    try {
      const versionResult = await db.query(db.sql`SELECT version()`);
      const version = Array.isArray(versionResult)
        ? versionResult[0]?.version
        : versionResult.rows?.[0]?.version;

      results.postgresql = {
        status: "connected",
        version,
      };

      // Test query to the payouts table
      const payoutsCountResult = await db.query(
        db.sql`SELECT COUNT(*) FROM payouts`,
      );
      const payoutCount = Array.isArray(payoutsCountResult)
        ? payoutsCountResult[0]?.count
        : payoutsCountResult.rows?.[0]?.count;

      results.postgresql.payoutsCount = payoutCount;
    } catch (error) {
      results.postgresql = {
        status: "error",
        message: String(error),
      };
    }

    // Test Redis connection
    try {
      const redisClient = getRedisClient();
      const pingResult = await redisClient.ping();

      results.redis = {
        status: "connected",
        ping: pingResult,
      };

      // Get counter value
      const counterValue = await redisClient.get("counter");
      results.redis.counterValue = counterValue;
    } catch (error) {
      results.redis = {
        status: "error",
        message: String(error),
      };
    }

    // Test Twitter API credentials
    results.twitter = {
      status: "checked",
      apiKeyConfigured: !!process.env.TWITTER_API_KEY,
      apiKeySecretConfigured: !!process.env.TWITTER_API_KEY_SECRET,
      accessTokenConfigured: !!process.env.TWITTER_ACCESS_TOKEN,
      accessTokenSecretConfigured: !!process.env.TWITTER_ACCESS_TOKEN_SECRET,
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error(`Error in test-connections: ${error}`);
    return NextResponse.json(
      {
        message: "Error testing connections",
        error: String(error),
        results,
      },
      { status: 500 },
    );
  }
}
