/**
 * One-off database seed script (replaces the old runtime auto-seeding).
 *
 * Usage:
 *   1. Run migrations first: npm run db:migrate
 *   2. Seed:                 npm run db:seed
 *
 * Options via env:
 *   DATABASE_URL   Neon Postgres connection string (falls back to .env.local / .env)
 *   SEED_PASSWORD  Initial password for all demo accounts (random when omitted; printed once)
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { count, eq, sql } from "drizzle-orm";
import { levels as defaultLevels } from "../app/data";
import {
  assets,
  auditLogs,
  evidences,
  frameworkLevels,
  frameworkVersions,
  growthTasks,
  members,
  reviews,
  workspaceUsers,
} from "../db/schema";

function loadEnvFile(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

const seedMembers = [
  ["林晓", "行业解决方案经理", "能源", "能源组", 4, 4, 6, "进行中", "待补证", "补齐可复用资产与量化提效数据", "完成巡检报告 Skill，邀请 6 位同事试用", "能源安全合规知识库"],
  ["陈墨", "售前架构师", "新质", "新质组", 6, 6, 7, "正常", "已提交", "需要完成客户测试环境集成 POC", "打通 MES 测试接口并沉淀 trace 案例", "对接 PLM / MES 测试环境"],
  ["周宁", "客户经理", "高校", "高校组", 3, 4, 5, "进行中", "草稿", "AI Coding 原型经验不足", "两周内完成招生咨询智能体原型", "科研文献分析原型"],
  ["王璐", "解决方案专家", "政务", "政务组", 5, 5, 6, "正常", "评审中", "复用人数尚未达标", "将政策比对 Skill 发布至团队仓库", "等保合规话术库"],
  ["赵凯", "技术顾问", "能源", "能源组", 7, 7, 8, "有风险", "待补证", "缺少完整评测与上线应用", "为两个重点商机设计定制评测集", "生产调度系统集成"],
  ["苏雨", "客户成功", "高校", "高校组", 2, 2, 3, "进行中", "草稿", "客户现场演示与故障预案不足", "主动申请一次客户演示并完成预案", "智慧教务场景演示"],
  ["方晨", "产品运营", "政务", "政务组", 4, 4, 5, "正常", "草稿", "售前原型尚未进入真实商机", "认领 12345 工单分派原型", "12345 工单智能分派"],
  ["唐峰", "行业总监", "新质", "新质组", 8, 8, 9, "正常", "已提交", "外部影响力数据未达标", "持续运营开源项目并完成客户高层分享", "芯片行业评测方法论"],
] as const;

const seedAccounts = [
  { email: "linxiao@qianwen", displayName: "林晓", role: "admin", memberName: "林晓" },
  { email: "chenmo@qianwen", displayName: "陈墨", role: "reviewer", memberName: "陈墨" },
  { email: "zhouning@qianwen", displayName: "周宁", role: "member", memberName: "周宁" },
  { email: "wanglu@qianwen", displayName: "王璐", role: "reviewer", memberName: "王璐" },
  { email: "zhaokai@qianwen", displayName: "赵凯", role: "reviewer", memberName: "赵凯" },
  { email: "suyu@qianwen", displayName: "苏雨", role: "member", memberName: "苏雨" },
  { email: "fangchen@qianwen", displayName: "方晨", role: "member", memberName: "方晨" },
  { email: "tangfeng@qianwen", displayName: "唐峰", role: "reviewer", memberName: "唐峰" },
] as const;

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const { getDb } = await import("../db");
  const db = await getDb();

  // Members
  const [memberCount] = await db.select({ value: count() }).from(members);
  if (!Number(memberCount?.value)) {
    await db.insert(members).values(seedMembers.map(row => ({
      name: row[0], role: row[1], industry: row[2], groupName: row[3],
      currentLevel: row[4], selfLevel: row[5], targetLevel: row[6],
      targetDate: "2026-09-30", status: row[7], reviewStatus: row[8],
      gap: row[9], plan: row[10], nextTask: row[11],
    })));
    console.log(`✔ 已写入 ${seedMembers.length} 名成员`);
  } else {
    console.log("• members 已有数据，跳过");
  }

  const memberRows = await db.select({ id: members.id, name: members.name }).from(members);
  const byName = new Map(memberRows.map(row => [row.name, row.id]));

  // Accounts
  const [userCount] = await db.select({ value: count() }).from(workspaceUsers);
  if (!Number(userCount?.value)) {
    const password = process.env.SEED_PASSWORD || randomBytes(6).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 10);
    const values = seedAccounts
      .filter(account => byName.has(account.memberName))
      .map(account => ({
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        memberId: byName.get(account.memberName)!,
        passwordHash,
      }));
    await db.insert(workspaceUsers).values(values);
    console.log(`✔ 已写入 ${values.length} 个账号`);
    console.log(`  ⚠ 演示账号统一初始密码（仅本次打印，请妥善保存）: ${password}`);
  } else {
    console.log("• workspace_users 已有数据，跳过");
  }

  // Capability framework v1.0
  const [frameworkCount] = await db.select({ value: count() }).from(frameworkVersions);
  if (!Number(frameworkCount?.value)) {
    const [version] = await db.insert(frameworkVersions).values({
      versionName: "v1.0",
      status: "已发布",
      changeNote: "十级能力体系初始版本",
      createdByEmail: "system",
      publishedAt: sql`now()`,
    }).returning({ id: frameworkVersions.id });
    await db.insert(frameworkLevels).values(defaultLevels.map(level => ({
      frameworkVersionId: version.id,
      level: level.level,
      title: level.title,
      role: level.role,
      stage: level.stage,
      definition: level.definition,
      standard: level.standard,
      abilitiesJson: JSON.stringify(level.abilities),
      criteriaJson: JSON.stringify(level.criteria),
      practicesJson: JSON.stringify(level.practices),
      path: level.path,
      badgesJson: JSON.stringify(level.badges || []),
      resourcesJson: JSON.stringify(level.resources),
    })));
    console.log("✔ 已发布能力体系 v1.0（10 个层级）");
  } else {
    console.log("• framework_versions 已有数据，跳过");
  }

  // Demo assets
  const [assetCount] = await db.select({ value: count() }).from(assets);
  if (!Number(assetCount?.value)) {
    await db.insert(assets).values([
      { title: "能源巡检报告 Skill", type: "Skill", industry: "能源", ownerMemberId: byName.get("林晓") || memberRows[0].id, reviewStatus: "已发布", complianceStatus: "已审核", reusePeople: 8, reuseClients: 2, url: "https://github.com/example/energy-skill" },
      { title: "政策条款智能比对", type: "知识库", industry: "政务", ownerMemberId: byName.get("王璐") || memberRows[0].id, reviewStatus: "审核中", complianceStatus: "已自查", reusePeople: 4, reuseClients: 1, url: "" },
      { title: "制造业评测方法论", type: "评测集", industry: "新质", ownerMemberId: byName.get("唐峰") || memberRows[0].id, reviewStatus: "已发布", complianceStatus: "已审核", reusePeople: 12, reuseClients: 3, url: "https://github.com/example/ai-eval" },
      { title: "招生咨询智能体原型", type: "原型", industry: "高校", ownerMemberId: byName.get("周宁") || memberRows[0].id, reviewStatus: "待补充", complianceStatus: "待复核", reusePeople: 2, reuseClients: 0, url: "" },
    ]);
    console.log("✔ 已写入 4 条演示成果");
  } else {
    console.log("• assets 已有数据，跳过");
  }

  // Demo reviews (current cycle)
  const cycle = new Date().toISOString().slice(0, 7);
  const [reviewCount] = await db.select({ value: count() }).from(reviews);
  if (!Number(reviewCount?.value)) {
    const demoReviews = [
      { memberName: "唐峰", fromLevel: 8, targetLevel: 9, state: "已提交", reviewerName: "待分配", feedback: "" },
      { memberName: "陈墨", fromLevel: 6, targetLevel: 7, state: "评审中", reviewerName: "能力管理员", feedback: "补充客户对 POC 效果的确认记录。" },
      { memberName: "王璐", fromLevel: 5, targetLevel: 6, state: "评审中", reviewerName: "能力管理员", feedback: "复用记录已核验，待检查脱敏清单。" },
      { memberName: "赵凯", fromLevel: 7, targetLevel: 8, state: "待补证", reviewerName: "能力管理员", feedback: "缺少应用稳定运行满月的数据。" },
    ];
    await db.insert(reviews).values(demoReviews
      .filter(review => byName.has(review.memberName))
      .map(review => ({
        memberId: byName.get(review.memberName)!,
        fromLevel: review.fromLevel,
        targetLevel: review.targetLevel,
        state: review.state,
        cycle,
        reviewerName: review.reviewerName,
        feedback: review.feedback,
      })));
    console.log("✔ 已写入 4 条演示评审");
  } else {
    console.log("• reviews 已有数据，跳过");
  }

  // Demo evidences
  const [evidenceCount] = await db.select({ value: count() }).from(evidences);
  if (!Number(evidenceCount?.value)) {
    const demoEvidences = [
      { memberName: "林晓", level: 6, criterionKey: "asset", title: "能源巡检报告 Skill 入库记录", kind: "仓库", url: "https://github.com/example/energy-skill", outcome: "8 人复用，已用于 2 家客户交流", status: "已核验" },
      { memberName: "陈墨", level: 7, criterionKey: "poc", title: "MES 测试环境集成 POC", kind: "报告", url: "", outcome: "已跑通工单查询与异常归因", status: "待核验" },
      { memberName: "唐峰", level: 9, criterionKey: "original", title: "制造业智能体评测方法论", kind: "仓库", url: "https://github.com/example/ai-eval", outcome: "支撑 2 个客户选型讨论", status: "待核验" },
    ];
    await db.insert(evidences).values(demoEvidences
      .filter(evidence => byName.has(evidence.memberName))
      .map(evidence => ({
        memberId: byName.get(evidence.memberName)!,
        level: evidence.level,
        criterionKey: evidence.criterionKey,
        title: evidence.title,
        kind: evidence.kind,
        url: evidence.url,
        outcome: evidence.outcome,
        status: evidence.status,
        createdByEmail: "seed@local",
      })));
    console.log("✔ 已写入 3 条演示证据");
  } else {
    console.log("• evidences 已有数据，跳过");
  }

  // Demo growth tasks
  const [taskCount] = await db.select({ value: count() }).from(growthTasks);
  if (!Number(taskCount?.value)) {
    const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fullMembers = await db.select().from(members);
    const values = fullMembers
      .filter(member => ["林晓", "陈墨", "周宁", "王璐", "赵凯", "唐峰"].includes(member.name))
      .map(member => ({
        memberId: member.id,
        title: member.nextTask,
        dueDate: member.name === "赵凯" ? lastWeek : inTwoWeeks,
        status: member.name === "赵凯" ? "逾期" : "进行中",
        linkedLevel: member.targetLevel,
        linkedAnchor: member.industry,
      }));
    await db.insert(growthTasks).values(values);
    console.log(`✔ 已写入 ${values.length} 条成长任务`);
  } else {
    console.log("• growth_tasks 已有数据，跳过");
  }

  // Align member review status with pending reviews, assign default reviewer
  await db.execute(sql`
    UPDATE members SET review_status = COALESCE((
      SELECT r.state FROM reviews r
      WHERE r.member_id = members.id AND r.state IN ('已提交','评审中','待补证')
      ORDER BY r.id DESC LIMIT 1
    ), review_status)
  `);
  const [systemReviewer] = await db
    .select({ email: workspaceUsers.email, displayName: workspaceUsers.displayName })
    .from(workspaceUsers)
    .where(sql`${workspaceUsers.role} IN ('reviewer','admin')`)
    .orderBy(sql`CASE ${workspaceUsers.role} WHEN 'admin' THEN 1 ELSE 2 END`)
    .limit(1);
  if (systemReviewer) {
    await db.update(reviews)
      .set({ reviewerEmail: systemReviewer.email, reviewerName: systemReviewer.displayName })
      .where(eq(reviews.reviewerEmail, ""));
  }
  await db.insert(auditLogs).values({ actorEmail: "seed@local", action: "初始化种子数据", entityType: "system", entityId: 0, detail: `cycle=${cycle}` });

  console.log("✅ 种子数据初始化完成");
}

main().catch(error => {
  console.error("❌ 种子数据初始化失败:", error);
  process.exit(1);
});
