import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { getChatGPTUser } from "../../chatgpt-auth";
import { notifyReviewSubmitted, notifyReviewDecision, notifyNewFeedback, notifyFeedbackResolved, notifyAssetReviewSubmitted, notifyAssetReviewDecision } from "../../lib/dingtalk-notification";
import { ensureWorkspaceUser, hashPassword, logAction, type WorkspaceRole, type WorkspaceSessionUser } from "../../lib/workspace-db";
import type { LevelDefinition } from "../../types";

type SessionUser = WorkspaceSessionUser;

const criterionSchema = z.object({ id: z.string(), label: z.string(), evidenceHint: z.string() });
const frameworkLevelSchema = z.object({
  level: z.number(),
  title: z.string(),
  role: z.string(),
  stage: z.string(),
  definition: z.string(),
  standard: z.string(),
  abilities: z.array(z.string()).default([]),
  criteria: z.array(criterionSchema).default([]),
  practices: z.array(z.string()).default([]),
  path: z.string().default(""),
  badges: z.array(z.string()).optional(),
  resources: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
});

const actionPayloadSchema = z.object({
  action: z.string(),
  memberId: z.number().int().optional(),
  targetLevel: z.number().optional(),
  targetDate: z.string().optional(),
  progressStatus: z.string().optional(),
  gap: z.string().optional(),
  plan: z.string().optional(),
  nextTask: z.string().optional(),
  level: z.number().optional(),
  criterionKey: z.string().optional(),
  title: z.string().optional(),
  kind: z.string().optional(),
  url: z.string().optional(),
  outcome: z.string().optional(),
  nominateAsset: z.boolean().optional(),
  reviewId: z.number().int().optional(),
  reviewerEmail: z.string().optional(),
  evidenceId: z.number().int().optional(),
  displayName: z.string().optional(),
  password: z.string().optional(),
  decision: z.string().optional(),
  feedback: z.string().optional(),
  assetId: z.number().int().optional(),
  assetType: z.string().optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  complianceConfirmed: z.boolean().optional(),
  email: z.string().optional(),
  role: z.enum(["member", "reviewer", "admin"]).optional(),
  groupName: z.string().optional(),
  frameworkLevel: frameworkLevelSchema.optional(),
  changeNote: z.string().optional(),
  pageName: z.string().optional(),
  screenshot: z.string().optional(),
  scope: z.enum(["mine", "all"]).optional(),
  keyword: z.string().optional(),
  feedbackId: z.number().int().optional(),
  status: z.string().optional(),
  adminResponse: z.string().optional(),
});

type ActionPayload = z.infer<typeof actionPayloadSchema>;

async function all<T>(query: SQL): Promise<T[]> {
  const db = await getDb();
  const result = await db.execute(query);
  return result.rows as T[];
}

async function first<T>(query: SQL): Promise<T | null> {
  const rows = await all<T>(query);
  return rows[0] ?? null;
}

async function run(query: SQL): Promise<void> {
  const db = await getDb();
  await db.execute(query);
}

const memberSelect = sql`
  SELECT m.id, m.name, m.role, m.industry, m.group_name AS "groupName",
    m.current_level AS "currentLevel", m.self_level AS "selfLevel",
    m.target_level AS "targetLevel", m.target_date AS "targetDate",
    m.status AS "progressStatus", m.review_status AS "reviewStatus",
    m.gap, m.plan, m.next_task AS "nextTask",
    to_char(m.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt",
    CASE WHEN to_char(m.last_checkin, 'YYYY-MM') = to_char(now(), 'YYYY-MM') THEN 1 ELSE 0 END AS "checkedInThisMonth",
    (SELECT COUNT(*)::int FROM evidences e WHERE e.member_id = m.id) AS "evidenceCount",
    (SELECT COUNT(*)::int FROM assets a WHERE a.owner_member_id = m.id AND a.review_status = '已发布') AS "publishedAssetCount",
    (SELECT r.id FROM reviews r WHERE r.member_id = m.id AND r.state IN ('已提交','评审中','待补证') ORDER BY r.id DESC LIMIT 1) AS "pendingReviewId",
    (SELECT COUNT(*)::int FROM growth_tasks t WHERE t.member_id = m.id AND (t.status = '逾期' OR (t.status != '已完成' AND t.due_date < to_char(CURRENT_DATE, 'YYYY-MM-DD')))) AS "overdueTasks"
  FROM members m
`;

export async function GET() {
  try {
    const chatGPTUser = await getChatGPTUser();
    const session = chatGPTUser ? await ensureWorkspaceUser(chatGPTUser) : null;
    const canSeePeople = session?.role === "admin" || session?.role === "reviewer";

    const memberRows = await all<Record<string, unknown>>(sql`${memberSelect} ORDER BY m.current_level DESC, m.name ASC`);
    const fullMembers = memberRows.map(normalizeMember);
    const members = fullMembers.map((member, index) => {
      if (canSeePeople || session?.memberId === member.id) return member;
      return { ...member, name: `成员 ${String(index + 1).padStart(2, "0")}`, role: "团队成员", gap: "", plan: "", nextTask: "登录后可查看" };
    });
    const myMember = session ? fullMembers.find(member => member.id === session.memberId) || null : null;

    const evidenceWhere = canSeePeople ? sql`` : session ? sql`WHERE e.member_id = ${session.memberId}` : sql`WHERE 1 = 0`;
    const evidences = await all<Record<string, unknown>>(sql`
      SELECT e.id, e.member_id AS "memberId", m.name AS "memberName", e.level,
        e.criterion_key AS "criterionKey", e.title, e.kind, e.url, e.outcome,
        e.status, e.nominate_asset AS "nominateAsset", e.asset_type AS "assetType",
        to_char(e.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
      FROM evidences e JOIN members m ON m.id = e.member_id
      ${evidenceWhere} ORDER BY e.created_at DESC LIMIT 400
    `);

    const reviewWhere = !session
      ? sql`WHERE 1 = 0`
      : session.role === "admin"
        ? sql``
        : session.role === "reviewer"
          ? sql`WHERE r.member_id = ${session.memberId} OR r.reviewer_email = ${session.email}`
          : sql`WHERE r.member_id = ${session.memberId}`;
    const reviews = await all<Record<string, unknown>>(sql`
      SELECT r.id, r.member_id AS "memberId", m.name AS "memberName",
        r.from_level AS "fromLevel", r.target_level AS "targetLevel",
        r.state, r.cycle, r.reviewer_email AS "reviewerEmail", r.reviewer_name AS "reviewerName",
        r.framework_version_id AS "frameworkVersionId", r.feedback,
        to_char(r.submitted_at, 'YYYY-MM-DD HH24:MI:SS') AS "submittedAt",
        COALESCE(to_char(r.reviewed_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS "reviewedAt",
        (SELECT COUNT(*)::int FROM evidences e WHERE e.member_id = r.member_id AND e.level = r.target_level) AS "evidenceCount"
      FROM reviews r JOIN members m ON m.id = r.member_id
      ${reviewWhere}
      ORDER BY CASE r.state WHEN '已提交' THEN 1 WHEN '评审中' THEN 2 WHEN '待补证' THEN 3 ELSE 4 END, r.submitted_at DESC
    `);

    // 发布前成果只对申请人、指定主评人与管理员可见；游客仅浏览已发布成果。
    const assetWhere = !session
      ? sql`WHERE a.review_status = '已发布'`
      : session.role === "admin"
        ? sql``
        : session.role === "reviewer"
          ? sql`WHERE a.review_status = '已发布' OR a.owner_member_id = ${session.memberId} OR a.reviewer_email = ${session.email}`
          : sql`WHERE a.review_status = '已发布' OR a.owner_member_id = ${session.memberId}`;
    const assetRows = await all<Record<string, unknown>>(sql`
      SELECT a.id, a.title, COALESCE(a.description, '') AS "description", a.type, a.industry, m.name AS "ownerName", a.owner_member_id AS "ownerMemberId",
        a.source_evidence_id AS "sourceEvidenceId", a.review_status AS "reviewStatus",
        a.compliance_status AS "complianceStatus",
        a.reviewer_email AS "reviewerEmail", COALESCE(NULLIF(a.reviewer_name, ''), '待指定') AS "reviewerName",
        (SELECT COUNT(DISTINCT re.member_id)::int FROM asset_reuse_events re WHERE re.asset_id = a.id) AS "reusePeople",
        (SELECT COUNT(*)::int FROM asset_reuse_events re WHERE re.asset_id = a.id) AS "reuseTimes",
        (SELECT COALESCE(string_agg(DISTINCT m2.name, '、'), '') FROM asset_reuse_events re JOIN members m2 ON m2.id = re.member_id WHERE re.asset_id = a.id) AS "reuseMemberNames",
        a.reuse_clients AS "reuseClients", to_char(a.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
        to_char(a.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt", a.url,
        COALESCE(a.review_feedback, '') AS "reviewFeedback"
      FROM assets a JOIN members m ON m.id = a.owner_member_id
      ${assetWhere}
      ORDER BY CASE a.review_status WHEN '已发布' THEN 1 WHEN '待审核' THEN 2 ELSE 3 END, a.updated_at DESC
    `);
    const assets = assetRows.map(asset => session ? asset : { ...asset, ownerName: "团队成员" });

    // 团队分析仅使用无姓名的时间序列，支撑按周期与团队维度统计新增、晋级与复用。
    const assetReuseEvents = await all<Record<string, unknown>>(sql`
      SELECT re.asset_id AS "assetId", re.member_id AS "memberId",
        to_char(re.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
      FROM asset_reuse_events re JOIN assets a ON a.id = re.asset_id
      ${assetWhere}
      ORDER BY re.created_at DESC LIMIT 2000
    `);
    const promotionWhere = !session ? sql`WHERE 1 = 0` : sql``;
    const promotionHistory = await all<Record<string, unknown>>(sql`
      SELECT lh.member_id AS "memberId", lh.from_level AS "fromLevel", lh.to_level AS "toLevel",
        to_char(lh.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
      FROM level_history lh
      ${promotionWhere}
      ORDER BY lh.created_at DESC LIMIT 1000
    `);

    const reviewers = session ? await all<Record<string, unknown>>(sql`
      SELECT wu.email, wu.display_name AS "displayName", wu.role, wu.member_id AS "memberId",
        m.group_name AS "groupName", m.industry,
        (
          (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewer_email = wu.email AND r.state IN ('已提交','评审中','待补证')) +
          (SELECT COUNT(*)::int FROM assets a WHERE a.reviewer_email = wu.email AND a.review_status = '待审核')
        ) AS "pendingCount"
      FROM workspace_users wu JOIN members m ON m.id = wu.member_id
      WHERE wu.role IN ('reviewer','admin')
      ORDER BY "pendingCount" ASC, wu.display_name ASC
    `) : [];

    const framework = await loadFramework(session);
    const monthlyReport = session ? await buildMonthlyReport(fullMembers) : null;
    const workspaceUsers = session?.role === "admin" ? await all<Record<string, unknown>>(sql`
      SELECT wu.email, wu.display_name AS "displayName", wu.role, wu.member_id AS "memberId",
        m.group_name AS "groupName", m.industry
      FROM workspace_users wu JOIN members m ON m.id = wu.member_id
      ORDER BY CASE wu.role WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END, wu.display_name
    `) : [];

    return Response.json({
      authenticated: Boolean(session),
      me: session ? { displayName: session.displayName, email: session.email, role: session.role, memberId: session.memberId } : null,
      members,
      myMember,
      evidences,
      reviews,
      assets,
      assetReuseEvents,
      promotionHistory,
      reviewers,
      workspaceUsers,
      levels: framework.published.levels,
      framework,
      monthlyReport,
      metrics: buildMetrics(fullMembers),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取工作区失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const chatGPTUser = await getChatGPTUser();
    if (!chatGPTUser) return Response.json({ error: "请先登录后再进行操作" }, { status: 401 });
    const session = await ensureWorkspaceUser(chatGPTUser);
    const parsed = actionPayloadSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "请求参数不合法" }, { status: 400 });
    const payload = parsed.data;
    if (!payload.action) return Response.json({ error: "缺少操作类型" }, { status: 400 });

    switch (payload.action) {
      case "update_checkin": await updateCheckin(session, payload); break;
      case "complete_onboarding": await completeOnboarding(session, payload); break;
      case "add_evidence": await addEvidence(session, payload); break;
      case "update_evidence": await updateEvidence(session, payload); break;
      case "delete_evidence": await deleteEvidence(session, payload); break;
      case "submit_review": await submitReview(session, payload); break;
      case "withdraw_review": await withdrawReview(session, payload); break;
      case "resubmit_review": await resubmitReview(session, payload); break;
      case "review_decision": await reviewDecision(session, payload); break;
      case "create_asset": await createAsset(session, payload); break;
      case "update_asset": await updateAsset(session, payload); break;
      case "resubmit_asset": await resubmitAsset(session, payload); break;
      case "review_asset": await reviewAsset(session, payload); break;
      case "withdraw_asset": await withdrawAsset(session, payload); break;
      case "track_asset_reuse": await trackAssetReuse(session, payload); break;
      case "create_user": await createUser(session, payload); break;
      case "update_user_access": await updateUserAccess(session, payload); break;
      case "save_framework_level": await saveFrameworkLevel(session, payload); break;
      case "publish_framework": await publishFramework(session, payload); break;
      case "submit_feedback": await submitFeedback(session, payload); break;
      case "list_feedbacks": return Response.json(await listFeedbacks(session, payload));
      case "get_feedback": return Response.json(await getFeedback(session, payload));
      case "update_feedback": await updateFeedback(session, payload); break;
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
  if (payload.memberId !== undefined && payload.memberId !== session.memberId) throw new Error("只能更新自己的成长进展");
  const memberId = session.memberId;
  const current = await first<{ currentLevel: number }>(sql`SELECT current_level AS "currentLevel" FROM members WHERE id = ${memberId}`);
  if (!current) throw new Error("成员不存在");
  // 去掉“设目标”机制：下一级恒为 current+1（封顶 L10），target_level 仅作为下一级的内部记录自动维护
  const nextLevel = clampLevel(current.currentLevel + 1);
  const progressStatus = ["正常", "进行中", "有风险", "阻塞"].includes(payload.progressStatus || "") ? payload.progressStatus! : "进行中";
  await run(sql`
    UPDATE members SET target_level = ${nextLevel}, target_date = ${payload.targetDate || "2026-09-30"}, status = ${progressStatus},
      review_status = CASE WHEN review_status IN ('已通过','未通过') THEN '草稿' ELSE review_status END,
      gap = ${clean(payload.gap)}, plan = ${clean(payload.plan)}, next_task = ${clean(payload.nextTask)}, last_checkin = now(), updated_at = now()
    WHERE id = ${memberId}
  `);
  await logAction(session.email, "更新周度进展", "member", memberId, `next=L${nextLevel}`);
}

async function completeOnboarding(session: SessionUser, payload: ActionPayload) {
  const memberId = session.memberId;
  const industry = ["高校", "新质", "能源", "政务", "通用"].includes(payload.industry || "") ? payload.industry! : "通用";
  // 去掉“设目标”机制：下一级恒为 current+1（封顶 L10）
  const current = await first<{ currentLevel: number }>(sql`SELECT current_level AS "currentLevel" FROM members WHERE id = ${memberId}`);
  const nextLevel = clampLevel((current?.currentLevel ?? 0) + 1);
  await run(sql`
    UPDATE members SET industry = ${industry}, group_name = ${clean(payload.groupName) || "综合组"}, target_level = ${nextLevel},
      target_date = ${payload.targetDate || "2026-09-30"}, next_task = ${clean(payload.nextTask)},
      last_checkin = now(), updated_at = now()
    WHERE id = ${memberId}
  `);
  await logAction(session.email, "完成首次引导", "member", memberId, `industry=${industry};next=L${nextLevel}`);
}

async function addEvidence(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  if (!payload.title?.trim() || !payload.criterionKey?.trim()) throw new Error("请填写证据标题并关联通关标准");
  const level = clampLevel(payload.level || 1);
  const nominateAsset = Boolean(payload.nominateAsset);
  const assetType = nominateAsset ? clean(payload.assetType) : "Skill";
  if (nominateAsset && !ASSET_TYPES.includes(assetType)) throw new Error("请选择有效的成果类型");
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, nominate_asset, asset_type, created_by_email)
    VALUES (${memberId}, ${level}, ${clean(payload.criterionKey)}, ${clean(payload.title)}, ${clean(payload.kind) || "链接"}, ${clean(payload.url)}, ${clean(payload.outcome)}, '待核验', ${nominateAsset ? 1 : 0}, ${assetType}, ${session.email})
    RETURNING id
  `);
  const evidenceId = Number(inserted?.id || 0);
  await run(sql`UPDATE members SET review_status = '草稿', updated_at = now() WHERE id = ${memberId}`);
  await logAction(session.email, "添加晋级证据", "evidence", evidenceId, `member=${memberId};level=${level};syncAsset=${nominateAsset}`);
}

async function requireEditableEvidence(session: SessionUser, evidenceId?: number) {
  if (!evidenceId) throw new Error("缺少证据 ID");
  const evidence = await first<{ id: number; memberId: number; level: number; title: string }>(sql`
    SELECT id, member_id AS "memberId", level, title FROM evidences WHERE id = ${evidenceId}
  `);
  if (!evidence) throw new Error("证据不存在");
  if (evidence.memberId !== session.memberId && session.role !== "admin") throw new Error("没有修改该证据的权限");
  const passed = await first(sql`SELECT id FROM reviews WHERE member_id = ${evidence.memberId} AND target_level = ${evidence.level} AND state = '已通过' LIMIT 1`);
  if (passed) throw new Error("该证据已支撑通过的评审，不可修改");
  return evidence;
}

async function updateEvidence(session: SessionUser, payload: ActionPayload) {
  const evidence = await requireEditableEvidence(session, payload.evidenceId);
  if (!payload.title?.trim() || !payload.criterionKey?.trim()) throw new Error("请填写证据标题并关联通关标准");
  const level = clampLevel(payload.level || evidence.level);
  const nominateAsset = Boolean(payload.nominateAsset);
  const assetType = nominateAsset ? clean(payload.assetType) : "Skill";
  if (nominateAsset && !ASSET_TYPES.includes(assetType)) throw new Error("请选择有效的成果类型");
  await run(sql`
    UPDATE evidences SET level = ${level}, criterion_key = ${clean(payload.criterionKey)}, title = ${clean(payload.title)},
      kind = ${clean(payload.kind) || "链接"}, url = ${clean(payload.url)}, outcome = ${clean(payload.outcome)},
      nominate_asset = ${nominateAsset ? 1 : 0}, asset_type = ${assetType}, status = '待核验'
    WHERE id = ${evidence.id}
  `);
  await logAction(session.email, "编辑晋级证据", "evidence", evidence.id, `level=${level};syncAsset=${nominateAsset}`);
}

async function deleteEvidence(session: SessionUser, payload: ActionPayload) {
  const evidence = await requireEditableEvidence(session, payload.evidenceId);
  // 历史版本中可能有关联证据的成果；删除证据不应删除团队资产或复用记录。
  await run(sql`UPDATE assets SET source_evidence_id = 0 WHERE source_evidence_id = ${evidence.id}`);
  await run(sql`DELETE FROM evidences WHERE id = ${evidence.id}`);
  await logAction(session.email, "删除晋级证据", "evidence", evidence.id, clean(evidence.title));
}

async function submitReview(session: SessionUser, payload: ActionPayload) {
  const memberId = await authorizedMemberId(session, payload.memberId);
  if (!payload.reviewerEmail) throw new Error("请选择主评人");
  const member = await first<{ name: string; currentLevel: number }>(sql`
    SELECT name, current_level AS "currentLevel" FROM members WHERE id = ${memberId}
  `);
  if (!member) throw new Error("成员不存在");
  // 去掉“设目标”机制：晋级申请恒为申请 current+1（封顶 L10）
  const nextLevel = clampLevel(member.currentLevel + 1);
  if (nextLevel === member.currentLevel) throw new Error("已达到最高层级，无需再申请晋级");
  const reviewer = await first<{ email: string; displayName: string; role: WorkspaceRole; memberId: number; dingtalkUnionId: string | null }>(sql`
    SELECT email, display_name AS "displayName", role, member_id AS "memberId", dingtalk_union_id AS "dingtalkUnionId"
    FROM workspace_users WHERE email = ${payload.reviewerEmail} AND role IN ('reviewer','admin')
  `);
  if (!reviewer) throw new Error("所选主评人当前不可用");
  if (reviewer.memberId === memberId) throw new Error("主评人不能选择自己");
  const evidence = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM evidences WHERE member_id = ${memberId} AND level = ${nextLevel}`);
  if (!evidence?.count) throw new Error("至少添加 1 条下一级证据后才能提交评审");
  const active = await first(sql`SELECT id FROM reviews WHERE member_id = ${memberId} AND state IN ('已提交','评审中','待补证') LIMIT 1`);
  if (active) throw new Error("已有进行中的晋级评审");
  const published = await first<{ id: number }>(sql`SELECT id FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1`);
  if (!published) throw new Error("当前没有已发布的能力体系");
  const cycle = new Date().toISOString().slice(0, 7);
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_email, reviewer_name, framework_version_id)
    VALUES (${memberId}, ${member.currentLevel}, ${nextLevel}, '已提交', ${cycle}, ${reviewer.email}, ${reviewer.displayName}, ${published.id})
    RETURNING id
  `);
  await run(sql`UPDATE members SET review_status = '已提交', updated_at = now() WHERE id = ${memberId}`);
  await logAction(session.email, "提交晋级评审", "review", Number(inserted?.id || 0), `L${member.currentLevel}->L${nextLevel};reviewer=${reviewer.email};framework=${published.id}`);

  // 钉钉通知评审人（必须 await：Vercel Serverless 在响应返回后会冻结进程，未 await 的 promise 会被终止）
  if (reviewer.dingtalkUnionId) {
    await notifyReviewSubmitted({
      reviewerUnionId: reviewer.dingtalkUnionId,
      memberName: member.name,
      fromLevel: member.currentLevel,
      targetLevel: nextLevel,
      detailUrl: "https://qianwen-growth-os.vercel.app",
    });
  } else {
    console.log("[dingtalk] 跳过通知：评审人未绑定钉钉", reviewer.email);
  }
}

async function withdrawReview(session: SessionUser, payload: ActionPayload) {
  if (!payload.reviewId) throw new Error("缺少评审 ID");
  const review = await first<{ id: number; memberId: number; state: string }>(sql`
    SELECT id, member_id AS "memberId", state FROM reviews WHERE id = ${payload.reviewId}
  `);
  if (!review) throw new Error("评审不存在");
  if (review.memberId !== session.memberId) throw new Error("只能撤回自己的晋级申请");
  if (!["已提交", "评审中", "待补证"].includes(review.state)) throw new Error("当前状态不可撤回");
  await run(sql`UPDATE reviews SET state = '已撤回', reviewed_at = now() WHERE id = ${review.id}`);
  await run(sql`UPDATE members SET review_status = '草稿', updated_at = now() WHERE id = ${review.memberId}`);
  await logAction(session.email, "撤回晋级申请", "review", review.id, `state=${review.state}`);
}

async function resubmitReview(session: SessionUser, payload: ActionPayload) {
  if (!payload.reviewId) throw new Error("缺少评审 ID");
  const review = await first<{ id: number; memberId: number; state: string; targetLevel: number }>(sql`
    SELECT id, member_id AS "memberId", state, target_level AS "targetLevel" FROM reviews WHERE id = ${payload.reviewId}
  `);
  if (!review) throw new Error("评审不存在");
  if (review.memberId !== session.memberId) throw new Error("只能重新提交自己的晋级申请");
  if (review.state !== "待补证") throw new Error("只有待补证的申请可以重新提交");
  // 补证空提交防护：重提前必须存在晚于提交/最近反馈时间的新证据
  const fresh = await first<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM evidences
    WHERE member_id = ${review.memberId} AND level = ${review.targetLevel}
      AND created_at > (SELECT COALESCE(reviewed_at, submitted_at) FROM reviews WHERE id = ${review.id})
  `);
  if (!fresh?.count) throw new Error("请先补充新证据后再重新提交");
  await run(sql`UPDATE reviews SET state = '已提交', submitted_at = now() WHERE id = ${review.id}`);
  await run(sql`UPDATE members SET review_status = '已提交', updated_at = now() WHERE id = ${review.memberId}`);
  await logAction(session.email, "补证后重新提交", "review", review.id, `target=L${review.targetLevel}`);
}

async function reviewDecision(session: SessionUser, payload: ActionPayload) {
  if (session.role !== "admin" && session.role !== "reviewer") throw new Error("没有评审权限");
  if (!payload.reviewId) throw new Error("缺少评审 ID");
  if (!["已通过", "待补证", "未通过"].includes(payload.decision || "")) throw new Error("请选择评审结论");
  const review = await first<{ id: number; memberId: number; fromLevel: number; targetLevel: number; state: string; reviewerEmail: string; frameworkVersionId: number }>(sql`
    SELECT id, member_id AS "memberId", from_level AS "fromLevel", target_level AS "targetLevel",
      state, reviewer_email AS "reviewerEmail", framework_version_id AS "frameworkVersionId"
    FROM reviews WHERE id = ${payload.reviewId}
  `);
  if (!review) throw new Error("评审不存在");
  if (session.role !== "admin" && review.reviewerEmail !== session.email) throw new Error("只能处理分配给自己的评审");
  if (!['已提交', '评审中'].includes(review.state)) throw new Error("当前状态不可评审");
  await run(sql`UPDATE reviews SET state = ${payload.decision}, feedback = ${clean(payload.feedback)}, reviewed_at = now() WHERE id = ${review.id}`);
  if (payload.decision === "已通过") {
    // 逐级爬坡防御：即使存量申请的 target_level 跨级，通过时也最多晋升一级
    const promotedLevel = Math.min(review.targetLevel, review.fromLevel + 1);
    await run(sql`
      UPDATE members SET current_level = ${promotedLevel},
        review_status = '已通过', updated_at = now()
      WHERE id = ${review.memberId}
    `);
    await run(sql`
      INSERT INTO level_history (member_id, from_level, to_level, decision, reviewer_email, framework_version_id)
      VALUES (${review.memberId}, ${review.fromLevel}, ${promotedLevel}, '已通过', ${session.email}, ${review.frameworkVersionId})
    `);
    await publishNominatedEvidenceAssets(review, session);
  } else {
    await run(sql`UPDATE members SET review_status = ${payload.decision}, updated_at = now() WHERE id = ${review.memberId}`);
  }
  await logAction(session.email, "完成晋级评审", "review", review.id, payload.decision);

  // 钉钉通知申请人评审结论（必须 await：Vercel Serverless 在响应返回后会冻结进程，未 await 的 promise 会被终止）
  const applicantUser = await first<{ email: string; dingtalkUnionId: string | null }>(sql`
    SELECT email, dingtalk_union_id AS "dingtalkUnionId" FROM workspace_users WHERE member_id = ${review.memberId}
  `);
  if (applicantUser?.dingtalkUnionId) {
    await notifyReviewDecision({
      applicantUnionId: applicantUser.dingtalkUnionId,
      decision: payload.decision!,
      fromLevel: review.fromLevel,
      targetLevel: review.targetLevel,
      feedback: payload.feedback || undefined,
      detailUrl: "https://qianwen-growth-os.vercel.app",
    });
  } else {
    console.log("[dingtalk] 跳过通知：申请人未绑定钉钉", applicantUser?.email ?? `memberId=${review.memberId}`);
  }
}

const ASSET_TYPES = ["Skill", "知识库", "评测集", "原型", "行业实践"];
const INDUSTRIES = ["高校", "新质", "能源", "政务", "通用"];

/**
 * 被申请人明确勾选为可复用的证据，会随着同级晋级评审通过直接发布。
 * 来源证据 ID 让自动发布具备幂等性，也保留了成果与认证材料间的追溯关系。
 */
async function publishNominatedEvidenceAssets(
  review: { id: number; memberId: number; targetLevel: number },
  reviewer: SessionUser,
) {
  const created = await all<{ id: number; title: string }>(sql`
    INSERT INTO assets (
      title, description, type, industry, owner_member_id, source_evidence_id,
      reviewer_email, reviewer_name, review_status, compliance_status, url
    )
    SELECT
      e.title,
      e.outcome,
      CASE WHEN e.asset_type IN ('Skill', '知识库', '评测集', '原型', '行业实践') THEN e.asset_type ELSE 'Skill' END,
      CASE WHEN m.industry IN ('高校', '新质', '能源', '政务', '通用') THEN m.industry ELSE '通用' END,
      e.member_id,
      e.id,
      ${reviewer.email},
      ${reviewer.displayName},
      '已发布',
      '已复核',
      e.url
    FROM evidences e
    JOIN members m ON m.id = e.member_id
    WHERE e.member_id = ${review.memberId}
      AND e.level = ${review.targetLevel}
      AND e.nominate_asset = 1
      AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.source_evidence_id = e.id)
    RETURNING id, title
  `);
  for (const asset of created) {
    await logAction(reviewer.email, "晋级通过自动发布成果", "asset", asset.id, `review=${review.id};sourceEvidence=自动同步;title=${asset.title}`);
  }
}

function validateAssetInput(payload: ActionPayload) {
  const title = clean(payload.title);
  const assetType = clean(payload.assetType);
  const industry = clean(payload.industry);
  if (!title || !assetType || !industry) throw new Error("请完整填写成果信息");
  if (!ASSET_TYPES.includes(assetType)) throw new Error("成果类型不合法");
  if (!INDUSTRIES.includes(industry)) throw new Error("所属行业不合法");
  const description = String(payload.description || "").trim();
  if (description.length > 500) throw new Error("成果描述最多 500 字");
  const url = clean(payload.url);
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) throw new Error("材料链接必须是 http(s) 地址");
  return { title, assetType, industry, description, url };
}

async function resolveAssetReviewer(memberId: number, reviewerEmail?: string) {
  const email = clean(reviewerEmail).toLowerCase();
  if (!email) throw new Error("请选择成果发布的主评人");
  const reviewer = await first<{ email: string; displayName: string; role: WorkspaceRole; memberId: number; dingtalkUnionId: string | null }>(sql`
    SELECT email, display_name AS "displayName", role, member_id AS "memberId", dingtalk_union_id AS "dingtalkUnionId"
    FROM workspace_users WHERE email = ${email} AND role IN ('reviewer','admin')
  `);
  if (!reviewer) throw new Error("所选主评人当前不可用");
  if (reviewer.memberId === memberId) throw new Error("主评人不能选择自己");
  return reviewer;
}

async function createAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.complianceConfirmed) throw new Error("提交成果前必须完成合规自查");
  const { title, assetType, industry, description, url } = validateAssetInput(payload);
  if (payload.memberId !== undefined && payload.memberId !== session.memberId) throw new Error("只能为本人申请成果发布");
  const memberId = session.memberId;
  const reviewer = await resolveAssetReviewer(memberId, payload.reviewerEmail);
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO assets (title, description, type, industry, owner_member_id, reviewer_email, reviewer_name, review_status, compliance_status, url)
    VALUES (${title}, ${description}, ${assetType}, ${industry}, ${memberId}, ${reviewer.email}, ${reviewer.displayName}, '待审核', '已自查', ${url})
    RETURNING id
  `);
  await logAction(session.email, "提交团队成果", "asset", Number(inserted?.id || 0), `${title};reviewer=${reviewer.email}`);

  // 钉钉通知主评人（必须 await：Vercel Serverless 在响应返回后会冻结进程，未 await 的 promise 会被终止）
  if (reviewer.dingtalkUnionId) {
    const owner = await first<{ name: string }>(sql`SELECT name FROM members WHERE id = ${memberId}`);
    await notifyAssetReviewSubmitted({
      reviewerUnionId: reviewer.dingtalkUnionId,
      memberName: owner?.name || session.displayName,
      assetTitle: title,
      detailUrl: "https://qianwen-growth-os.vercel.app",
    });
  } else {
    console.log("[dingtalk] 跳过通知：主评人未绑定钉钉", reviewer.email);
  }
}

// 成果重新进入待审核后，钉钉通知其主评人（未指派主评人则跳过）
async function notifyAssetReviewer(assetId: number) {
  const asset = await first<{ title: string; reviewerEmail: string; ownerName: string }>(sql`
    SELECT a.title, a.reviewer_email AS "reviewerEmail", m.name AS "ownerName"
    FROM assets a JOIN members m ON m.id = a.owner_member_id WHERE a.id = ${assetId}
  `);
  if (!asset?.reviewerEmail) return;
  const reviewer = await first<{ dingtalkUnionId: string | null }>(sql`
    SELECT dingtalk_union_id AS "dingtalkUnionId" FROM workspace_users WHERE email = ${asset.reviewerEmail}
  `);
  if (!reviewer?.dingtalkUnionId) {
    console.log("[dingtalk] 跳过通知：主评人未绑定钉钉", asset.reviewerEmail);
    return;
  }
  await notifyAssetReviewSubmitted({
    reviewerUnionId: reviewer.dingtalkUnionId,
    memberName: asset.ownerName,
    assetTitle: asset.title,
    detailUrl: "https://qianwen-growth-os.vercel.app",
  });
}

async function updateAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.assetId) throw new Error("缺少成果 ID");
  const asset = await first<{ id: number; ownerMemberId: number; reviewStatus: string }>(sql`
    SELECT id, owner_member_id AS "ownerMemberId", review_status AS "reviewStatus" FROM assets WHERE id = ${payload.assetId}
  `);
  if (!asset) throw new Error("成果不存在");
  if (asset.ownerMemberId !== session.memberId) throw new Error("只有成果作者可以更新成果");
  if (!payload.complianceConfirmed) throw new Error("编辑成果前必须完成合规自查");
  const { title, assetType, industry, description, url } = validateAssetInput(payload);
  const reviewer = await resolveAssetReviewer(asset.ownerMemberId, payload.reviewerEmail);
  // 每次编辑均以新的发布申请进入评审，避免“已发布”内容被静默替换。
  await run(sql`
    UPDATE assets SET title = ${title}, description = ${description}, type = ${assetType}, industry = ${industry}, url = ${url},
      reviewer_email = ${reviewer.email}, reviewer_name = ${reviewer.displayName}, review_status = '待审核',
      compliance_status = '已自查', review_feedback = '', updated_at = now()
    WHERE id = ${asset.id}
  `);
  await notifyAssetReviewer(asset.id);
  await logAction(session.email, "编辑团队成果", "asset", asset.id, `from=${asset.reviewStatus}`);
}

async function trackAssetReuse(session: SessionUser, payload: ActionPayload) {
  if (!payload.assetId) throw new Error("缺少成果 ID");
  if (!session.memberId) throw new Error("请先登录后再进行操作");
  const asset = await first<{ id: number; ownerMemberId: number; reviewStatus: string }>(sql`
    SELECT id, owner_member_id AS "ownerMemberId", review_status AS "reviewStatus" FROM assets WHERE id = ${payload.assetId}
  `);
  if (!asset) throw new Error("成果不存在");
  if (asset.reviewStatus !== "已发布") throw new Error("只有已发布的成果可以复用");
  if (asset.ownerMemberId === session.memberId) throw new Error("不能给自己的成果计复用");
  await run(sql`INSERT INTO asset_reuse_events (asset_id, member_id, event_type) VALUES (${asset.id}, ${session.memberId}, '复制链接')`);
  await logAction(session.email, "复用成果", "asset", asset.id, `member=${session.memberId}`);
}

async function resubmitAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.assetId) throw new Error("缺少成果 ID");
  const asset = await first<{ id: number; ownerMemberId: number; reviewStatus: string }>(sql`
    SELECT id, owner_member_id AS "ownerMemberId", review_status AS "reviewStatus" FROM assets WHERE id = ${payload.assetId}
  `);
  if (!asset) throw new Error("成果不存在");
  if (asset.ownerMemberId !== session.memberId) throw new Error("只有成果作者可以重新提交发布申请");
  if (!["待补充", "已撤回"].includes(asset.reviewStatus)) throw new Error("只有退回待补充或已撤回的成果可以重新提交");
  await run(sql`UPDATE assets SET review_status = '待审核', review_feedback = '', updated_at = now() WHERE id = ${asset.id}`);
  await logAction(session.email, "重新提交团队成果", "asset", asset.id, `from=${asset.reviewStatus}`);
  // 重新通知主评人（必须 await：Vercel Serverless 在响应返回后会冻结进程）
  await notifyAssetReviewer(asset.id);
}

async function withdrawAsset(session: SessionUser, payload: ActionPayload) {
  if (!payload.assetId) throw new Error("缺少成果 ID");
  const asset = await first<{ id: number; ownerMemberId: number; reviewStatus: string }>(sql`
    SELECT id, owner_member_id AS "ownerMemberId", review_status AS "reviewStatus" FROM assets WHERE id = ${payload.assetId}
  `);
  if (!asset) throw new Error("成果不存在");
  if (!["待审核", "已发布"].includes(asset.reviewStatus)) throw new Error("当前状态不可撤回");
  if (asset.reviewStatus === "已发布") {
    // 下架已发布成果仅管理员可操作
    if (session.role !== "admin") throw new Error("只有管理员可以下架已发布的成果");
  } else if (asset.ownerMemberId !== session.memberId) {
    throw new Error("只有成果作者可以撤回发布申请");
  }
  await run(sql`UPDATE assets SET review_status = '已撤回', updated_at = now() WHERE id = ${asset.id}`);
  await logAction(session.email, asset.reviewStatus === "已发布" ? "下架团队成果" : "撤回团队成果", "asset", asset.id, `from=${asset.reviewStatus}`);
}

async function reviewAsset(session: SessionUser, payload: ActionPayload) {
  if (session.role !== "admin" && session.role !== "reviewer") throw new Error("没有成果审核权限");
  if (!payload.assetId || !["已发布", "待补充"].includes(payload.decision || "")) throw new Error("请选择成果审核结论");
  const asset = await first<{ id: number; title: string; ownerMemberId: number; reviewStatus: string; reviewerEmail: string }>(sql`
    SELECT id, title, owner_member_id AS "ownerMemberId", review_status AS "reviewStatus", reviewer_email AS "reviewerEmail" FROM assets WHERE id = ${payload.assetId}
  `);
  if (!asset) throw new Error("成果不存在");
  // 利益回避：包括管理员在内，任何人都不能审核自己提交的成果。
  if (asset.ownerMemberId === session.memberId) throw new Error("不能审核自己提交的成果");
  if (asset.reviewStatus !== "待审核") throw new Error("当前状态不可审核");
  // 评审人仅处理明确指派给自己的成果；管理员可处理全部待审核成果。
  if (session.role === "reviewer" && asset.reviewerEmail !== session.email) throw new Error("只能处理分配给自己的成果评审");
  const feedback = clean(payload.feedback);
  if (payload.decision === "待补充" && !feedback) throw new Error("退回成果时请填写退回原因");
  if (payload.decision === "已发布") {
    // 发布时清空退回原因并同步合规复核，保持与状态一致
    await run(sql`UPDATE assets SET review_status = '已发布', compliance_status = '已复核', review_feedback = '', updated_at = now() WHERE id = ${asset.id}`);
  } else {
    await run(sql`UPDATE assets SET review_status = '待补充', review_feedback = ${feedback}, updated_at = now() WHERE id = ${asset.id}`);
  }
  await logAction(session.email, "审核团队成果", "asset", asset.id, payload.decision);

  // 钉钉通知提交人评审结论（必须 await：Vercel Serverless 在响应返回后会冻结进程，未 await 的 promise 会被终止）
  const applicantUser = await first<{ email: string; dingtalkUnionId: string | null }>(sql`
    SELECT email, dingtalk_union_id AS "dingtalkUnionId" FROM workspace_users WHERE member_id = ${asset.ownerMemberId}
  `);
  if (applicantUser?.dingtalkUnionId) {
    await notifyAssetReviewDecision({
      applicantUnionId: applicantUser.dingtalkUnionId,
      assetTitle: asset.title,
      decision: payload.decision!,
      feedback: payload.decision === "待补充" ? feedback : undefined,
      detailUrl: "https://qianwen-growth-os.vercel.app",
    });
  } else {
    console.log("[dingtalk] 跳过通知：提交人未绑定钉钉", applicantUser?.email ?? `memberId=${asset.ownerMemberId}`);
  }
}

async function createUser(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  const email = clean(payload.email).toLowerCase();
  const displayName = clean(payload.displayName);
  const password = String(payload.password || "").trim();
  if (!email || !displayName || !password) throw new Error("请完整填写邮箱、姓名和初始密码");
  if (!email.includes("@") || email.length < 5) throw new Error("邮箱格式不正确");
  if (password.length < 6) throw new Error("密码至少需要 6 位");
  const role = ["member", "reviewer", "admin"].includes(payload.role || "") ? payload.role! : "member";
  const existing = await first(sql`SELECT email FROM workspace_users WHERE email = ${email}`);
  if (existing) throw new Error("该邮箱已存在");
  const passwordHash = await hashPassword(password);
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO members (
      user_email, name, role, industry, group_name, current_level, self_level, target_level,
      target_date, status, review_status, gap, plan, next_task
    ) VALUES (${email}, ${displayName}, ${role === "admin" ? "能力管理员" : "团队成员"}, '未分配', ${clean(payload.groupName) || "综合组"}, 1, 1, 3, '2026-09-30', '进行中', '草稿', '待添加第一条晋级证据', '完成个人能力定位并添加第一条证据', '完成首次能力定位')
    RETURNING id
  `);
  const memberId = Number(inserted?.id || 0);
  await run(sql`
    INSERT INTO workspace_users (email, display_name, role, member_id, password_hash)
    VALUES (${email}, ${displayName}, ${role}, ${memberId}, ${passwordHash})
  `);
  await logAction(session.email, "创建成员账号", "member", memberId, `email=${email};role=${role}`);
}

async function updateUserAccess(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  if (!payload.email || !payload.role || !["member", "reviewer", "admin"].includes(payload.role)) throw new Error("成员权限参数不完整");
  const target = await first<{ memberId: number; role: WorkspaceRole }>(sql`
    SELECT member_id AS "memberId", role FROM workspace_users WHERE email = ${payload.email}
  `);
  if (!target) throw new Error("成员不存在");
  if (payload.email.toLowerCase() === session.email.toLowerCase() && payload.role !== "admin") throw new Error("不能降低自己的管理员权限");
  if (target.role === "admin" && payload.role !== "admin") {
    const admins = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM workspace_users WHERE role = 'admin'`);
    if ((admins?.count || 0) <= 1) throw new Error("至少保留 1 位管理员");
  }
  await run(sql`UPDATE workspace_users SET role = ${payload.role} WHERE email = ${payload.email}`);
  await run(sql`UPDATE members SET group_name = ${clean(payload.groupName) || "综合组"}, updated_at = now() WHERE id = ${target.memberId}`);
  await logAction(session.email, "更新成员权限", "member", target.memberId, `role=${payload.role};group=${clean(payload.groupName)}`);
}

async function saveFrameworkLevel(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  const level = payload.frameworkLevel;
  if (!level || level.level < 1 || level.level > 10 || !level.title.trim() || !level.standard.trim()) throw new Error("请完整填写层级名称与认证标准");
  const draftId = await ensureDraftFramework(session.email, payload.changeNote);
  await run(sql`
    UPDATE framework_levels SET title = ${clean(level.title)}, role = ${clean(level.role)}, stage = ${clean(level.stage)},
      definition = ${clean(level.definition)}, standard = ${clean(level.standard)},
      abilities_json = ${JSON.stringify(level.abilities || [])}, criteria_json = ${JSON.stringify(level.criteria || [])},
      practices_json = ${JSON.stringify(level.practices || [])}, path = ${clean(level.path)},
      badges_json = ${JSON.stringify(level.badges || [])}, resources_json = ${JSON.stringify(level.resources || [])}, updated_at = now()
    WHERE framework_version_id = ${draftId} AND level = ${level.level}
  `);
  await run(sql`UPDATE framework_versions SET change_note = ${clean(payload.changeNote) || "更新能力标准"}, updated_at = now() WHERE id = ${draftId}`);
  await logAction(session.email, "保存体系草稿", "framework", draftId, `L${level.level}`);
}

async function publishFramework(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  const draft = await first<{ id: number }>(sql`SELECT id FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1`);
  if (!draft) throw new Error("当前没有待发布的体系草稿");
  const levelCount = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM framework_levels WHERE framework_version_id = ${draft.id}`);
  if (levelCount?.count !== 10) throw new Error("十个层级完整后才能发布");
  await run(sql`UPDATE framework_versions SET status = '已停用', updated_at = now() WHERE status = '已发布'`);
  await run(sql`
    UPDATE framework_versions SET status = '已发布', change_note = ${clean(payload.changeNote) || "发布能力体系更新"},
      published_at = now(), updated_at = now()
    WHERE id = ${draft.id}
  `);
  await logAction(session.email, "发布能力体系", "framework", draft.id, clean(payload.changeNote));
}

const FEEDBACK_STATUSES = ["open", "in_progress", "resolved", "closed"];
const SCREENSHOT_MAX_LENGTH = 2_800_000; // 压缩后 Base64 上限约 2.8MB

const feedbackSelect = sql`
  SELECT f.id, f.title, f.description, f.page_name AS "pageName", f.status,
    COALESCE(f.admin_response, '') AS "adminResponse", f.created_by_email AS "createdByEmail",
    to_char(f.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
    COALESCE(to_char(f.resolved_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS "resolvedAt",
    (f.screenshot IS NOT NULL AND f.screenshot != '') AS "hasScreenshot"
  FROM feedbacks f
`;

async function submitFeedback(session: SessionUser, payload: ActionPayload) {
  const title = clean(payload.title);
  const description = String(payload.description || "").trim();
  const pageName = clean(payload.pageName);
  const screenshot = String(payload.screenshot || "");
  if (!title) throw new Error("请填写问题标题");
  if (title.length > 100) throw new Error("问题标题最多 100 字");
  if (!description) throw new Error("请填写问题描述");
  if (description.length > 2000) throw new Error("问题描述最多 2000 字");
  if (!pageName) throw new Error("请选择问题所在页面");
  if (screenshot && !screenshot.startsWith("data:image/")) throw new Error("截图格式不合法");
  if (screenshot.length > SCREENSHOT_MAX_LENGTH) throw new Error("截图过大，请压缩后重试");
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO feedbacks (member_id, created_by_email, title, description, page_name, screenshot, status)
    VALUES (${session.memberId}, ${session.email}, ${title}, ${description}, ${pageName}, ${screenshot || null}, 'open')
    RETURNING id
  `);
  await logAction(session.email, "提交问题反馈", "feedback", Number(inserted?.id || 0), `page=${pageName}`);

  // 钉钉通知全部已绑定的管理员（失败不影响提交成功；必须 await：Vercel Serverless 在响应返回后会冻结进程）
  const admins = await all<{ dingtalkUnionId: string }>(sql`
    SELECT dingtalk_union_id AS "dingtalkUnionId" FROM workspace_users
    WHERE role = 'admin' AND dingtalk_union_id IS NOT NULL AND dingtalk_union_id != ''
  `);
  if (admins.length) {
    await notifyNewFeedback({
      adminUnionIds: admins.map(admin => admin.dingtalkUnionId),
      title,
      submitterName: session.displayName,
      pageName,
      detailUrl: "https://qianwen-growth-os.vercel.app",
    });
  } else {
    console.log("[dingtalk] 跳过通知：没有已绑定钉钉的管理员");
  }
}

async function listFeedbacks(session: SessionUser, payload: ActionPayload) {
  const scope = payload.scope || "mine";
  if (scope === "all") requireAdmin(session);
  const conditions: SQL[] = [scope === "all" ? sql`1 = 1` : sql`f.created_by_email = ${session.email}`];
  if (payload.status && FEEDBACK_STATUSES.includes(payload.status)) conditions.push(sql`f.status = ${payload.status}`);
  if (payload.pageName?.trim()) conditions.push(sql`f.page_name = ${clean(payload.pageName)}`);
  const keyword = clean(payload.keyword);
  if (keyword) {
    const pattern = `%${keyword}%`;
    conditions.push(sql`(f.title ILIKE ${pattern} OR f.description ILIKE ${pattern} OR f.created_by_email ILIKE ${pattern})`);
  }
  const where = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
  // 列表不返回 screenshot 大字段，前端按需通过 get_feedback 获取
  const feedbacks = await all<Record<string, unknown>>(sql`${feedbackSelect} WHERE ${where} ORDER BY f.created_at DESC LIMIT 500`);
  if (scope !== "all") return { feedbacks };
  // stats 与列表复用同一组筛选条件（不加 LIMIT），保证统计卡片与列表口径一致
  const stats = await first<{ total: number; open: number; inProgress: number; resolved: number }>(sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE f.status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE f.status = 'in_progress')::int AS "inProgress",
      COUNT(*) FILTER (WHERE f.status = 'resolved')::int AS resolved
    FROM feedbacks f WHERE ${where}
  `);
  return { feedbacks, stats: stats || { total: 0, open: 0, inProgress: 0, resolved: 0 } };
}

async function getFeedback(session: SessionUser, payload: ActionPayload) {
  if (!payload.feedbackId) throw new Error("缺少反馈 ID");
  const feedback = await first<Record<string, unknown>>(sql`
    SELECT f.id, f.title, f.description, f.page_name AS "pageName", COALESCE(f.screenshot, '') AS screenshot,
      f.status, COALESCE(f.admin_response, '') AS "adminResponse", f.created_by_email AS "createdByEmail",
      to_char(f.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
      COALESCE(to_char(f.resolved_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS "resolvedAt"
    FROM feedbacks f WHERE f.id = ${payload.feedbackId}
  `);
  if (!feedback) throw new Error("反馈不存在");
  if (feedback.createdByEmail !== session.email && session.role !== "admin") throw new Error("没有查看该反馈的权限");
  return { feedback };
}

async function updateFeedback(session: SessionUser, payload: ActionPayload) {
  requireAdmin(session);
  if (!payload.feedbackId) throw new Error("缺少反馈 ID");
  if (!FEEDBACK_STATUSES.includes(payload.status || "")) throw new Error("请选择处理状态");
  const feedback = await first<{ id: number; memberId: number; title: string }>(sql`
    SELECT id, member_id AS "memberId", title FROM feedbacks WHERE id = ${payload.feedbackId}
  `);
  if (!feedback) throw new Error("反馈不存在");
  const adminResponse = clean(payload.adminResponse);
  const resolved = payload.status === "resolved" || payload.status === "closed";
  await run(sql`
    UPDATE feedbacks SET status = ${payload.status}, admin_response = ${adminResponse || null},
      resolved_at = ${resolved ? sql`now()` : sql`NULL`}, updated_at = now()
    WHERE id = ${feedback.id}
  `);
  await logAction(session.email, "处理问题反馈", "feedback", feedback.id, `status=${payload.status}`);

  // 置为 resolved 且有回复时钉钉通知提交人（失败不影响返回成功）
  if (payload.status === "resolved" && adminResponse) {
    const submitter = await first<{ email: string; dingtalkUnionId: string | null }>(sql`
      SELECT email, dingtalk_union_id AS "dingtalkUnionId" FROM workspace_users WHERE member_id = ${feedback.memberId}
    `);
    if (submitter?.dingtalkUnionId) {
      await notifyFeedbackResolved({
        submitterUnionId: submitter.dingtalkUnionId,
        title: feedback.title,
        adminResponse,
        detailUrl: "https://qianwen-growth-os.vercel.app",
      });
    } else {
      console.log("[dingtalk] 跳过通知：提交人未绑定钉钉", submitter?.email ?? `memberId=${feedback.memberId}`);
    }
  }
}

async function ensureDraftFramework(actorEmail: string, note?: string) {
  const existing = await first<{ id: number }>(sql`SELECT id FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1`);
  if (existing) return existing.id;
  const published = await first<{ id: number }>(sql`SELECT id FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1`);
  if (!published) throw new Error("当前没有可编辑的已发布体系");
  const count = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM framework_versions`);
  const inserted = await first<{ id: number }>(sql`
    INSERT INTO framework_versions (version_name, status, change_note, created_by_email)
    VALUES (${`v${(count?.count || 1) + 1}.0`}, '草稿', ${clean(note) || "能力体系更新"}, ${actorEmail})
    RETURNING id
  `);
  const draftId = Number(inserted?.id || 0);
  await run(sql`
    INSERT INTO framework_levels (
      framework_version_id, level, title, role, stage, definition, standard,
      abilities_json, criteria_json, practices_json, path, badges_json, resources_json
    )
    SELECT ${draftId}, level, title, role, stage, definition, standard,
      abilities_json, criteria_json, practices_json, path, badges_json, resources_json
    FROM framework_levels WHERE framework_version_id = ${published.id}
  `);
  return draftId;
}

async function loadFramework(session: SessionUser | null) {
  const publishedMeta = await first<Record<string, unknown>>(sql`
    SELECT id, version_name AS "versionName", status, change_note AS "changeNote",
      COALESCE(to_char(published_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS "publishedAt",
      to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
    FROM framework_versions WHERE status = '已发布' ORDER BY id DESC LIMIT 1
  `);
  if (!publishedMeta) throw new Error("能力体系尚未初始化");
  const published = { ...publishedMeta, levels: await loadFrameworkLevels(Number(publishedMeta.id)) };
  if (session?.role !== "admin") return { published, draft: null };
  const draftMeta = await first<Record<string, unknown>>(sql`
    SELECT id, version_name AS "versionName", status, change_note AS "changeNote",
      COALESCE(to_char(published_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS "publishedAt",
      to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
    FROM framework_versions WHERE status = '草稿' ORDER BY id DESC LIMIT 1
  `);
  const draft = draftMeta ? { ...draftMeta, levels: await loadFrameworkLevels(Number(draftMeta.id)) } : null;
  return { published, draft };
}

async function loadFrameworkLevels(versionId: number): Promise<LevelDefinition[]> {
  const rows = await all<Record<string, unknown>>(sql`
    SELECT level, title, role, stage, definition, standard, abilities_json AS "abilitiesJson",
      criteria_json AS "criteriaJson", practices_json AS "practicesJson", path,
      badges_json AS "badgesJson", resources_json AS "resourcesJson"
    FROM framework_levels WHERE framework_version_id = ${versionId} ORDER BY level
  `);
  return rows.map(row => ({
    level: Number(row.level), title: String(row.title), role: String(row.role), stage: String(row.stage),
    definition: String(row.definition), standard: String(row.standard), path: String(row.path),
    abilities: parseJson<string[]>(row.abilitiesJson, []), criteria: parseJson<LevelDefinition["criteria"]>(row.criteriaJson, []),
    practices: parseJson<string[]>(row.practicesJson, []), badges: parseJson<string[]>(row.badgesJson, []),
    resources: parseJson<LevelDefinition["resources"]>(row.resourcesJson, []),
  }));
}

async function buildMonthlyReport(members: ReturnType<typeof normalizeMember>[]) {
  const promotions = await all<Record<string, unknown>>(sql`
    SELECT lh.id, m.name AS "memberName", lh.from_level AS "fromLevel", lh.to_level AS "toLevel",
      to_char(lh.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt"
    FROM level_history lh JOIN members m ON m.id = lh.member_id
    WHERE to_char(lh.created_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM')
    ORDER BY lh.created_at DESC
  `);
  const evidence = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM evidences WHERE to_char(created_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM')`);
  const newAssets = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM assets WHERE to_char(updated_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM')`);
  const publishedAssets = await first<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM assets WHERE review_status = '已发布' AND to_char(updated_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM')`);
  const updatedThisMonth = members.filter(member => member.checkedInThisMonth).length;
  return {
    cycle: new Date().toISOString().slice(0, 7),
    promotions: promotions.map(row => ({
      id: Number(row.id), memberName: String(row.memberName), fromLevel: Number(row.fromLevel), toLevel: Number(row.toLevel), createdAt: String(row.createdAt),
    })),
    newEvidenceCount: Number(evidence?.count || 0),
    newAssetCount: Number(newAssets?.count || 0),
    publishedAssetCount: Number(publishedAssets?.count || 0),
    updatedThisMonth,
    memberCount: members.length,
    participationRate: members.length ? Math.round(updatedThisMonth / members.length * 100) : 0,
  };
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
    evidenceCount: Number(row.evidenceCount || 0), publishedAssetCount: Number(row.publishedAssetCount || 0), pendingReviewId: row.pendingReviewId ? Number(row.pendingReviewId) : null, overdueTasks: Number(row.overdueTasks || 0),
    checkedInThisMonth: Boolean(Number(row.checkedInThisMonth || 0)),
  };
}

function buildMetrics(members: ReturnType<typeof normalizeMember>[]) {
  const levelValues = members.map(member => member.currentLevel).sort((a, b) => a - b);
  const count = members.length;
  const average = count ? levelValues.reduce((sum, level) => sum + level, 0) / count : 0;
  const median = count ? (levelValues[Math.floor((count - 1) / 2)] + levelValues[Math.ceil((count - 1) / 2)]) / 2 : 0;
  const distribution = Array.from({ length: 10 }, (_, index) => levelValues.filter(level => level === index + 1).length);
  const pendingReviews = members.filter(member => member.pendingReviewId !== null).length;
  const updatedThisMonth = members.filter(member => member.checkedInThisMonth).length;
  const totalEvidenceTarget = Math.max(1, members.reduce((sum, member) => sum + Math.max(3, member.targetLevel - member.currentLevel + 2), 0));
  return {
    memberCount: count, average: Number(average.toFixed(1)), median,
    l3Rate: count ? Math.round(members.filter(member => member.currentLevel >= 3).length / count * 100) : 0,
    l6Rate: count ? Math.round(members.filter(member => member.currentLevel >= 6).length / count * 100) : 0,
    atRisk: members.filter(member => ["有风险", "阻塞"].includes(member.progressStatus)).length,
    overdue: members.reduce((sum, member) => sum + member.overdueTasks, 0), pendingReviews, updatedThisMonth,
    evidenceCompletion: Math.min(100, Math.round(members.reduce((sum, member) => sum + member.evidenceCount, 0) / totalEvidenceTarget * 100)),
    distribution, reviewReady: Math.max(0, count - pendingReviews),
  };
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
