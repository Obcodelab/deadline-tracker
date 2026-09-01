-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reminderChannels" "ReminderChannel"[] DEFAULT ARRAY['IN_APP', 'EMAIL']::"ReminderChannel"[];
