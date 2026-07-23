import bcrypt from "bcryptjs";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { auditLogs, members, workspaceUsers } from "../../db/schema";
import type { ChatGPTUser } from "../chatgpt-auth";

export type WorkspaceRole = "member" | "reviewer" | "admin";
export type WorkspaceSessionUser = {
  email: string;
  displayName: string;
  role: WorkspaceRole;
  memberId: number;
};

const LOGIN_FAILURE_ACTION = "登录失败";
const LOGIN_FAILURE_WINDOW_MINUTES = 10;
export const LOGIN_FAILURE_LIMIT = 5;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function validateUser(email: string, password: string): Promise<WorkspaceSessionUser | null> {
  const db = await getDb();
  const [user] = await db
    .select({
      email: workspaceUsers.email,
      displayName: workspaceUsers.displayName,
      role: workspaceUsers.role,
      memberId: workspaceUsers.memberId,
      passwordHash: workspaceUsers.passwordHash,
    })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, email))
    .limit(1);
  if (!user?.passwordHash) return null;
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) return null;
  return { email: user.email, displayName: user.displayName, role: user.role as WorkspaceRole, memberId: user.memberId };
}

export async function countRecentLoginFailures(email: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.action, LOGIN_FAILURE_ACTION),
      eq(auditLogs.detail, email),
      gt(auditLogs.createdAt, sql`now() - make_interval(mins => ${LOGIN_FAILURE_WINDOW_MINUTES})`),
    ));
  return Number(row?.value || 0);
}

export async function recordLoginFailure(email: string): Promise<void> {
  await logAction(email, LOGIN_FAILURE_ACTION, "auth", 0, email);
}

export async function ensureWorkspaceUser(user: ChatGPTUser): Promise<WorkspaceSessionUser> {
  const db = await getDb();
  const [existing] = await db
    .select({
      email: workspaceUsers.email,
      displayName: workspaceUsers.displayName,
      role: workspaceUsers.role,
      memberId: workspaceUsers.memberId,
    })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, user.email))
    .limit(1);
  if (existing) {
    return { ...existing, role: existing.role as WorkspaceRole };
  }

  const [userCount] = await db.select({ value: count() }).from(workspaceUsers);
  const role: WorkspaceRole = Number(userCount?.value || 0) ? "member" : "admin";
  const [member] = await db.insert(members).values({
    userEmail: user.email,
    name: user.displayName,
    role: role === "admin" ? "能力管理员" : "团队成员",
    industry: "未分配",
    groupName: "综合组",
    currentLevel: 1,
    selfLevel: 1,
    targetLevel: 3,
    targetDate: "2026-09-30",
    status: "进行中",
    reviewStatus: "草稿",
    gap: "待添加第一条晋级证据",
    plan: "完成个人能力定位并添加第一条证据",
    nextTask: "完成首次能力定位",
  }).returning({ id: members.id });
  await db.insert(workspaceUsers).values({
    email: user.email,
    displayName: user.displayName,
    role,
    memberId: member.id,
  });
  await logAction(user.email, "创建身份档案", "member", member.id, `role=${role}`);
  return { email: user.email, displayName: user.displayName, role, memberId: member.id };
}

export async function logAction(actorEmail: string, action: string, entityType: string, entityId: number, detail = "") {
  const db = await getDb();
  await db.insert(auditLogs).values({ actorEmail, action, entityType, entityId, detail });
}
