ALTER TABLE "farm_subscriptions" DROP CONSTRAINT "farm_subscriptions_plan_check";
--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD CONSTRAINT "farm_subscriptions_plan_check"
CHECK ("plan" IN ('free', 'orion', 'cam2', 'cam4', 'cam6', 'cam8', 'cam12', 'cam16'));
