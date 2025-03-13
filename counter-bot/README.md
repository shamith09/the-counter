# Counter Twitter Bot

A Twitter/X bot that tweets the current counter value and weekly winners for [TheCounter.live](https://thecounter.live).

## Features

- Regularly tweets the current counter value
- Announces weekly winners every Monday
- Connects directly to the database for data access
- Configurable update intervals and announcement times
- Deployable on Modal for serverless execution

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   uv pip install -r requirements.txt
   ```
3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```
4. Fill in your Twitter API credentials and database connection details in the `.env` file

## Twitter API Setup

To use this bot, you'll need to:

1. Create a Twitter Developer account at [developer.twitter.com](https://developer.twitter.com)
2. Create a new project and app
3. Apply for Basic access (free tier)
4. Generate API keys and tokens (OAuth 1.0a)
5. Add these credentials to your `.env` file

### Important: Twitter API Access

This bot uses tweepy to interact with the Twitter API v2 endpoint for posting tweets. The bot uses OAuth 1.0a authentication with your API keys and tokens.

For posting tweets with tweepy, you need:
- API Key and API Key Secret
- Access Token and Access Token Secret
- The "OAuth 1.0a User Context" setting enabled in your Twitter Developer Portal
- Write permissions enabled for your app

Tweepy handles all the authentication and API interactions, making it easier to post tweets without dealing with the raw API endpoints.

## Database Setup

This bot is configured to work with Neon PostgreSQL databases:

1. Create a Neon account at [neon.tech](https://neon.tech)
2. Create a new project and database
3. Get your connection details from the Neon dashboard
4. Add these credentials to your `.env` file

The bot uses a connection pool for optimal performance with Neon's serverless PostgreSQL.

## Redis Setup

The bot requires Redis to access the current counter value:

1. Set up a Redis instance
2. Configure the connection details in your `.env` file

## Testing

To test your database and Redis connections:

```
python test_connection.py
```

This script will verify that your connections are working properly.

## Deployment on Modal

This bot is designed to run on [Modal](https://modal.com), a serverless platform for running Python code:

1. Install Modal CLI:
   ```
   uv pip install modal
   ```

2. Authenticate with Modal:
   ```
   modal token new
   ```

3. Deploy the bot:
   ```
   modal deploy modal_app.py
   ```

4. Test the connections:
   ```
   modal run modal_app.py::test_connections
   ```

The bot is configured with the following schedules:
- Counter updates: Every hour
- Weekly winner announcements: Every Monday at 9 AM

## Local Development

For local development and testing:

1. Run the bot locally:
   ```
   python main.py
   ```

2. Test the Modal app locally:
   ```
   modal run modal_app.py
   ```

## Alternative Deployment Options

If you prefer not to use Modal, you can also deploy using:

1. A process manager like PM2:
   ```
   npm install -g pm2
   pm2 start main.py --name counter-bot
   ```

2. Or create a systemd service:
   ```
   [Unit]
   Description=Counter Twitter Bot
   After=network.target

   [Service]
   User=yourusername
   WorkingDirectory=/path/to/counter-bot
   ExecStart=/usr/bin/python3 /path/to/counter-bot/main.py
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

## License

MIT 