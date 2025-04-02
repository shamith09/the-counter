# Email Notification System: Quick Start Guide

This is a quick start guide for using The Counter's email notification system. For more detailed information, see `email-system.md`.

## Setup Steps

1. **Database Migration**
   - Run the SQL migration script in `migrations/email_notification_tables.sql` to create required tables
   - This will create `email_subscriptions`, `email_logs`, `counter_milestones`, and `leaderboard_history` tables

2. **Environment Variables**
   - Set `CRON_SECRET` for secure API access (use a strong random string)
   - For production email sending, configure email service credentials (currently mocked)

3. **Vercel Deployment**
   - Deploy to Vercel with the `vercel.json` configuration
   - This will set up all the scheduled tasks automatically

## Testing the System

### Manual Testing

1. **Test Email**
   - Use the admin test endpoint: `POST /api/admin/test-email`
   - Provide test email address and email type
   - Check logs for success/failure

   Example request:
   ```json
   {
     "emailType": "counter_update",
     "testEmail": "test@example.com",
     "counterValue": 1000000
   }
   ```

2. **Subscription Testing**
   - Create a subscription via the EmailSubscriptionDialog component
   - Test unsubscribing with the unsubscribe page (/unsubscribe?token=...)

### Testing Scheduled Tasks

Run these commands to test the scheduled tasks:

```bash
# Test counter milestone notifications
curl -X POST https://thecounter.live/api/tasks/notify-counter-milestone \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test 24h winner announcement
curl -X POST https://thecounter.live/api/tasks/notify-winner-announcement \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reminderType": "winner_24h"}'

# Test 1h winner announcement
curl -X POST https://thecounter.live/api/tasks/notify-winner-announcement \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reminderType": "winner_1h"}'

# Test leaderboard change notifications
curl -X POST https://thecounter.live/api/tasks/notify-leaderboard-change \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Monitoring

1. **Email Logs**
   - Query the `email_logs` table to see all email send attempts
   ```sql
   SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 100;
   ```

2. **Subscription Status**
   - Check subscription counts by type
   ```sql
   SELECT 
     COUNT(*) as total,
     SUM(CASE WHEN subscribe_counter_updates THEN 1 ELSE 0 END) as counter_updates,
     SUM(CASE WHEN subscribe_winner_24h THEN 1 ELSE 0 END) as winner_24h,
     SUM(CASE WHEN subscribe_winner_1h THEN 1 ELSE 0 END) as winner_1h,
     SUM(CASE WHEN subscribe_leaderboard_changes THEN 1 ELSE 0 END) as leaderboard_changes
   FROM email_subscriptions;
   ```

3. **Milestone Tracking**
   - Check recorded milestones
   ```sql
   SELECT * FROM counter_milestones ORDER BY reached_at DESC;
   ```

## Troubleshooting

1. **Email Not Sending**
   - Check `email_logs` for errors
   - Verify that the user has the correct subscription preferences
   - Check that the scheduled tasks are running as expected

2. **Database Issues**
   - Make sure all tables were created with the migration script
   - Check indexes for performance issues

3. **API Errors**
   - Verify that the `CRON_SECRET` is correctly set
   - Check server logs for API endpoint errors 