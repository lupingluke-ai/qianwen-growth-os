import { getChatGPTUser } from "../../chatgpt-auth";
import { db, ensureWorkspaceDatabase, ensureWorkspaceUser, logAction } from "../../lib/workspace-db";
import type { LevelDefinition } from "../../types";

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
  nominateAsset?: boolean;
  reviewId?: number;
  reviewerEmail?: string;
  decision?: string;
  feedback?: string;
  assetId?: number;
  assetType?: string;
  industry?: string;
  complianceConfirmed?: boolean;
  email?: string;
  role?: WorkspaceRole;
  groupName?: string;
  frameworkLevel?: LevelDefinition;
  changeNote?: string;
};

const memberSelect = `
  SELECT m.id, m.name, m.role, m.industry, m.group_name AS groupName,
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
    const fullMembers = memberResult.results.map(normalizeMember);
    const members = fullMembers.map((member, index) => {
      if (canSeePeople || session?.memberId === member.id) return member;
      return { ...member, name: `成员 ${String(index + 1).padStart(2, "0")}`, role: "团队成员", gap: "", plan: "", nextTask: "登录后可查看" };
    });
    const myMember = session ? fullMembers.find(member => member.id === session.memberId) || null : null;

    const evidenceWhere = canSeePeople ? "" : session ? "WHERE e.member_id = ?" : "WHERE 1 = 0";
    const evidenceQuery = db().prepare(`
      SELECT e.id, e.member_id AS memberId, m.name AS memberName, e.level,
        e.criterion_key AS criterionKey, e.title, e.kind, e.url, e.outcome,
        e.status, e.nominate_asset AS nominateAsset, e.created_at AS createdAt
      FROM evidences e JOIN members m ON m.id = e.member_id
      ${evidenceWhere} ORDER BY e.created_at DESC LIMIT 80
    `);
    const evidenceResult = await (evidenceWhere.includes("?") ? evidenceQuery.bind(session!.memberId) : evidenceQuery).all();

    const reviewFilter = !session
      ? { sql: "WHERE 1 = 0", values: [] as unknown[] }
      : session.role === "admin"
        ? { sql: "", values: [] as unknown[] }
        : session.role === "reviewer"
          ? { sql: "WHERE r.member_id = ? OR r.reviewer_email = ?", values: [session.memberId, session.email] }
          : { sql: "WHERE r.member_id = ?", values: [session.memberId] };
    const reviewQuery = db().prepare(`
      SELECT r.id, r.member_id AS memberId, m.name AS memberName,
        r.from_level AS fromLevel, r.target_level AS targetLevel,
        r.state, r.cycle, r.reviewer_email AS reviewerEmail, r.reviewer_name AS reviewerName,
        r.framework_version_id AS frameworkVersionId, r.feedback,
        r.submitted_at AS submittedAt, r.reviewed_at AS reviewedAt,
        (SELECT COUNT(*) FROM evidences e WHERE e.member_id = r.member_id AND e.level = r.target_level) AS evidenceCount
      FROM reviews r JOIN members m ON m.id = r.member_id
      ${reviewFilter.sql}
      ORDER BY CASE r.state WHEN '已提交' THEN 1 WHEN '评审中' THEN 2 WHEN '待补证' THEN 3 ELSE 4 END, r.submitted_at DESC
    `);
    const reviewResult = await reviewQuery.bind(...reviewFilter.values).all();

    const assetResult = await db().prepare(`
      SELECT a.id, a.title, a.type, a.industry, m.name AS ownerName,
        a.source_evidence_id AS sourceEvidenceId, a.review_status AS reviewStatus,
        a.compliance_status AS complianceStatus, a.reuse_people AS reusePeople,
        a.reuse_clients AS reuseClients, a.updated_at AS updatedAt, a.url
      FROM assets a JOIN members m ON m.id = a.owner_member_id
      ORDER BY CASE a.review_status WHEN '已发布' THEN 1 WHEN '待审核' THEN 2 ELSE 3 END, a.updated_at DESC
    `).all();
    const assets = assetResult.results.map(asset => session ? asset : { ...asset, ownerName: "团队成员" });

    const reviewers = session ? (await db().prepare(`
      SELECT wu.email, wu.display_name AS displayName, wu.role, wu.member_id AS memberId,
        m.group_name AS groupName, m.industry,
        (SELECT COUNT(*) FROM reviews r WHERE r.reviewer_email = wu.email AND r.state IN ('已提交','评审中','待补证')) AS pendingCount
      FROM workspace_users wu JOIN members m ON m.id = wu.member_id
      WHERE wu.role IN ('reviewer','admin')
      ORDER BY pendingCount ASC, wu.display_name ASC
    `).all()).results : [];

    const framework = await loadFramework(session);
    const workspaceUsers = session?.role === "admin" ? (await db().prepare(`
      SELECT wu.email, wu.display_name AS displayName, wu.role, wu.member_id AS memberId,
        m.group_name AS groupName, m.industry
      FROM workspace_users wu JOIN members m ON m.id = wu.member_id
      ORDER BY CASE wu.role WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END, wu.display_name
    `).all()).results : [];

    return Response.json({
      authenticated: Boolean(session),
      me: session ? { displayName: session.displayName, email: session.email, role: session.role, memberId: session.memberId } : null,
      members,
      myMember,
      evidences: evidenceResult.results,
      reviews: reviewResult.results,
      assets,
      reviewers,
      workspaceUsers,
      levels: framework.published.levels,
      framework,
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
      case "update_checkin": await updateCheckin(session, payload); break;
      case "add_evidence": await addEvidence(session, payload); break;
      case "submit_review": await submitReview(session, payload); break;
      case "review_decision": await reviewDecision(session, payload); break;
      case "create_asset": await createAsset(session, payload); break;
      case "review_asset": await reviewAsset(session, payload); break;
      case "update_user_access": await updateUserAccess(session, payload); break;
      case "save_framework_level": await saveFrameworkLevel(session, payload); break;
      case "publish_framework": await publishFramework(session, payload); break;
      default: return Response.json({ error: "不支持的操作" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    const status = message.includes("权限") || message.includes("只有管理员") || message.includes("只能处理") ? 403 : 400;
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
  `).bind(selfLevel, targetLevel, payload.targetDate || "2026-09-30", progressStatus, clean(payload.gap), clean(payload.plan), clean(payload.nextTask), memberId).run();
  await logAction(session.email, "更新周度进展", "member", memberId, `self=L${selfLevel};target=L${targetLevel}`);
}

async function addEvidence(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  if (!payload.title?.trim() || !payload.criterionKey?.trim()) throw new Error("请填写证据标题并关联通关标准");
  if (payload.nominateAsset && !payload.complianceConfirmed) throw new Error("推荐为团队成果前请完成合规自查");
  const level = clampLevel(payload.level || 1);
  const result = await db().prepare(`
    INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, nominate_asset, created_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, '待核验', ?, ?)
  `).bind(memberId, level, clean(payload.criterionKey), clean(payload.title), clean(payload.kind) || "链接", clean(payload.url), clean(payload.outcome), payload.nominateAsset ? 1 : 0, session.email).run();
  const evidenceId = Number(result.meta.last_row_id);
  if (payload.nominateAsset) {
    const member = await db().prepare("SELECT industry FROM members WHERE id = ?").bind(memberId).first<{ industry: string }>();
    await db().prepare(`
      INSERT INTO assets (title, type, industry, owner_member_id, source_evidence_id, review_status, compliance_status, url)
      VALUES (?, ?, ?, ?, ?, '待审核', '已自查', ?)
    `).bind(clean(payload.title), assetTypeForEvidence(payload.kind), member?.industry || "通用", memberId, evidenceId, clean(payload.url)).run();
  }
  await db().prepare("UPDATE members SET review_status = '草稿', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(memberId).run();
  await logAction(session.email, "添加晋级证据", "evidence", evidenceId, `member=${memberId};level=${level};asset=${payload.nominateAsset ? 1 : 0}`);
}

async function submitReview(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  if (!payload.reviewerEmail) throw new Error("请选择主评人");
  const member = await db().prepare("SELECT current_level AS currentLevel, target_level AS targetLevel FROM members WHERE id = ?")
    .bind(memberId).first<{ currentLevel: number; targetLevel: number }>();
  if (!member) throw new Error("成员不存在");
  const reviewer = await db().prepare(`
    SELECT email, display_name AS displayName, role, member_id AS memberId
    FROM workspace_users WHERE email = ? AND role IN ('reviewer','admin')
  `).bind(payload.reviewerEmail).first<{ email: string; displayName: string; role: WorkspaceRole; memberId: number }>();
  if (!reviewer) throw new Error("所选主评人当前不可用");
  if (reviewer.memberId === memberId) throw new Error("主评人不能选择自己");
  const evidence = await db().prepare("SELECT COUNT(*) AS count FROM evidences WHERE member_id = ? AND level = ?")
    .bind(memberId, member.targetLevel).first<{ count: number }>();
  if (!evidence?.count) throw new Error("至少添加 1 条目标层级证据后才能提交评审");
  const active = await db().prepare("SELECT id FROM reviews WHERE member_id = ? AND state IN ('已提交','评审中','待补证') LIMIT 1").bind(memberId).first();
  if (active) throw new Error("已有进行中的晋级评审");
  const published = await db().prepare("SELECT id FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
  if (!published) throw new Error("当前没有已发布的能力体系");
  const cycle = new Date().toISOString().slice(0, 7);
  const result = await db().prepare(`
    INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_email, reviewer_name, framework_version_id)
    VALUES (?, ?, ?, '已提交', ?, ?, ?, ?)
  `).bind(memberId, member.currentLevel, member.targetLevel, cycle, reviewer.email, reviewer.displayName, published.id).run();
  await db().prepare("UPDATE members SET review_status = '已提交', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(memberId).run();
  await logAction(session.email, "提交晋级评审", "review", Number(result.meta.last_row_id), `L${member.currentLevel}->L${member.targetLevel};reviewer=${reviewer.email};framework=${published.id}`);
}

async function reviewDecision(session: SessionUser, payload: ActionPayload) {
  if (session.role !== "admin" && session.role !== "reviewer") throw new Error("没有评审权限");
  if (!payload.reviewId) throw new Error("缺少评审 ID");
  if (!["已通过", "待补证", "未通过"].includes(payload.decision || "")) throw new Error("请选择评审结论");
  const review = await db().prepare(`
    SELECT id, member_id AS memberId, from_level AS fromLevel, target_level AS targetLevel,
      reviewer_email AS reviewerEmail, framework_version_id AS frameworkVersionId
    FROM reviews WHERE id = ?
  `).bind(payload.reviewId).first<{ id: number; memberId: number; fromLevel: number; targetLevel: number; reviewerEmail: string; frameworkVersionId: number }>();
  if (!review) throw new Error("评审不存在");
  if (session.role !== "admin" && review.reviewerEmail !== session.email) throw new Error("只能处理分配给自己的评审");
  await db().prepare(`
    UPDATE reviews SET state = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(payload.decision, clean(payload.feedback), review.id).run();
  if (payload.decision === "已通过") {
    await db().batch([
      db().prepare("UPDATE members SET current_level = ?, self_level = MAX(self_level, ?), review_status = '已通过', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(review.targetLevel, review.targetLevel, review.memberId),
      db().prepare("INSERT INTO level_history (member_id, from_level, to_level, decision, reviewer_email, framework_version_id) VALUES (?, ?, ?, '已通过', ?, ?)")
        .bind(review.memberId, review.fromLevel, review.targetLevel, session.email, review.frameworkVersionId),
    ]);
  } else {
    await db().prepare("UPDATE members SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.decision, review.memberId).run();
  }
  await logAction(session.email, "完成晋级评审", "review", review.id, payload.decision);
}

async function createAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.complianceConfirmed) throw new Error("提交成果前必须完成合规自查");
  if (!payload.title?.trim() || !payload.assetType?.trim() || !payload.industry?.trim()) throw new Error("请完整填写成果信息");
  const memberId = await authorizedMemberId(session, payload.memberId);
  const result = await db().prepare(`
    INSERT INTO assets (title, type, industry, owner_member_id, review_status, compliance_status, url)
    VALUES (?, ?, ?, ?, '待审核', '已自查', ?)
  `).bind(clean(payload.title), clean(payload.assetType), clean(payload.industry), memberId, clean(payload.url)).run();
  await logAction(session.email, "提交团队成果", "asset", Number(result.meta.last_row_id), clean(payload.title));
}

async function reviewAsset(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  if (!payload.assetId || !["已发布", "待补充"].includes(payload.decision || "")) throw new Error("请选择成果审核结论");
  await db().prepare("UPDATE assets SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.decision, payload.assetId).run();
  await logAction(session.email, "审核团队成果", "asset", payload.assetId, payload.decision);
}

async function updateUserAccess(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  if (!payload.email || !payload.role || !["member", "reviewer", "admin"].includes(payload.role)) throw new Error("成员权限参数不完整");
  const target = await db().prepare("SELECT member_id AS memberId, role FROM workspace_users WHERE email = ?").bind(payload.email).first<{ memberId: number; role: WorkspaceRole }>();
  if (!target) throw new Error("成员不存在");
  if (target.role === "admin" && payload.role !== "admin") {
    const admins = await db().prepare("SELECT COUNT(*) AS count FROM workspace_users WHERE role = 'admin'").first<{ count: number }>();
    if ((admins?.count || 0) <= 1) throw new Error("至少保留 1 位管理员");
  }
  await db().batch([
    db().prepare("UPDATE workspace_users SET role = ? WHERE email = ?").bind(payload.role, payload.email),
    db().prepare("UPDATE members SET group_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(clean(payload.groupName) || "综合组", target.memberId),
  ]);
  await logAction(session.email, "更新成员权限", "member", target.memberId, `role=${payload.role};group=${clean(payload.groupName)}`);
}

async function saveFrameworkLevel(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  const level = payload.frameworkLevel;
  if (!level || level.level < 1 || level.level > 10 || !level.title.trim() || !level.standard.trim()) throw new Error("请完整填写层级名称与认证标准");
  const draftId = await ensureDraftFramework(session.email, payload.changeNote);
  await db().prepare(`
    UPDATE framework_levels SET title = ?, role = ?, stage = ?, definition = ?, standard = ?,
      abilities_json = ?, criteria_json = ?, practices_json = ?, path = ?, badges_json = ?, resources_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE framework_version_id = ? AND level = ?
  `).bind(
    clean(level.title), clean(level.role), clean(level.stage), clean(level.definition), clean(level.standard),
    JSON.stringify(level.abilities || []), JSON.stringify(level.criteria || []), JSON.stringify(level.practices || []), clean(level.path),
    JSON.stringify(level.badges || []), JSON.stringify(level.resources || []), draftId, level.level,
  ).run();
  await db().prepare("UPDATE framework_versions SET change_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(clean(payload.changeNote) || "更新能力标准", draftId).run();
  await logAction(session.email, "保存体系草稿", "framework", draftId, `L${level.level}`);
}

async function publishFramework(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  const draft = await db().prepare("SELECT id FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
  if (!draft) throw new Error("当前没有待发布的体系草稿");
  const levelCount = await db().prepare("SELECT COUNT(*) AS count FROM framework_levels WHERE framework_version_id = ?").bind(draft.id).first<{ count: number }>();
  if (levelCount?.count !== 10) throw new Error("十个层级完整后才能发布");
  await db().batch([
    db().prepare("UPDATE framework_versions SET status = '已停用', updated_at = CURRENT_TIMESTAMP WHERE status = '已发布'"),
    db().prepare("UPDATE framework_versions SET status = '已发布', change_note = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(clean(payload.changeNote) || "发布能力体系更新", draft.id),
  ]);
  await logAction(session.email, "发布能力体系", "framework", draft.id, clean(payload.changeNote));
}

async function ensureDraftFramework(actorEmail: string, note?: string) {
  const existing = await db().prepare("SELECT id FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
  if (existing) return existing.id;
  const published = await db().prepare("SELECT id FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
  if (!published) throw new Error("当前没有可编辑的已发布体系");
  const count = await db().prepare("SELECT COUNT(*) AS count FROM framework_versions").first<{ count: number }>();
  const result = await db().prepare(`
    INSERT INTO framework_versions (version_name, status, change_note, created_by_email)
    VALUES (?, '草稿', ?, ?)
  `).bind(`v${(count?.count || 1) + 1}.0`, clean(note) || "能力体系更新", actorEmail).run();
  const draftId = Number(result.meta.last_row_id);
  await db().prepare(`
    INSERT INTO framework_levels (
      framework_version_id, level, title, role, stage, definition, standard,
      abilities_json, criteria_json, practices_json, path, badges_json, resources_json
    )
    SELECT ?, level, title, role, stage, definition, standard,
      abilities_json, criteria_json, practices_json, path, badges_json, resources_json
    FROM framework_levels WHERE framework_version_id = ?
  `).bind(draftId, published.id).run();
  return draftId;
}

async function loadFramework(session: SessionUser | null) {
  const publishedMeta = await db().prepare(`
    SELECT id, version_name AS versionName, status, change_note AS changeNote, published_at AS publishedAt, updated_at AS updatedAt
    FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1
  `).first<Record<string, unknown>>();
  if (!publishedMeta) throw new Error("能力体系尚未初始化");
  const published = { ...publishedMeta, levels: await loadFrameworkLevels(Number(publishedMeta.id)) };
  if (session?.role !== "admin") return { published, draft: null };
  const draftMeta = await db().prepare(`
    SELECT id, version_name AS versionName, status, change_note AS changeNote, published_at AS publishedAt, updated_at AS updatedAt
    FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1
  `).first<Record<string, unknown>>();
  const draft = draftMeta ? { ...draftMeta, levels: await loadFrameworkLevels(Number(draftMeta.id)) } : null;
  return { published, draft };
}

async function loadFrameworkLevels(versionId: number): Promise<LevelDefinition[]> {
  const rows = await db().prepare(`
    SELECT level, title, role, stage, definition, standard, abilities_json AS abilitiesJson,
      criteria_json AS criteriaJson, practices_json AS practicesJson, path,
      badges_json AS badgesJson, resources_json AS resourcesJson
    FROM framework_levels WHERE framework_version_id = ? ORDER BY level
  `).bind(versionId).all<Record<string, unknown>>();
  return rows.results.map(row => ({
    level: Number(row.level), title: String(row.title), role: String(row.role), stage: String(row.stage),
    definition: String(row.definition), standard: String(row.standard), path: String(row.path),
    abilities: parseJson<string[]>(row.abilitiesJson, []), criteria: parseJson<LevelDefinition["criteria"]>(row.criteriaJson, []),
    practices: parseJson<string[]>(row.practicesJson, []), badges: parseJson<string[]>(row.badgesJson, []),
    resources: parseJson<LevelDefinition["resources"]>(row.resourcesJson, []),
  }));
}

async function authorizedMemberId(session: SessionUser, requested?: number) {
  const memberId = requested || session.memberId;
  if (memberId !== session.memberId && session.role !== "admin") throw new Error("没有修改该成员的权限");
  return memberId;
}

function requireAdmin(session: SessionUser) {
  if (session.role !== "admin") throw new Error("只有管理员可以执行此操作");
}

function normalizeMember(row: Record<string, unknown>) {
  return {
    id: Number(row.id), name: String(row.name || ""), role: String(row.role || ""), industry: String(row.industry || ""), groupName: String(row.groupName || "综合组"),
    currentLevel: Number(row.currentLevel || 1), selfLevel: Number(row.selfLevel || row.currentLevel || 1), targetLevel: Number(row.targetLevel || 3),
    targetDate: String(row.targetDate || ""), progressStatus: String(row.progressStatus || "进行中"), reviewStatus: String(row.reviewStatus || "草稿"),
    gap: String(row.gap || ""), plan: String(row.plan || ""), nextTask: String(row.nextTask || ""), updatedAt: String(row.updatedAt || ""),
    evidenceCount: Number(row.evidenceCount || 0), pendingReviewId: row.pendingReviewId ? Number(row.pendingReviewId) : null, overdueTasks: Number(row.overdueTasks || 0),
  };
}

function buildMetrics(members: ReturnType<typeof normalizeMember>[]) {
  const levelValues = members.map(member => member.currentLevel).sort((a, b) => a - b);
  const count = members.length;
  const average = count ? levelValues.reduce((sum, level) => sum + level, 0) / count : 0;
  const median = count ? (levelValues[Math.floor((count - 1) / 2)] + levelValues[Math.ceil((count - 1) / 2)]) / 2 : 0;
  const distribution = Array.from({ length: 10 }, (_, index) => levelValues.filter(level => level === index + 1).length);
  const pendingReviews = members.filter(member => member.pendingReviewId !== null).length;
  const totalEvidenceTarget = Math.max(1, members.reduce((sum, member) => sum + Math.max(3, member.targetLevel - member.currentLevel + 2), 0));
  return {
    memberCount: count, average: Number(average.toFixed(1)), median,
    l3Rate: count ? Math.round(members.filter(member => member.currentLevel >= 3).length / count * 100) : 0,
    l6Rate: count ? Math.round(members.filter(member => member.currentLevel >= 6).length / count * 100) : 0,
    atRisk: members.filter(member => ["有风险", "阻塞"].includes(member.progressStatus)).length,
    overdue: members.reduce((sum, member) => sum + member.overdueTasks, 0), pendingReviews,
    evidenceCompletion: Math.min(100, Math.round(members.reduce((sum, member) => sum + member.evidenceCount, 0) / totalEvidenceTarget * 100)),
    distribution, reviewReady: Math.max(0, count - pendingReviews),
  };
}

function assetTypeForEvidence(kind?: string) {
  if (kind === "仓库") return "Skill";
  if (kind === "报告") return "行业实践";
  if (kind === "演示") return "原型";
  return "知识库";
}

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value || "")) as T; } catch { return fallback; }
}

function clampLevel(value: number) {
  return Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
}

function clean(value?: string) {
  return String(value || "").trim().slice(0, 4000);
}
