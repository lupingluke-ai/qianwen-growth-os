import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  industry: text("industry").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  selfLevel: integer("self_level").notNull().default(1),
  targetLevel: integer("target_level").notNull().default(3),
  targetDate: text("target_date").notNull().default("2026-09-30"),
  status: text("status").notNull().default("进行中"),
  reviewStatus: text("review_status").notNull().default("草稿"),
  gap: text("gap").notNull().default(""),
  plan: text("plan").notNull().default(""),
  evidence: text("evidence").notNull().default(""),
  nextTask: text("next_task").notNull().default(""),
  lastCheckin: text("last_checkin").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workspaceUsers = sqliteTable("workspace_users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("member"),
  memberId: integer("member_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evidences = sqliteTable("evidences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  level: integer("level").notNull(),
  criterionKey: text("criterion_key").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("链接"),
  url: text("url").notNull().default(""),
  outcome: text("outcome").notNull().default(""),
  status: text("status").notNull().default("有效"),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  fromLevel: integer("from_level").notNull(),
  targetLevel: integer("target_level").notNull(),
  state: text("state").notNull().default("已提交"),
  cycle: text("cycle").notNull(),
  reviewerEmail: text("reviewer_email").notNull().default(""),
  reviewerName: text("reviewer_name").notNull().default("待分配"),
  feedback: text("feedback").notNull().default(""),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at").notNull().default(""),
});

export const levelHistory = sqliteTable("level_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  decision: text("decision").notNull(),
  reviewerEmail: text("reviewer_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const growthTasks = sqliteTable("growth_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("进行中"),
  linkedLevel: integer("linked_level").notNull(),
  linkedAnchor: text("linked_anchor").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  type: text("type").notNull(),
  industry: text("industry").notNull(),
  ownerMemberId: integer("owner_member_id").notNull(),
  reviewStatus: text("review_status").notNull().default("待审核"),
  complianceStatus: text("compliance_status").notNull().default("已自查"),
  reusePeople: integer("reuse_people").notNull().default(0),
  reuseClients: integer("reuse_clients").notNull().default(0),
  url: text("url").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
