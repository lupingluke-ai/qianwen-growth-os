import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  industry: text("industry").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  targetLevel: integer("target_level").notNull().default(3),
  targetDate: text("target_date").notNull().default("2026-09-30"),
  status: text("status").notNull().default("进行中"),
  gap: text("gap").notNull().default(""),
  plan: text("plan").notNull().default(""),
  evidence: text("evidence").notNull().default(""),
  nextTask: text("next_task").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
