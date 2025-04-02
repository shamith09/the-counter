# The Counter Email Notification System

This document outlines the email notification system for The Counter, including its components, configuration, and how to manage it.

## Overview

The email notification system allows users to subscribe to various types of notifications related to The Counter. The system is designed to be scalable and maintainable, with features like batch processing, error logging, and unsubscribe capabilities.

## Notification Types

The following notification types are supported:

1. **Counter Updates** (`counter_update`) - Sent when The Counter reaches significant milestones
2. **24h Winner Announcements** (`winner_24h`) - Sent 24 hours before the weekly winner is announced
3. **1h Winner Announcements** (`winner_1h`) - Sent 1 hour before the weekly winner is announced
4. **Leaderboard Changes** (`leaderboard_change`) - Sent when a user is overtaken on the leaderboard

## Database Schema

The email system uses the following database tables:

### `email_subscriptions`

Stores user subscription preferences and contact information.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_uuid | UUID | User UUID (may be NULL for anonymous subscribers) |
| email | VARCHAR(255) | Email address |
| unsubscribe_token | UUID | Unique token for unsubscribing |
| subscribe_counter_updates | BOOLEAN | Whether to receive counter milestone updates |
| subscribe_winner_24h | BOOLEAN | Whether to receive 24h winner announcements |
| subscribe_winner_1h | BOOLEAN | Whether to receive 1h winner announcements |
| subscribe_leaderboard_changes | BOOLEAN | Whether to receive leaderboard change notifications |
| created_at | TIMESTAMP | When the subscription was created |
| updated_at | TIMESTAMP | When the subscription was last updated |

### `email_logs`

Tracks all email sends and any errors that occur.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| subscription_id | INT | References email_subscriptions.id |
| email | VARCHAR(255) | Email address |
| subject | VARCHAR(255) | Email subject line |
| email_type | VARCHAR(50) | Type of email (counter_update, winner_24h, etc.) |
| success | BOOLEAN | Whether the email was sent successfully |
| error_message | TEXT | Error message if sending failed |
| created_at | TIMESTAMP | When the email was sent |

### `counter_milestones`

Records when counter milestones are reached.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| milestone | BIGINT | The milestone value |
| counter_value | BIGINT | The exact counter value when milestone was reached |
| reached_at | TIMESTAMP | When the milestone was reached |

### `leaderboard_history`

Tracks leaderboard positions over time.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_id | VARCHAR(255) | User ID |
| username | VARCHAR(255) | Username |
| position | INT | Position on the leaderboard |
| multiplications | INT | Number of multiplications |
| recorded_at | TIMESTAMP | When this leaderboard entry was recorded |

## API Endpoints

### Email Subscription

- `POST /api/email/subscribe` - Subscribe to email notifications
- `POST /api/email/unsubscribe` - Unsubscribe from all notifications (uses token)
- `GET /api/email/subscription-status` - Check subscription status (requires authentication)
- `PUT /api/email/update-preferences` - Update notification preferences (requires authentication)

### Email Notification Tasks

- `POST /api/tasks/send-emails` - Batch-sends emails by type
- `POST /api/tasks/notify-counter-milestone` - Checks for new milestones and sends notifications
- `POST /api/tasks/notify-winner-announcement` - Sends winner announcement reminders
- `POST /api/tasks/notify-leaderboard-change` - Notifies users of leaderboard position changes

### Admin Tools

- `POST /api/admin/test-email` - Sends a test email (admin only)

## Scheduled Tasks

The following tasks are scheduled in Vercel:

| Path | Schedule | Description |
|------|----------|-------------|
| /api/tasks/notify-counter-milestone | */5 * * * * | Check for counter milestones every 5 minutes |
| /api/tasks/notify-winner-announcement | 0 0 * * 0 | Send 24h winner announcements at midnight on Sundays |
| /api/tasks/notify-winner-announcement | 0 23 * * 0 | Send 1h winner announcements at 11 PM on Sundays |
| /api/tasks/notify-leaderboard-change | 30 */2 * * * | Check for leaderboard changes every 2 hours |

## Email Templates

Email templates are defined inline in the code. Each email type has:

1. A subject line
2. HTML content
3. An unsubscribe footer

### Example Counter Update Email

```
Subject: The Counter has reached 1,000,000!

<p>The Counter has now reached <strong>1,000,000</strong>!</p>
<p>Visit <a href="https://thecounter.live">thecounter.live</a> to join the action.</p>

<p style="font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
  You're receiving this email because you subscribed to notifications from The Counter.
  <br>
  <a href="https://thecounter.live/unsubscribe?token=abc123">Unsubscribe from all emails</a>
</p>
```

## Future Improvements

Potential improvements to the email system:

1. **Email Service Integration** - Integrate with a proper email service like SendGrid, Mailgun, or AWS SES
2. **HTML Email Templates** - Move templates to separate files with better design
3. **Individual Unsubscribe Options** - Allow users to unsubscribe from specific notification types
4. **Email Frequency Controls** - Let users control how often they receive emails
5. **A/B Testing** - Test different email formats and content
6. **Email Analytics** - Track open rates, click-through rates, etc.

## Monitoring and Maintenance

- **Email Logs** - Check the `email_logs` table to monitor sending success/failure
- **Cleanup Jobs** - Scheduled tasks automatically clean up old logs and history
- **Testing** - Use the admin test email feature to verify the system is working 