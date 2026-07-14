import { getChatGPTUser } from "../../chatgpt-auth";
import { db, ensureWorkspaceDatabase, ensureWorkspaceUser, logAction } from "../../lib/workspace-db";

type WorkspaceRole = "member" | "reviewer" | "admin";
type SessionUser = { email: string; displayName: string; role: WorkspaceRole; memberId: number };

type ActionPayload = {
  action?: string;
  memberId?: number;
  selfLevel?: number;
  targetLevel?: number;
  targetDate?: string;
  progressStatus?: string;
  gap?: string;
  plan?: string;
  nextTask?: string;
  level?: number;
  criterionKey?: string;
  title?: string;
  kind?: string;
  url?: string;
  outcome?: string;
  reviewId?: number;
  decision?: string;
  feedback?: string;
  assetType?: string;
  industry?: string;
  complianceConfirmed?: boolean;
};

const memberSelect = `
  SELECT m.id, m.name, m.role, m.industry,
    m.current_level AS currentLevel, m.self_level AS selfLevel,
    m.target_level AS targetLevel, m.target_date AS targetDate,
    m.status AS progressStatus, m.review_status AS reviewStatus,
    m.gap, m.plan, m.next_task AS nextTask, m.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM evidences e WHERE e.member_id = m.id) AS evidenceCount,
    (SELECT r.id FROM reviews r WHERE r.member_id = m.id AND r.state IN ('已提交','评审中','待补证') ORDER BY r.id DESC LIMIT 1) AS pendingReviewId,
    (SELECT COUNT(*) FROM growth_tasks t WHERE t.member_id = m.id AND (t.status = '逾期' OR (t.status != '已完成' AND t.due_date < date('now')))) AS overdueTasks
  FROM members m
`;

export async function GET() {
  try {
    await ensureWorkspaceDatabase();
    const chatGPTUser = await getChatGPTUser();
    const session = chatGPTUser ? await ensureWorkspaceUser(chatGPTUser) : null;
    const canSeePeople = session?.role === "admin" || session?.role === "reviewer";

    const memberResult = await db().prepare(`${memberSelect} ORDER BY m.current_level DESC, m.name ASC`).all<Record<string, unknown>>();
    const fullMembers = memberResult.results.map(row => normalizeMember(row));
    const members = fullMembers.map((member, index) => {
      if (canSeePeople || session?.memberId === member.id) return member;
      return {
        ...member,
        name: `成员 ${String(index + 1).padStart(2, "0")}`,
        role: "团队成员",
        gap: "",
        plan: "",
        nextTask: "登录后可查看",
      };
    });
    const myMember = session ? fullMembers.find(member => member.id === session.memberId) || null : null;

    const evidenceWhere = canSeePeople ? "" : session ? "WHERE e.member_id = ?" : "WHERE 1 = 0";
    const evidenceQuery = db().prepare(`
      SELECT e.id, e.member_id AS memberId, m.name AS memberName, e.level,
        e.criterion_key AS criterionKey, e.title, e.kind, e.url, e.outcome,
        e.status, e.created_at AS createdAt
      FROM evidences e JOIN members m ON m.id = e.member_id
      ${evidenceWhere} ORDER BY e.created_at DESC LIMIT 40
    `);
    const evidenceResult = await (evidenceWhere.includes("?") ? evidenceQuery.bind(session!.memberId) : evidenceQuery).all();

    const reviewWhere = canSeePeople ? "" : session ? "WHERE r.member_id = ?" : "WHERE 1 = 0";
    const reviewQuery = db().prepare(`
      SELECT r.id, r.member_id AS memberId, m.name AS memberName,
        r.from_level AS fromLevel, r.target_level AS targetLevel,
        r.state, r.cycle, r.reviewer_name AS reviewerName, r.feedback,
        r.submitted_at AS submittedAt, r.reviewed_at AS reviewedAt,
        (SELECT COUNT(*) FROM evidences e WHERE e.member_id = r.member_id AND e.level = r.target_level) AS evidenceCount
      FROM reviews r JOIN members m ON m.id = r.member_id
      ${reviewWhere} ORDER BY CASE r.state WHEN '已提交' THEN 1 WHEN '评审中' THEN 2 WHEN '待补证' THEN 3 ELSE 4 END, r.submitted_at DESC
    `);
    const reviewResult = await (reviewWhere.includes("?") ? reviewQuery.bind(session!.memberId) : reviewQuery).all();

    const assetResult = await db().prepare(`
      SELECT a.id, a.title, a.type, a.industry, m.name AS ownerName,
        a.review_status AS reviewStatus, a.compliance_status AS complianceStatus,
        a.reuse_people AS reusePeople, a.reuse_clients AS reuseClients,
        a.updated_at AS updatedAt, a.url
      FROM assets a JOIN members m ON m.id = a.owner_member_id
      ORDER BY CASE a.review_status WHEN '已发布' THEN 1 WHEN '审核中' THEN 2 ELSE 3 END, a.updated_at DESC
    `).all();
    const assets = assetResult.results.map(asset => session ? asset : { ...asset, ownerName: "团队成员" });

    return Response.json({
      authenticated: Boolean(session),
      me: session ? { displayName: session.displayName, email: session.email, role: session.role, memberId: session.memberId } : null,
      members,
      myMember,
      evidences: evidenceResult.results,
      reviews: reviewResult.results,
      assets,
      metrics: buildMetrics(fullMembers),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取工作区失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureWorkspaceDatabase();
    const chatGPTUser = await getChatGPTUser();
    if (!chatGPTUser) return Response.json({ error: "请先登录后再进行操作" }, { status: 401 });
    const session = await ensureWorkspaceUser(chatGPTUser);
    const payload = await request.json() as ActionPayload;
    if (!payload.action) return Response.json({ error: "缺少操作类型" }, { status: 400 });

    switch (payload.action) {
      case "update_checkin":
        await updateCheckin(session, payload);
        break;
      case "add_evidence":
        await addEvidence(session, payload);
        break;
      case "submit_review":
        await submitReview(session, payload);
        break;
      case "review_decision":
        await reviewDecision(session, payload);
        break;
      case "create_asset":
        await createAsset(session, payload);
        break;
      default:
        return Response.json({ error: "不支持的操作" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    const status = message.includes("权限") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}

async function updateCheckin(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  const current = await db().prepare("SELECT current_level AS currentLevel FROM members WHERE id = ?").bind(memberId).first<{ currentLevel: number }>();
  if (!current) throw new Error("成员不存在");
  const selfLevel = clampLevel(payload.selfLevel || current.currentLevel);
  const targetLevel = Math.max(selfLevel, clampLevel(payload.targetLevel || selfLevel));
  const progressStatus = ["正常", "进行中", "有风险", "阻塞"].includes(payload.progressStatus || "") ? payload.progressStatus! : "进行中";
  await db().prepare(`
    UPDATE members SET self_level = ?, target_level = ?, target_date = ?, status = ?,
      review_status = CASE WHEN review_status IN ('已通过','未通过') THEN '草稿' ELSE review_status END,
      gap = ?, plan = ?, next_task = ?, last_checkin = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    selfLevel, targetLevel, payload.targetDate || "2026-09-30", progressStatus,
    clean(payload.gap), clean(payload.plan), clean(payload.nextTask), memberId,
  ).run();
  await logAction(session.email, "更新周度进展", "member", memberId, `self=L${selfLevel};target=L${targetLevel}`);
}

async function addEvidence(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  if (!payload.title?.trim() || !payload.criterionKey?.trim()) throw new Error("请填写证据标题并关联通关标准");
  const level = clampLevel(payload.level || 1);
  const result = await db().prepare(`
    INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, created_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, '待核验', ?)
  `).bind(memberId, level, clean(payload.criterionKey), clean(payload.title), clean(payload.kind) || "链接", clean(payload.url), clean(payload.outcome), session.email).run();
  await db().prepare("UPDATE members SET review_status = '草稿', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(memberId).run();
  await logAction(session.email, "添加晋级证据", "evidence", Number(result.meta.last_row_id), `member=${memberId};level=${level}`);
}

async function submitReview(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  const member = await db().prepare("SELECT current_level AS currentLevel, target_level AS targetLevel FROM members WHERE id = ?")
    .bind(memberId).first<{ currentLevel: number; targetLevel: number }>();
  if (!member) throw new Error("成员不存在");
  const evidence = await db().prepare("SELECT COUNT(*) AS count FROM evidences WHERE member_id = ? AND level = ?")
    .bind(memberId, member.targetLevel).first<{ count: number }>();
  if (!evidence?.count) throw new Error("至少添加 1 条目标层级证据后才能提交评审");
  const active = await db().prepare("SELECT id FROM reviews WHERE member_id = ? AND state IN ('已提交','评审中','待补证') LIMIT 1").bind(memberId).first();
  if (active) throw new Error("已有进行中的晋级评审");
  const cycle = new Date().toISOString().slice(0, 7);
  const result = await db().prepare(`
    INSERT INTO reviews (member_id, from_level, target_level, state, cycle)
    VALUES (?, ?, ?, '已提交', ?)
  `).bind(memberId, member.currentLevel, member.targetLevel, cycle).run();
  await db().prepare("UPDATE members SET review_status = '已提交', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(memberId).run();
  await logAction(session.email, "提交晋级评审", "review", Number(result.meta.last_row_id), `L${member.currentLevel}->L${member.targetLevel}`);
}

async function reviewDecision(session: SessionUser, payload: ActionPayload) {
  if (session.role !== "admin" && session.role !== "reviewer") throw new Error("没有评审权限");
  if (!payload.reviewId) throw new Error("缺少评审 ID");
  if (!["已通过", "待补证", "未通过"].includes(payload.decision || "")) throw new Error("请选择评审结论");
  const review = await db().prepare("SELECT id, member_id AS memberId, from_level AS fromLevel, target_level AS targetLevel FROM reviews WHERE id = ?")
    .bind(payload.reviewId).first<{ id: number; memberId: number; fromLevel: number; targetLevel: number }>();
  if (!review) throw new Error("评审不存在");
  await db().prepare(`
    UPDATE reviews SET state = ?, reviewer_email = ?, reviewer_name = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(payload.decision, session.email, session.displayName, clean(payload.feedback), review.id).run();
  if (payload.decision === "已通过") {
    await db().batch([
      db().prepare("UPDATE members SET current_level = ?, self_level = MAX(self_level, ?), review_status = '已通过', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(review.targetLevel, review.targetLevel, review.memberId),
      db().prepare("INSERT INTO level_history (member_id, from_level, to_level, decision, reviewer_email) VALUES (?, ?, ?, '已通过', ?)")
        .bind(review.memberId, review.fromLevel, review.targetLevel, session.email),
    ]);
  } else {
    await db().prepare("UPDATE members SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(payload.decision, review.memberId).run();
  }
  await logAction(session.email, "完成晋级评审", "review", review.id, payload.decision);
}

async function createAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.complianceConfirmed) throw new Error("提交资产前必须完成合规自查");
  if (!payload.title?.trim() || !payload.assetType?.trim() || !payload.industry?.trim()) throw new Error("请完整填写资产信息");
  const memberId = await authorizedMemberId(session, payload.memberId);
  const result = await db().prepare(`
    INSERT INTO assets (title, type, industry, owner_member_id, review_status, compliance_status, url)
    VALUES (?, ?, ?, ?, '待审核', '已自查', ?)
  `).bind(clean(payload.title), clean(payload.assetType), clean(payload.industry), memberId, clean(payload.url)).run();
  await logAction(session.email, "提交团队资产", "asset", Number(result.meta.last_row_id), clean(payload.title));
}

async function authorizedMemberId(session: SessionUser, requested?: number) {
  const memberId = requested || session.memberId;
  if (memberId !== session.memberId && session.role !== "admin") throw new Error("没有修改该成员的权限");
  return memberId;
}

function normalizeMember(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    role: String(row.role || ""),
    industry: String(row.industry || ""),
    currentLevel: Number(row.currentLevel || 1),
    selfLevel: Number(row.selfLevel || row.currentLevel || 1),
    targetLevel: Number(row.targetLevel || 3),
    targetDate: String(row.targetDate || ""),
    progressStatus: String(row.progressStatus || "进行中"),
    reviewStatus: String(row.reviewStatus || "草稿"),
    gap: String(row.gap || ""),
    plan: String(row.plan || ""),
    nextTask: String(row.nextTask || ""),
    updatedAt: String(row.updatedAt || ""),
    evidenceCount: Number(row.evidenceCount || 0),
    pendingReviewId: row.pendingReviewId ? Number(row.pendingReviewId) : null,
    overdueTasks: Number(row.overdueTasks || 0),
  };
}

function buildMetrics(members: ReturnType<typeof normalizeMember>[]) {
  const levels = members.map(member => member.currentLevel).sort((a, b) => a - b);
  const count = members.length;
  const average = count ? levels.reduce((sum, level) => sum + level, 0) / count : 0;
  const median = count ? (levels[Math.floor((count - 1) / 2)] + levels[Math.ceil((count - 1) / 2)]) / 2 : 0;
  const distribution = Array.from({ length: 10 }, (_, index) => levels.filter(level => level === index + 1).length);
  const pendingReviews = members.filter(member => member.pendingReviewId !== null).length;
  const totalEvidenceTarget = Math.max(1, members.reduce((sum, member) => sum + Math.max(3, member.targetLevel - member.currentLevel + 2), 0));
  return {
    memberCount: count,
    average: Number(average.toFixed(1)),
    median,
    l3Rate: count ? Math.round(members.filter(member => member.currentLevel >= 3).length / count * 100) : 0,
    l6Rate: count ? Math.round(members.filter(member => member.currentLevel >= 6).length / count * 100) : 0,
    atRisk: members.filter(member => ["有风险", "阻塞"].includes(member.progressStatus)).length,
    overdue: members.reduce((sum, member) => sum + member.overdueTasks, 0),
    pendingReviews,
    evidenceCompletion: Math.min(100, Math.round(members.reduce((sum, member) => sum + member.evidenceCount, 0) / totalEvidenceTarget * 100)),
    distribution,
    reviewReady: Math.max(0, count - pendingReviews),
  };
}

function clampLevel(value: number) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
}

function clean(value?: string) {
  return String(value || "").trim().slice(0, 2000);
}
