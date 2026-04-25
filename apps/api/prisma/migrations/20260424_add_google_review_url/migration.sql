-- Google Business Profile review nudge URL. When set, the post-rating
-- thank-you SMS to 4-5 star customers includes this link asking them
-- to leave a public review on Google. Nullable — operators opt in by
-- pasting their GBP review URL on the Settings page.

ALTER TABLE "TenantConfig"
  ADD COLUMN "googleReviewUrl" TEXT;
