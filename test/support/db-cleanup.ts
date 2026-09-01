import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Wipes all app tables in FK-safe (children-first) order. Used to give each
 * e2e spec file a clean slate without relying on migration resets between
 * runs.
 */
export async function cleanupDatabase(prisma: PrismaService): Promise<void> {
  await prisma.reminder.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.deadline.deleteMany();
  await prisma.courseMember.deleteMany();
  await prisma.course.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
}
