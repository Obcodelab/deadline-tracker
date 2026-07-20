-- CreateEnum
CREATE TYPE "AcademicTerm" AS ENUM ('FIRST_SEMESTER', 'SECOND_SEMESTER');

-- CreateEnum
CREATE TYPE "CourseRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "DeadlineType" AS ENUM ('ASSIGNMENT', 'EXAM', 'MILESTONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "checklist_items" (
    "pkid" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "deadlineId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_members" (
    "pkid" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CourseRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "pkid" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "term" "AcademicTerm" NOT NULL,
    "color" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "pkid" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DeadlineType" NOT NULL,
    "courseId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" "Priority" NOT NULL,
    "description" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_pkid_key" ON "checklist_items"("pkid");

-- CreateIndex
CREATE INDEX "checklist_items_deadlineId_idx" ON "checklist_items"("deadlineId");

-- CreateIndex
CREATE UNIQUE INDEX "course_members_pkid_key" ON "course_members"("pkid");

-- CreateIndex
CREATE INDEX "course_members_userId_idx" ON "course_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "course_members_courseId_userId_key" ON "course_members"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_pkid_key" ON "courses"("pkid");

-- CreateIndex
CREATE UNIQUE INDEX "courses_joinCode_key" ON "courses"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "courses_ownerId_code_key" ON "courses"("ownerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "deadlines_pkid_key" ON "deadlines"("pkid");

-- CreateIndex
CREATE INDEX "deadlines_courseId_idx" ON "deadlines"("courseId");

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_members" ADD CONSTRAINT "course_members_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_members" ADD CONSTRAINT "course_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
