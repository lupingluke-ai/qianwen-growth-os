import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { members, workspaceUsers } from "./db/schema";
import { countRecentLoginFailures, LOGIN_FAILURE_LIMIT, logAction, recordLoginFailure, validateUser, type WorkspaceRole } from "./app/lib/workspace-db";

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// DingTalk OAuth 通过自定义 API 路由实现（/api/auth/dingtalk/*)，不使用 next-auth 内置 OAuth provider
// 因为钉钉 token 端点不符合标准 OAuth2 格式（JSON body + 非标准字段名）

export async function findOrCreateDingTalkUser(unionId: string, nick: string, email?: string | null): Promise<{
  email: string;
  displayName: string;
  role: WorkspaceRole;
  memberId: number;
} | null> {
  const db = await getDb();

  // 1. 通过 dingtalk_union_id 查找已绑定用户
  const [existing] = await db
    .select({
      email: workspaceUsers.email,
      displayName: workspaceUsers.displayName,
      role: workspaceUsers.role,
      memberId: workspaceUsers.memberId,
    })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.dingtalkUnionId, unionId))
    .limit(1);

  if (existing) {
    return { ...existing, role: existing.role as WorkspaceRole };
  }

  // 2. 如果有 email，尝试通过 email 匹配已有用户并绑定
  if (email) {
    const [byEmail] = await db
      .select({
        email: workspaceUsers.email,
        displayName: workspaceUsers.displayName,
        role: workspaceUsers.role,
        memberId: workspaceUsers.memberId,
      })
      .from(workspaceUsers)
      .where(eq(workspaceUsers.email, email))
      .limit(1);

    if (byEmail) {
      // 绑定 dingtalk_union_id
      await db.update(workspaceUsers)
        .set({ dingtalkUnionId: unionId })
        .where(eq(workspaceUsers.email, email));
      return { ...byEmail, role: byEmail.role as WorkspaceRole };
    }
  }

  // 3. 新用户：自动创建账号
  const userEmail = email || `dingtalk_${unionId}@qianwen`;
  const displayName = nick || "钉钉用户";
  const role: WorkspaceRole = "member";

  const [member] = await db.insert(members).values({
    userEmail,
    name: displayName,
    role: "团队成员",
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
    email: userEmail,
    displayName,
    role,
    memberId: member.id,
    dingtalkUnionId: unionId,
  });

  await logAction(userEmail, "钉钉扫码注册", "member", member.id, `unionId=${unionId}`);
  return { email: userEmail, displayName, role, memberId: member.id };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "邮箱" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) throw new InvalidCredentialsError();
        if ((await countRecentLoginFailures(email)) >= LOGIN_FAILURE_LIMIT) throw new RateLimitedError();
        const user = await validateUser(email, password);
        if (!user) {
          await recordLoginFailure(email);
          throw new InvalidCredentialsError();
        }
        return { id: user.email, email: user.email, name: user.displayName, role: user.role, memberId: user.memberId };
      },
    }),
  ],
  callbacks: {

    jwt({ token, user }) {
      if (user) {
        token.role = user.role as WorkspaceRole;
        token.memberId = user.memberId;
        token.displayName = user.name || user.email || "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as WorkspaceRole) || "member";
        session.user.memberId = Number(token.memberId || 0);
        session.user.name = String(token.displayName || session.user.name || "");
      }
      return session;
    },
  },
});
