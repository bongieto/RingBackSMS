-- Day-before confirmation SMS support. Cron picks up CONFIRMED meetings
-- ~24 hours out, sends "Reply C to confirm or R to reschedule", and
-- stamps confirmationSentAt so subsequent ticks skip the row. When the
-- caller replies, we stamp confirmedAt — surfaced in the dashboard so
-- operators see which bookings are truly locked in.

ALTER TABLE "Meeting"
  ADD COLUMN "confirmationSentAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt"        TIMESTAMP(3);
