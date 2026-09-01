-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateTable
CREATE TABLE "reminders" (
    "pkid" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "deadlineId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminders_pkid_key" ON "reminders"("pkid");

-- CreateIndex
CREATE INDEX "reminders_userId_sentAt_idx" ON "reminders"("userId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_deadlineId_userId_offsetMinutes_channel_key" ON "reminders"("deadlineId", "userId", "offsetMinutes", "channel");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
