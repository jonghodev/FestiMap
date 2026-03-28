-- AlterTable: add contactInfo and website fields to events
ALTER TABLE "events" ADD COLUMN "contactInfo" TEXT;
ALTER TABLE "events" ADD COLUMN "website" TEXT;
