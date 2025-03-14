import os
import modal
import logging
from datetime import datetime, timedelta
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("counter_bot_modal")

# Create Modal image with dependencies
image = modal.Image.debian_slim().pip_install(
    "tweepy==4.14.0",
    "python-dotenv==1.0.0",
    "psycopg2-binary==2.9.9",
    "redis==5.0.1",
)

# Create Modal app
app = modal.App("counter-bot", image=image)

# Create Modal secrets
secrets = modal.Secret.from_name("counter-bot-secret")


@app.function(
    secrets=[secrets],
    schedule=modal.Cron("0 */2 * * *"),  # Run every 2 hours
    timeout=60,
)
def post_counter_update():
    """Post the current counter value to Twitter."""
    import redis
    import tweepy

    logger.info("Posting counter update...")

    try:
        # Connect to Redis
        redis_client = redis.Redis(
            host=os.environ["REDIS_HOST"],
            port=os.environ["REDIS_PORT"],
            username=os.environ["REDIS_USERNAME"],
            password=os.environ["REDIS_PASSWORD"],
            decode_responses=True,
        )

        # Get counter value
        counter_value = redis_client.get("counter")
        if not counter_value:
            logger.error("Failed to get counter value from Redis")
            return

        # Format the counter value
        formatted_value = format_large_number(counter_value)

        # Create tweet text
        tweet_text = f"🔢 The Counter is now at: {formatted_value} 🔢\n\nKeep incrementing at thecounter [.] live\n\nhttps://thecounter.live"

        # Set up tweepy client with OAuth 1.0a
        client = tweepy.Client(
            bearer_token=os.environ["TWITTER_BEARER_TOKEN"],
            consumer_key=os.environ["TWITTER_API_KEY"],
            consumer_secret=os.environ["TWITTER_API_KEY_SECRET"],
            access_token=os.environ["TWITTER_ACCESS_TOKEN"],
            access_token_secret=os.environ["TWITTER_ACCESS_TOKEN_SECRET"],
        )

        # Post tweet
        response = client.create_tweet(text=tweet_text)

        logger.info(f"Counter update tweeted successfully: {response}")
    except Exception as e:
        logger.error(f"Error in post_counter_update: {e}")
    finally:
        if "redis_client" in locals():
            redis_client.close()


@app.function(
    secrets=[secrets],
    schedule=modal.Cron("5 0 * * 1"),  # Run at 12:05 AM every Monday
    timeout=60,
)
def post_weekly_winner():
    """Post the weekly winner to Twitter."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import tweepy

    logger.info("Posting weekly winner...")

    conn = None
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=os.environ["POSTGRES_PORT"],
            database=os.environ["POSTGRES_DB"],
            sslmode=os.environ["POSTGRES_SSL_MODE"],
        )

        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Calculate the date range for the past week
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)

        # Query to get the most recent successful payout from the past week
        query = """
        SELECT 
            p.user_id,
            p.user_email,
            p.paypal_email,
            p.amount,
            p.batch_id,
            p.created_at,
            u.username
        FROM 
            payouts p
        JOIN 
            users u ON p.user_id = u.id::text
        WHERE 
            p.status = 'completed' AND
            p.created_at BETWEEN %s AND %s
        ORDER BY 
            p.amount DESC, p.created_at DESC
        LIMIT 1
        """

        cursor.execute(query, (start_date, end_date))
        result = cursor.fetchone()

        # If no completed payouts in the past week, try to find any pending ones
        if not result:
            logger.info("No completed payouts found, checking for pending ones...")
            query = """
            SELECT 
                p.user_id,
                p.user_email,
                p.paypal_email,
                p.amount,
                p.batch_id,
                p.created_at,
                u.username
            FROM 
                payouts p
            JOIN 
                users u ON p.user_id = u.id::text
            WHERE 
                p.created_at BETWEEN %s AND %s
            ORDER BY 
                p.amount DESC, p.created_at DESC
            LIMIT 1
            """
            cursor.execute(query, (start_date, end_date))
            result = cursor.fetchone()

        if not result:
            logger.error("No weekly winner found")
            return

        # Create tweet text
        tweet_text = (
            f"🏆 Weekly Winner Announcement 🏆\n\n"
            f"Congratulations to {result['username']} for winning ${result['amount']} this week!\n\n"
            f"Join the competition at https://thecounter.live"
        )

        # Set up tweepy client with OAuth 1.0a
        client = tweepy.Client(
            bearer_token=os.environ["TWITTER_BEARER_TOKEN"],
            consumer_key=os.environ["TWITTER_API_KEY"],
            consumer_secret=os.environ["TWITTER_API_KEY_SECRET"],
            access_token=os.environ["TWITTER_ACCESS_TOKEN"],
            access_token_secret=os.environ["TWITTER_ACCESS_TOKEN_SECRET"],
        )

        # Post tweet
        response = client.create_tweet(text=tweet_text)

        logger.info(f"Weekly winner tweeted successfully: {response}")
    except Exception as e:
        logger.error(f"Error in post_weekly_winner: {e}")
    finally:
        if conn:
            conn.close()


def format_large_number(number_str):
    """Format a large number for display in a tweet."""
    try:
        # Convert to integer
        number = int(number_str)

        # Format with commas
        formatted = "{:,}".format(number)

        return formatted
    except Exception as e:
        logger.error(f"Error formatting number: {e}")
        return number_str


@app.function(secrets=[secrets])
def test_connections():
    """Test database and Redis connections."""
    import psycopg2
    import redis

    logger.info("Testing connections...")

    # Test PostgreSQL connection
    try:
        conn = psycopg2.connect(
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=os.environ["POSTGRES_PORT"],
            database=os.environ["POSTGRES_DB"],
            sslmode=os.environ["POSTGRES_SSL_MODE"],
        )

        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        logger.info(f"PostgreSQL connection successful. Version: {version[0]}")

        # Test query to the payouts table
        cursor.execute("SELECT COUNT(*) FROM payouts;")
        payout_count = cursor.fetchone()
        logger.info(f"Payouts count: {payout_count[0]}")

        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"PostgreSQL connection error: {e}")

    # Test Redis connection
    try:
        redis_client = redis.Redis(
            host=os.environ["REDIS_HOST"],
            port=os.environ["REDIS_PORT"],
            username=os.environ["REDIS_USERNAME"],
            password=os.environ["REDIS_PASSWORD"],
            decode_responses=True,
        )

        ping_result = redis_client.ping()
        logger.info(f"Redis connection successful. Ping result: {ping_result}")

        counter_value = redis_client.get("counter")
        logger.info(f"Current counter value: {counter_value}")

        redis_client.close()
    except Exception as e:
        logger.error(f"Redis connection error: {e}")


if __name__ == "__main__":
    # For local development and testing
    modal.runner.deploy_stub(app)
    test_connections.remote()
