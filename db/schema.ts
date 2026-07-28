import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  name: text("name").notNull(),
  role: text("role").notNull(),
  industry: text("industry").notNull(),
  groupName: text("group_name").notNull().default("综合组"),
  currentLevel: integer("current_level").notNull().default(0),
  selfLevel: integer("self_level").notNull().default(0),
  targetLevel: integer("target_level").notNull().default(3),
  targetDate: text("target_date").notNull().default("2026-09-30"),
  status: text("status").notNull().default("进行中"),
  reviewStatus: text("review_status").notNull().default("草稿"),
  gap: text("gap").notNull().default(""),
  plan: text("plan").notNull().default(""),
  evidence: text("evidence").notNull().default(""),
  nextTask: text("next_task").notNull().default(""),
  lastCheckin: timestamp("last_checkin", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  uniqueIndex("members_user_email_unique").on(table.userEmail),
  index("members_industry_idx").on(table.industry),
  index("members_group_idx").on(table.groupName),
]);

export const workspaceUsers = pgTable("workspace_users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("member"),
  memberId: integer("member_id").notNull().references(() => members.id),
  passwordHash: text("password_hash").notNull().default(""),
  dingtalkUnionId: text("dingtalk_union_id"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const evidences = pgTable("evidences", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  level: integer("level").notNull(),
  criterionKey: text("criterion_key").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("链接"),
  url: text("url").notNull().default(""),
  outcome: text("outcome").notNull().default(""),
  status: text("status").notNull().default("有效"),
  nominateAsset: integer("nominate_asset").notNull().default(0),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  index("evidence_member_idx").on(table.memberId),
]);

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  fromLevel: integer("from_level").notNull(),
  targetLevel: integer("target_level").notNull(),
  state: text("state").notNull().default("已提交"),
  cycle: text("cycle").notNull(),
  reviewerEmail: text("reviewer_email").notNull().default(""),
  reviewerName: text("reviewer_name").notNull().default("待分配"),
  frameworkVersionId: integer("framework_version_id").notNull().default(0),
  feedback: text("feedback").notNull().default(""),
  submittedAt: timestamp("submitted_at", { mode: "string" }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { mode: "string" }),
}, table => [
  index("review_member_idx").on(table.memberId),
]);

export const levelHistory = pgTable("level_history", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  decision: text("decision").notNull(),
  reviewerEmail: text("reviewer_email").notNull(),
  frameworkVersionId: integer("framework_version_id").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const growthTasks = pgTable("growth_tasks", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("进行中"),
  linkedLevel: integer("linked_level").notNull(),
  linkedAnchor: text("linked_anchor").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  industry: text("industry").notNull(),
  ownerMemberId: integer("owner_member_id").notNull().references(() => members.id),
  sourceEvidenceId: integer("source_evidence_id").notNull().default(0),
  reviewStatus: text("review_status").notNull().default("待审核"),
  reviewFeedback: text("review_feedback"),
  complianceStatus: text("compliance_status").notNull().default("已自查"),
  reusePeople: integer("reuse_people").notNull().default(0),
  reuseClients: integer("reuse_clients").notNull().default(0),
  url: text("url").notNull().default(""),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  index("asset_industry_idx").on(table.industry),
]);

export const frameworkVersions = pgTable("framework_versions", {
  id: serial("id").primaryKey(),
  versionName: text("version_name").notNull(),
  status: text("status").notNull().default("草稿"),
  changeNote: text("change_note").notNull().default(""),
  createdByEmail: text("created_by_email").notNull().default("system"),
  publishedAt: timestamp("published_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const frameworkLevels = pgTable("framework_levels", {
  id: serial("id").primaryKey(),
  frameworkVersionId: integer("framework_version_id").notNull().references(() => frameworkVersions.id),
  level: integer("level").notNull(),
  title: text("title").notNull(),
  role: text("role").notNull(),
  stage: text("stage").notNull(),
  definition: text("definition").notNull(),
  standard: text("standard").notNull(),
  abilitiesJson: text("abilities_json").notNull().default("[]"),
  criteriaJson: text("criteria_json").notNull().default("[]"),
  practicesJson: text("practices_json").notNull().default("[]"),
  path: text("path").notNull().default(""),
  badgesJson: text("badges_json").notNull().default("[]"),
  resourcesJson: text("resources_json").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  index("framework_level_version_idx").on(table.frameworkVersionId, table.level),
]);

export const feedbacks = pgTable("feedbacks", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id),
  createdByEmail: text("created_by_email").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  pageName: text("page_name").notNull(),
  screenshot: text("screenshot"),
  status: text("status").notNull().default("open"),
  adminResponse: text("admin_response"),
  resolvedAt: timestamp("resolved_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  index("feedback_member_idx").on(table.memberId),
  index("feedback_status_idx").on(table.status),
]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, table => [
  index("audit_action_created_idx").on(table.action, table.createdAt),
]);
