CREATE TABLE "WeeklyRevealSeen" (
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyRevealSeen_pkey" PRIMARY KEY ("userId", "teamId", "weekStartAt")
);

CREATE INDEX "WeeklyRevealSeen_teamId_weekStartAt_idx" ON "WeeklyRevealSeen"("teamId", "weekStartAt");

ALTER TABLE "WeeklyRevealSeen" ADD CONSTRAINT "WeeklyRevealSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyRevealSeen" ADD CONSTRAINT "WeeklyRevealSeen_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the authorized server API reads and writes completion records.
ALTER TABLE "WeeklyRevealSeen" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON "WeeklyRevealSeen" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON "WeeklyRevealSeen" FROM authenticated;
    END IF;
END $$;
