import { env } from "cloudflare:workers";

type MemberPayload = {
  id?: number;
  currentLevel?: number;
  targetLevel?: number;
  targetDate?: string;
  status?: string;
  gap?: string;
  plan?: string;
  evidence?: string;
  nextTask?: string;
};

const seedMembers = [
  ["林晓", "行业解决方案经理", "能源", 4, 6, "进行中", "补齐可复用资产与量化提效数据", "完成巡检报告 Skill，邀请 6 位同事试用", "https://github.com/example/energy-skill", "能源安全合规知识库"],
  ["陈墨", "售前架构师", "新质", 6, 7, "待举证", "需要完成客户测试环境集成 POC", "打通 MES 测试接口并沉淀 trace 案例", "", "对接 PLM/MES 测试环境"],
  ["周宁", "客户经理", "高校", 3, 5, "进行中", "AI Coding 原型经验不足", "两周内完成招生咨询智能体原型", "", "科研文献分析原型"],
  ["王璐", "解决方案专家", "政务", 5, 6, "正常", "复用人数尚未达标", "将政策比对 Skill 发布至团队仓库", "https://github.com/example/policy-skill", "等保合规话术库"],
  ["赵凯", "技术顾问", "能源", 7, 8, "有风险", "缺少完整评测与上线应用", "为两个重点商机设计定制评测集", "", "生产调度系统集成"],
  ["苏雨", "客户成功", "高校", 2, 3, "进行中", "千问办公使用时长与现场演示不足", "每日迁移 2 项工作，主动申请客户演示", "", "智慧教务场景演示"],
  ["方晨", "产品运营", "政务", 4, 5, "正常", "售前原型尚未进入真实商机", "认领 12345 工单分派原型", "", "12345 工单智能分派"],
  ["唐峰", "行业总监", "新质", 8, 9, "待举证", "外部影响力数据未达标", "持续运营开源项目并完成客户高层分享", "https://github.com/example/ai-eval", "芯片行业评测方法论"],
];

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      industry TEXT NOT NULL,
      current_level INTEGER NOT NULL DEFAULT 1,
      target_level INTEGER NOT NULL DEFAULT 3,
      target_date TEXT NOT NULL DEFAULT '2026-09-30',
      status TEXT NOT NULL DEFAULT '进行中',
      gap TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      next_task TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS members_industry_idx ON members (industry)"),
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>();
  if (!count?.count) {
    await db.batch(seedMembers.map((member) => db.prepare(`
      INSERT INTO members (name, role, industry, current_level, target_level, status, gap, plan, evidence, next_task)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...member)));
  }
}

export async function GET() {
  try {
    await ensureDatabase();
    const result = await env.DB.prepare(`
      SELECT id, name, role, industry,
        current_level AS currentLevel, target_level AS targetLevel,
        target_date AS targetDate, status, gap, plan, evidence,
        next_task AS nextTask, updated_at AS updatedAt
      FROM members ORDER BY current_level DESC, name ASC
    `).all();
    return Response.json({ members: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取成员数据失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as MemberPayload;
    if (!payload.id) return Response.json({ error: "缺少成员 ID" }, { status: 400 });
    const currentLevel = Math.max(1, Math.min(10, Number(payload.currentLevel) || 1));
    const targetLevel = Math.max(currentLevel, Math.min(10, Number(payload.targetLevel) || currentLevel));
    await env.DB.prepare(`
      UPDATE members SET current_level = ?, target_level = ?, target_date = ?, status = ?,
        gap = ?, plan = ?, evidence = ?, next_task = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      currentLevel, targetLevel, payload.targetDate || "2026-09-30", payload.status || "进行中",
      payload.gap || "", payload.plan || "", payload.evidence || "", payload.nextTask || "", payload.id
    ).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新失败" }, { status: 500 });
  }
}
