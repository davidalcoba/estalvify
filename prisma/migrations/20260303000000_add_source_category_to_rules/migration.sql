-- AlterTable: add optional sourceCategoryId to category_rules for re-categorization filtering
ALTER TABLE "category_rules" ADD COLUMN "sourceCategoryId" TEXT;

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
