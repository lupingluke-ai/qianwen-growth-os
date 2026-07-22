import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../chatgpt-auth";
import { levels as defaultLevels } from "../data";

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

const createStatements = [
  `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    industry TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '综合组',
    current_level INTEGER NOT NULL DEFAULT 1,
    self_level INTEGER NOT NULL DEFAULT 1,
    target_level INTEGER NOT NULL DEFAULT 3,
    target_date TEXT NOT NULL DEFAULT '2026-09-30',
    status TEXT NOT NULL DEFAULT '进行中',
    review_status TEXT NOT NULL DEFAULT '草稿',
    gap TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    next_task TEXT NOT NULL DEFAULT '',
    last_checkin TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_users (
    email TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    member_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS evidences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    criterion_key TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT '链接',
    url TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '有效',
    nominate_asset INTEGER NOT NULL DEFAULT 0,
    created_by_email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    from_level INTEGER NOT NULL,
    target_level INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT '已提交',
    cycle TEXT NOT NULL,
    reviewer_email TEXT NOT NULL DEFAULT '',
    reviewer_name TEXT NOT NULL DEFAULT '待分配',
    framework_version_id INTEGER NOT NULL DEFAULT 0,
    feedback TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS level_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    from_level INTEGER NOT NULL,
    to_level INTEGER NOT NULL,
    decision TEXT NOT NULL,
    reviewer_email TEXT NOT NULL,
    framework_version_id INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS growth_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '进行中',
    linked_level INTEGER NOT NULL,
    linked_anchor TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    industry TEXT NOT NULL,
    owner_member_id INTEGER NOT NULL,
    source_evidence_id INTEGER NOT NULL DEFAULT 0,
    review_status TEXT NOT NULL DEFAULT '待审核',
    compliance_status TEXT NOT NULL DEFAULT '已自查',
    reuse_people INTEGER NOT NULL DEFAULT 0,
    reuse_clients INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS framework_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '草稿',
    change_note TEXT NOT NULL DEFAULT '',
    created_by_email TEXT NOT NULL DEFAULT 'system',
    published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS framework_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    framework_version_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    title TEXT NOT NULL,
    role TEXT NOT NULL,
    stage TEXT NOT NULL,
    definition TEXT NOT NULL,
    standard TEXT NOT NULL,
    abilities_json TEXT NOT NULL DEFAULT '[]',
    criteria_json TEXT NOT NULL DEFAULT '[]',
    practices_json TEXT NOT NULL DEFAULT '[]',
    path TEXT NOT NULL DEFAULT '',
    badges_json TEXT NOT NULL DEFAULT '[]',
    resources_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function ensureWorkspaceDatabase() {
  const db = env.DB;
  await db.batch([
    ...createStatements.map(statement => db.prepare(statement)),
    db.prepare("CREATE INDEX IF NOT EXISTS members_industry_idx ON members (industry)"),
    db.prepare("CREATE INDEX IF NOT EXISTS evidence_member_idx ON evidences (member_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS review_member_idx ON reviews (member_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS asset_industry_idx ON assets (industry)"),
  ]);

  await ensureWorkspaceColumns();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS members_group_idx ON members (group_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS framework_level_version_idx ON framework_levels (framework_version_id, level)"),
  ]);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>();
  if (!count?.count) {
    await db.batch(seedMembers.map(member => db.prepare(`
      INSERT INTO members (
        name, role, industry, group_name, current_level, self_level, target_level,
        target_date, status, review_status, gap, plan, next_task
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-30', ?, ?, ?, ?, ?)
    `).bind(...member)));
  }

  await seedWorkspaceData();
  await seedFramework();
}

async function ensureWorkspaceColumns() {
  const database = env.DB;
  const statements: Array<{ table: string; name: string; sql: string }> = [
    { table: "members", name: "user_email", sql: "ALTER TABLE members ADD COLUMN user_email TEXT" },
    { table: "members", name: "self_level", sql: "ALTER TABLE members ADD COLUMN self_level INTEGER NOT NULL DEFAULT 1" },
    { table: "members", name: "review_status", sql: "ALTER TABLE members ADD COLUMN review_status TEXT NOT NULL DEFAULT '草稿'" },
    { table: "members", name: "last_checkin", sql: "ALTER TABLE members ADD COLUMN last_checkin TEXT NOT NULL DEFAULT ''" },
    { table: "members", name: "group_name", sql: "ALTER TABLE members ADD COLUMN group_name TEXT NOT NULL DEFAULT '综合组'" },
    { table: "evidences", name: "nominate_asset", sql: "ALTER TABLE evidences ADD COLUMN nominate_asset INTEGER NOT NULL DEFAULT 0" },
    { table: "reviews", name: "framework_version_id", sql: "ALTER TABLE reviews ADD COLUMN framework_version_id INTEGER NOT NULL DEFAULT 0" },
    { table: "level_history", name: "framework_version_id", sql: "ALTER TABLE level_history ADD COLUMN framework_version_id INTEGER NOT NULL DEFAULT 0" },
    { table: "assets", name: "source_evidence_id", sql: "ALTER TABLE assets ADD COLUMN source_evidence_id INTEGER NOT NULL DEFAULT 0" },
  ];
  for (const statement of statements) {
    const info = await database.prepare(`PRAGMA table_info(${statement.table})`).all<{ name: string }>();
    if (!info.results.some(column => column.name === statement.name)) await database.prepare(statement.sql).run();
  }
  await database.prepare("UPDATE members SET self_level = current_level WHERE self_level IS NULL").run();
  await database.prepare("UPDATE members SET group_name = CASE WHEN industry = '未分配' THEN '综合组' ELSE industry || '组' END WHERE group_name = '综合组' AND industry != '未分配'").run();
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS members_user_email_unique ON members (user_email)").run();
}

async function seedFramework() {
  const database = env.DB;
  const count = await database.prepare("SELECT COUNT(*) AS count FROM framework_versions").first<{ count: number }>();
  if (count?.count) return;
  const result = await database.prepare(`
    INSERT INTO framework_versions (version_name, status, change_note, created_by_email, published_at)
    VALUES ('v1.0', '已发布', '十级能力体系初始版本', 'system', CURRENT_TIMESTAMP)
  `).run();
  const versionId = Number(result.meta.last_row_id);
  await database.batch(defaultLevels.map(level => database.prepare(`
    INSERT INTO framework_levels (
      framework_version_id, level, title, role, stage, definition, standard,
      abilities_json, criteria_json, practices_json, path, badges_json, resources_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    versionId, level.level, level.title, level.role, level.stage, level.definition, level.standard,
    JSON.stringify(level.abilities), JSON.stringify(level.criteria), JSON.stringify(level.practices), level.path,
    JSON.stringify(level.badges || []), JSON.stringify(level.resources),
  )));
}

async function seedWorkspaceData() {
  const db = env.DB;
  const assetCount = await db.prepare("SELECT COUNT(*) AS count FROM assets").first<{ count: number }>();
  if (!assetCount?.count) {
    const owners = await db.prepare("SELECT id, name FROM members").all<{ id: number; name: string }>();
    const byName = new Map(owners.results.map(row => [row.name, row.id]));
    const rows = [
      ["能源巡检报告 Skill", "Skill", "能源", byName.get("林晓") || 1, "已发布", "已审核", 8, 2, "https://github.com/example/energy-skill"],
      ["政策条款智能比对", "知识库", "政务", byName.get("王璐") || 1, "审核中", "已自查", 4, 1, ""],
      ["制造业评测方法论", "评测集", "新质", byName.get("唐峰") || 1, "已发布", "已审核", 12, 3, "https://github.com/example/ai-eval"],
      ["招生咨询智能体原型", "原型", "高校", byName.get("周宁") || 1, "待补充", "待复核", 2, 0, ""],
    ];
    await db.batch(rows.map(row => db.prepare(`
      INSERT INTO assets (title, type, industry, owner_member_id, review_status, compliance_status, reuse_people, reuse_clients, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...row)));
  }

  const reviewCount = await db.prepare("SELECT COUNT(*) AS count FROM reviews").first<{ count: number }>();
  if (!reviewCount?.count) {
    await db.batch([
      db.prepare("INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_name, feedback, submitted_at) SELECT id, 8, 9, '已提交', '2026-07', '待分配', '', '2026-07-12 09:00:00' FROM members WHERE name = '唐峰'"),
      db.prepare("INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_name, feedback, submitted_at) SELECT id, 6, 7, '评审中', '2026-07', '能力管理员', '补充客户对 POC 效果的确认记录。', '2026-07-11 16:20:00' FROM members WHERE name = '陈墨'"),
      db.prepare("INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_name, feedback, submitted_at) SELECT id, 5, 6, '评审中', '2026-07', '能力管理员', '复用记录已核验，待检查脱敏清单。', '2026-07-10 10:30:00' FROM members WHERE name = '王璐'"),
      db.prepare("INSERT INTO reviews (member_id, from_level, target_level, state, cycle, reviewer_name, feedback, submitted_at) SELECT id, 7, 8, '待补证', '2026-07', '能力管理员', '缺少应用稳定运行满月的数据。', '2026-07-09 14:10:00' FROM members WHERE name = '赵凯'"),
    ]);
  }

  const evidenceCount = await db.prepare("SELECT COUNT(*) AS count FROM evidences").first<{ count: number }>();
  if (!evidenceCount?.count) {
    await db.batch([
      db.prepare("INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, created_by_email) SELECT id, 6, 'asset', '能源巡检报告 Skill 入库记录', '仓库', 'https://github.com/example/energy-skill', '8 人复用，已用于 2 家客户交流', '已核验', 'seed@local' FROM members WHERE name = '林晓'"),
      db.prepare("INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, created_by_email) SELECT id, 7, 'poc', 'MES 测试环境集成 POC', '报告', '', '已跑通工单查询与异常归因', '待核验', 'seed@local' FROM members WHERE name = '陈墨'"),
      db.prepare("INSERT INTO evidences (member_id, level, criterion_key, title, kind, url, outcome, status, created_by_email) SELECT id, 9, 'original', '制造业智能体评测方法论', '仓库', 'https://github.com/example/ai-eval', '支撑 2 个客户选型讨论', '待核验', 'seed@local' FROM members WHERE name = '唐峰'"),
    ]);
  }

  const taskCount = await db.prepare("SELECT COUNT(*) AS count FROM growth_tasks").first<{ count: number }>();
  if (!taskCount?.count) {
    await db.batch([
      db.prepare("INSERT INTO growth_tasks (member_id, title, due_date, status, linked_level, linked_anchor) SELECT id, next_task, '2026-07-26', '进行中', target_level, industry FROM members WHERE name IN ('林晓','陈墨','周宁','王璐','唐峰')"),
      db.prepare("INSERT INTO growth_tasks (member_id, title, due_date, status, linked_level, linked_anchor) SELECT id, next_task, '2026-07-10', '逾期', target_level, industry FROM members WHERE name = '赵凯'"),
    ]);
  }

  await db.batch([
    db.prepare("UPDATE members SET status = '进行中' WHERE status = '待举证'"),
    db.prepare(`
      UPDATE members SET review_status = COALESCE((
        SELECT r.state FROM reviews r
        WHERE r.member_id = members.id AND r.state IN ('已提交','评审中','待补证')
        ORDER BY r.id DESC LIMIT 1
      ), review_status)
    `),
  ]);

  const systemReviewer = await db.prepare("SELECT email FROM workspace_users WHERE role IN ('reviewer','admin') ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1").first<{ email: string }>();
  if (systemReviewer) {
    const reviewer = await db.prepare("SELECT display_name AS displayName FROM workspace_users WHERE email = ?").bind(systemReviewer.email).first<{ displayName: string }>();
    await db.prepare("UPDATE reviews SET reviewer_email = ?, reviewer_name = ? WHERE reviewer_email = ''")
      .bind(systemReviewer.email, reviewer?.displayName || "主评人").run();
  }
}

export async function ensureWorkspaceUser(user: ChatGPTUser) {
  const db = env.DB;
  const existing = await db.prepare(`
    SELECT email, display_name AS displayName, role, member_id AS memberId
    FROM workspace_users WHERE email = ?
  `).bind(user.email).first<{ email: string; displayName: string; role: "member" | "reviewer" | "admin"; memberId: number }>();
  if (existing) return existing;

  const userCount = await db.prepare("SELECT COUNT(*) AS count FROM workspace_users").first<{ count: number }>();
  const role = userCount?.count ? "member" : "admin";
  const memberResult = await db.prepare(`
    INSERT INTO members (
      user_email, name, role, industry, group_name, current_level, self_level, target_level,
      target_date, status, review_status, gap, plan, next_task
    ) VALUES (?, ?, ?, '未分配', '综合组', 1, 1, 3, '2026-09-30', '进行中', '草稿', '待完成首次自评', '完成个人能力定位并添加第一条证据', '完成首次能力定位')
  `).bind(user.email, user.displayName, role === "admin" ? "能力管理员" : "团队成员").run();
  const memberId = Number(memberResult.meta.last_row_id);
  await db.prepare("INSERT INTO workspace_users (email, display_name, role, member_id) VALUES (?, ?, ?, ?)")
    .bind(user.email, user.displayName, role, memberId).run();
  await logAction(user.email, "创建身份档案", "member", memberId, `role=${role}`);
  return { email: user.email, displayName: user.displayName, role, memberId } as const;
}

export async function logAction(actorEmail: string, action: string, entityType: string, entityId: number, detail = "") {
  await env.DB.prepare(`
    INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, detail)
    VALUES (?, ?, ?, ?, ?)
  `).bind(actorEmail, action, entityType, entityId, detail).run();
}

export function db() {
  return env.DB;
}
