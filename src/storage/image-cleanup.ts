import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseStorageService } from './supabase-storage.service';

/** Call only after the write commits; retain objects referenced by any saved row. */
export async function removeUnreferencedImages(
  prisma: PrismaService,
  storage: SupabaseStorageService,
  urls: (string | null | undefined)[],
  logger: Logger,
): Promise<void> {
  try {
    const candidates = new Map<string, string>();
    for (const url of urls) {
      const path = storage.ownedObjectPath(url);
      if (path && url) candidates.set(path, url);
    }
    if (!candidates.size) return;

    // One snapshot includes inactive users/questions and completed exam answers.
    // Compare object identities, since query strings/encoding can vary per URL.
    const references = await prisma.$queryRaw<{ url: string }[]>(Prisma.sql`
      SELECT hinhanh AS url FROM cauhoi WHERE hinhanh IS NOT NULL
      UNION ALL
      SELECT hinhanh AS url FROM cautraloi WHERE hinhanh IS NOT NULL
      UNION ALL
      SELECT hinhanh AS url FROM hinhanh_traloi_tuluan WHERE hinhanh IS NOT NULL
      UNION ALL
      SELECT avatar AS url FROM nguoidung WHERE avatar IS NOT NULL
    `);
    for (const reference of references) {
      const path = storage.ownedObjectPath(reference.url);
      if (path) candidates.delete(path);
    }
    for (const url of candidates.values()) await storage.remove(url);
  } catch (error) {
    // Cleanup is best effort: a committed database write must still report success.
    logger.warn(
      `Image cleanup skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
