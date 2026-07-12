"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Dashboard from "./Dashboard";

type Member = {
  id: number; name: string; role: string; industry: string; currentLevel: number;
  targetLevel: number; targetDate: string; status: string; gap: string; plan: string;
  evidence: string; nextTask: string; updatedAt: string;
};

type Level = {
  level: number; title: string; role: string; stage: string; definition: string;
  standard: string; abilities: string[]; practices: string[]; path: string; resources: { label: string; url: string }[];
};

const levels: Level[] = [
  { level: 1, title: "开口会问", role: "AI 对话者", stage: "会用 AI", definition: "能与主流 C 端智能体有效对话，在严肃工作场景中获得可用输出，并了解 Qwen 模型家族。", standard: "完成 3 类真实工作任务", abilities: ["结构化提示词四要素", "追问、拆解与模型自查", "Qwen 家族选型", "理解幻觉、上下文与 Token"], practices: ["会议纪要待办提取", "竞品资料速读", "周报初稿生成"], path: "连续 1 周每天用 AI 处理真实工作，同题对比提示词迭代前后的效果。", resources: [{ label: "Qwen 官方文档", url: "https://qwen.readthedocs.io/zh-cn/latest/" }, { label: "提示工程指南", url: "https://www.promptingguide.ai/zh" }] },
  { level: 2, title: "问以致用", role: "智能体操作者", stage: "会用 AI", definition: "熟练使用千问办公等通用智能体，掌握工作空间、定时任务和 Skill 基础。", standard: "2 个每周使用 ≥2 次的常态化应用", abilities: ["工作空间与文件管理", "配置定时任务", "调用与组合 Skill", "理解智能体与 Chat 的区别"], practices: ["客户拜访前情报汇总", "标书条款提取", "POC 报告整理"], path: "盘点每周重复工作，亲手搭建 2 个任务或 Skill 工作流并持续运行 2 周。", resources: [{ label: "钉钉开放平台", url: "https://open.dingtalk.com/document/" }] },
  { level: 3, title: "对客答问", role: "客户面前的演示者", stage: "会用 AI", definition: "能独立向客户汇报千问办公，针对客户需求编写 Skill，并在现场完成演示。", standard: "使用 ≥100 小时 + 客户现场演示 + 定制 Skill", abilities: ["产品价值与报价逻辑", "Skill 需求拆解与调试", "现场演示抗压能力", "故障预案与兜底话术"], practices: ["真实客户现场演示", "客户需求定制 Skill", "产品汇报试讲"], path: "把日常工作迁移到千问办公；复刻团队 Skill 后再独立编写 3 个。", resources: [{ label: "Qwen-Agent", url: "https://github.com/QwenLM/Qwen-Agent" }] },
  { level: 4, title: "博问众长", role: "顶尖工具驾驭者", stage: "会建 AI", definition: "使用顶尖桌面智能体和模型形成一手体感，能部署 GitHub 优质项目并接入 dws。", standard: "部署 3 个项目（必含 dws）+ 1 份真实体验总结", abilities: ["顶尖模型真实对比", "Git 与 GitHub 基础", "开源项目部署排障", "dws 接入智能体"], practices: ["dws 办公自动化实践", "3 个行业相关开源项目", "模型真实场景对比报告"], path: "用真实任务同题多模型对比；每周部署 1 个 GitHub 项目，三周积累 3 个。", resources: [{ label: "Pro Git 中文版", url: "https://git-scm.com/book/zh/v2" }, { label: "dws 仓库", url: "https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli" }] },
  { level: 5, title: "问需而造", role: "售前原型开发者", stage: "会建 AI", definition: "具备 AI Coding 能力，能独立开发客户场景高保真原型，并形成精准竞品观点。", standard: "2 个原型进入售前 + 1 个精准竞品观点", abilities: ["AI Coding 全流程", "通用智能体架构", "竞品分析方法", "1–3 天产出交互 Demo"], practices: ["真实售前原型", "客户明确正反馈", "证据支撑的竞品分析"], path: "连续 4 周每周复刻 1 个客户场景 Demo，并主动认领商机原型。", resources: [{ label: "Building Effective Agents", url: "https://www.anthropic.com/research/building-effective-agents" }, { label: "MCP 官网", url: "https://modelcontextprotocol.io/" }] },
  { level: 6, title: "问一知十", role: "资产沉淀与提效者", stage: "会建 AI", definition: "把个人经验建成知识库与 Skill，量化提效并沉淀为可横向复用的组织资产。", standard: "团队复用 ≥6 人 / 客户 ≥2 家 / 治理试点 ≥1 家", abilities: ["知识资产化", "Before / After 量化", "文档化与低成本复用", "客户知识治理"], practices: ["发布团队公共仓库", "邀请同事试用迭代", "完成知识治理全流程"], path: "盘点 3 项高频工作逐个资产化，记录提效数据，打磨到他人拿来即用。", resources: [{ label: "阿里云百炼知识库", url: "https://help.aliyun.com/zh/model-studio/" }, { label: "LlamaIndex", url: "https://docs.llamaindex.ai/" }] },
  { level: 7, title: "问诊寻因", role: "架构诊断与集成专家", stage: "会解 AI", definition: "能基于 trace 定位并解决智能体问题，通过 Skill / MCP 连接客户业务系统。", standard: "集成 POC ≥1 + 一线问题 ≥3", abilities: ["智能体 trace 分析", "MCP / API 集成", "鉴权与安全边界", "AI 信息雷达"], practices: ["客户测试环境 POC", "诊断案例库", "最新 AI 成果客户交流"], path: "主动认领 trace 问题，积累诊断案例；在本地先完成 1 次系统对接。", resources: [{ label: "MCP 协议规范", url: "https://modelcontextprotocol.io/specification" }, { label: "钉钉 API", url: "https://open.dingtalk.com/document/" }] },
  { level: 8, title: "寻根问底", role: "评测与全栈交付专家", stage: "会解 AI", definition: "能开展智能体与模型评测支撑打单，给出后训练建议，并上线真实应用。", standard: "2 个商机评测 + 1 份后训练建议 + 应用满月", abilities: ["定制评测工程", "全生命周期开发", "技术选型支撑", "后训练咨询"], practices: ["复现公开评测", "客户场景评测集", "真实应用稳定运行满月"], path: "复现 1 个公开评测，再结合商机设计小规模定制评测集，完成应用毕业项目。", resources: [{ label: "OpenCompass", url: "https://github.com/open-compass/opencompass" }, { label: "Hugging Face 课程", url: "https://huggingface.co/learn" }] },
  { level: 9, title: "业界来问", role: "行业影响力构建者", stage: "会解 AI", definition: "在 AI 细分领域具备头部认知或实践能力，对外分享并获得广泛认可。", standard: "团队 90% 使用 / GitHub 100+ Star / 平台 1000+ 赞", abilities: ["细分领域头部实践", "原创内容生产", "外部影响力运营", "客户高层突破"], practices: ["持续迭代开源项目", "固定节奏对外输出", "以行业专家身份参与项目"], path: "选择有一手实践的细分方向持续深耕，用真实数据反馈迭代内容与工具。", resources: [{ label: "GitHub", url: "https://github.com/" }] },
  { level: 10, title: "问以致胜", role: "AI 商业价值领航者", stage: "会赢 AI", definition: "用 AI 加较少资源解决行业挑战性问题，改变成本或价值结构并形成商业价值。", standard: "AI ARR ≥1000 万 + 明确复制窗口", abilities: ["行业挑战问题定义", "AI 杠杆解法", "商业价值闭环", "规模化复制"], practices: ["沉淀可复制方法论", "识别 ≥3 个同类客户", "显著降低复制边际成本"], path: "在真实商机中打出来：首单跑通后即刻沉淀方法论并开启同类客户复制。", resources: [] },
];

const industryAnchors = [
  { name: "高校", tone: "blue", items: ["L3 · AI 助研 / 智慧教务演示", "L5 · 科研文献分析原型", "L6 · 高校标书模板库", "L7 · 对接教务系统"] },
  { name: "新质", tone: "violet", items: ["L3 · 研发提效演示", "L5 · 工艺知识问答原型", "L6 · 芯片术语知识库", "L7 · 对接 PLM / MES"] },
  { name: "能源", tone: "orange", items: ["L3 · 巡检报告 / 规程问答", "L5 · 生产日报原型", "L6 · 安全合规知识库", "L7 · 对接调度 / EAM"] },
  { name: "政务", tone: "green", items: ["L3 · 公文辅助 / 政策问答", "L5 · 12345 工单分派", "L6 · 信创适配经验库", "L7 · 对接政务 OA"] },
];

const stageMeta = [
  { label: "会用 AI", range: "L1–L3", color: "#3977f6", copy: "人人过线" },
  { label: "会建 AI", range: "L4–L6", color: "#7c5ce5", copy: "生产资产" },
  { label: "会解 AI", range: "L7–L9", color: "#e17a37", copy: "专家纵深" },
  { label: "会赢 AI", range: "L10", color: "#159b76", copy: "商业杠杆" },
];

function stageColor(stage: string) { return stageMeta.find((item) => item.label === stage)?.color || "#3977f6"; }
function initials(name: string) { return name.slice(-2); }

function LegacyHome() {
  const [activeNav, setActiveNav] = useState("总览");
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("全部行业");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { fetchMembers(); }, []);
  async function fetchMembers() {
    setLoading(true);
    try {
      const response = await fetch("/api/members");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMembers(data.members || []);
    } catch { setToast("成员数据暂时不可用，请稍后重试"); }
    finally { setLoading(false); }
  }

  const average = members.length ? members.reduce((sum, m) => sum + m.currentLevel, 0) / members.length : 0;
  const filtered = useMemo(() => members.filter((m) => (industry === "全部行业" || m.industry === industry) && `${m.name}${m.role}`.includes(query)), [members, industry, query]);
  const atRisk = members.filter((m) => m.status === "有风险").length;

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/members", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      if (!response.ok) throw new Error();
      await fetchMembers(); setEditing(null); setToast("爬坡卡已更新");
    } catch { setToast("保存失败，请稍后重试"); }
    finally { setSaving(false); setTimeout(() => setToast(""), 2600); }
  }

  function navigate(label: string) {
    setActiveNav(label);
    const id = label === "总览" ? "overview" : label === "能力阶梯" ? "ladder" : label === "成员进度" ? "members" : "assets";
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("总览")} aria-label="回到总览">
          <span className="brand-mark">千</span><span><b>千问计划</b><small>AI 能力爬坡体系</small></span>
        </button>
        <nav aria-label="主导航">
          {[['总览','⌂'],['能力阶梯','↗'],['成员进度','◎'],['资产与资源','◇']].map(([label, icon]) => (
            <button key={label} className={activeNav === label ? "active" : ""} onClick={() => navigate(label)}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="sidebar-goal">
          <span className="eyebrow">团队目标</span>
          <strong>7 个月</strong>
          <p>每条行业线涌现 L7+ 种子</p>
          <div className="mini-progress"><i style={{ width: `${Math.min(100, average / 7 * 100)}%` }} /></div>
          <small>当前平均 L{average.toFixed(1)}</small>
        </div>
        <div className="sidebar-foot"><span className="avatar">管</span><span><b>能力管理员</b><small>本月 Review · 07/30</small></span></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="breadcrumb">人才发展 <span>/</span> 千问计划</div>
          <div className="top-actions"><span className="sync-dot" />数据已同步 <button onClick={() => members[0] && setEditing(members[0])}>更新我的状态</button></div>
        </header>

        <div className="page-wrap">
          <section id="overview" className="hero section-anchor">
            <div className="hero-copy">
              <span className="kicker">QIANWEN GROWTH OS · 2026</span>
              <h1>从开口会问，<br />到<span>问以致胜。</span></h1>
              <p>一套面向新质、能源、政务与高校团队的 AI 能力十级爬坡体系。用真实业务举证，用持续复用成长。</p>
              <div className="hero-actions"><button className="primary" onClick={() => navigate("能力阶梯")}>探索十级体系 <span>→</span></button><button className="secondary" onClick={() => navigate("成员进度")}>查看团队进度</button></div>
            </div>
            <div className="hero-orbit" aria-label="四阶段能力路径">
              <div className="orbit-grid" />
              <div className="orbit-card orbit-main"><small>当前团队</small><b>L{average.toFixed(1)}</b><span>平均能力</span></div>
              <div className="orbit-card orbit-a"><i style={{ background: '#3977f6' }} />L1–L3<br /><b>会用 AI</b></div>
              <div className="orbit-card orbit-b"><i style={{ background: '#7c5ce5' }} />L4–L6<br /><b>会建 AI</b></div>
              <div className="orbit-card orbit-c"><i style={{ background: '#e17a37' }} />L7–L9<br /><b>会解 AI</b></div>
              <div className="orbit-card orbit-d"><i style={{ background: '#159b76' }} />L10<br /><b>会赢 AI</b></div>
            </div>
          </section>

          <section className="metric-strip" aria-label="团队关键指标">
            <div><small>团队成员</small><strong>{members.length || '—'}</strong><span>人已建档</span></div>
            <div><small>平均层级</small><strong>L{average.toFixed(1)}</strong><span className="positive">目标 L6</span></div>
            <div><small>L3 达成率</small><strong>{members.length ? Math.round(members.filter(m => m.currentLevel >= 3).length / members.length * 100) : 0}%</strong><span>首月目标</span></div>
            <div><small>风险关注</small><strong>{atRisk}</strong><span className={atRisk ? "warning" : "positive"}>需本月跟进</span></div>
          </section>

          <section id="ladder" className="section-block section-anchor">
            <div className="section-head"><div><span className="eyebrow">CAPABILITY LADDER</span><h2>十级能力阶梯</h2><p>四段递进，点击任一级查看通关标准、核心能力与学习资源。</p></div><div className="legend">{stageMeta.map(s => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div></div>
            <div className="ladder-grid">
              {levels.map((item) => <button key={item.level} className="level-card" style={{ '--accent': stageColor(item.stage) } as React.CSSProperties} onClick={() => setSelectedLevel(item)}>
                <div className="level-top"><span>L{item.level}</span><small>{item.stage}</small></div><h3>{item.title}</h3><p>{item.role}</p><div className="level-standard">{item.standard}</div><span className="card-link">查看详情 →</span>
              </button>)}
            </div>
          </section>

          <section className="stage-map">
            <div className="stage-map-title"><span>成长路径</span><p>从工具使用到商业价值，每一段都有清晰产出。</p></div>
            {stageMeta.map((stage, i) => <div key={stage.label} className="stage-node"><span style={{ borderColor: stage.color, color: stage.color }}>{i + 1}</span><div><small>{stage.range}</small><b>{stage.label}</b><p>{stage.copy}</p></div></div>)}
          </section>

          <section id="members" className="section-block section-anchor">
            <div className="section-head"><div><span className="eyebrow">TEAM PROGRESS</span><h2>成员爬坡进度</h2><p>以个人爬坡卡为中心，持续记录目标、差距、计划与举证。</p></div><button className="outline-btn" onClick={() => members[0] && setEditing(members[0])}>+ 更新我的爬坡卡</button></div>
            <div className="team-panel">
              <div className="team-toolbar"><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索姓名或岗位" /></label><div className="filters">{['全部行业','高校','新质','能源','政务'].map(name => <button key={name} className={industry === name ? 'active' : ''} onClick={() => setIndustry(name)}>{name}</button>)}</div></div>
              <div className="member-head"><span>成员</span><span>当前 / 目标</span><span>爬坡进度</span><span>状态</span><span>下一步任务</span><span /></div>
              <div className="member-list">
                {loading ? <div className="empty">正在载入团队进度…</div> : filtered.map(member => <div className="member-row" key={member.id}>
                  <div className="person"><span className={`avatar industry-${member.industry}`}>{initials(member.name)}</span><div><b>{member.name}</b><small>{member.role} · {member.industry}</small></div></div>
                  <div className="level-pair"><b>L{member.currentLevel}</b><span>→</span><em>L{member.targetLevel}</em></div>
                  <div className="member-progress"><div><i style={{ width: `${member.currentLevel / 10 * 100}%` }} /><mark style={{ left: `${member.targetLevel / 10 * 100}%` }} /></div><small>更新于 {member.updatedAt?.slice(5,10) || '—'}</small></div>
                  <span className={`status status-${member.status}`}>{member.status}</span>
                  <p className="next-task">{member.nextTask || '待补充'}</p>
                  <button className="edit-btn" onClick={() => setEditing(member)}>编辑</button>
                </div>)}
                {!loading && !filtered.length && <div className="empty">没有符合筛选条件的成员</div>}
              </div>
            </div>
          </section>

          <section className="section-block">
            <div className="section-head"><div><span className="eyebrow">INDUSTRY ANCHORS</span><h2>四大行业实战锚点</h2><p>能力实践优先绑定真实客户场景，让每一级都回答“这对打单有什么用”。</p></div></div>
            <div className="anchor-grid">{industryAnchors.map(anchor => <article className={`anchor-card ${anchor.tone}`} key={anchor.name}><div className="anchor-icon">{anchor.name.slice(0,1)}</div><h3>{anchor.name}</h3><ul>{anchor.items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
          </section>

          <section id="assets" className="section-block section-anchor asset-section">
            <div className="asset-copy"><span className="eyebrow">KNOWLEDGE TO ASSET</span><h2>把个人提效，沉淀为组织资产</h2><p>Skill、知识库模板、评测集、原型代码与行业实践统一入库。L6 及以上复用类举证，以团队公共仓库记录为准。</p><div className="asset-flow"><span>作者自查脱敏</span><i>→</i><span>提交 PR</span><i>→</i><span>L6+ 审核</span><i>→</i><span>合并发布</span></div></div>
            <div className="compliance"><span>合规红线</span><h3>拿不准的，一律只发内网。</h3><ul><li>客户名称与人名匿名化</li><li>真实数据替换为构造样例</li><li>密钥、Token 与内网地址剥离</li><li>敏感行业须负责人审核</li></ul></div>
          </section>

          <footer><span>千问计划 · AI 能力十级爬坡体系</span><span>自我提升 · 月度 Review · 业务举证</span></footer>
        </div>
      </section>

      {selectedLevel && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSelectedLevel(null)}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={`L${selectedLevel.level} ${selectedLevel.title}详情`}>
          <button className="close" onClick={() => setSelectedLevel(null)}>×</button>
          <div className="drawer-hero" style={{ '--accent': stageColor(selectedLevel.stage) } as React.CSSProperties}><span>{selectedLevel.stage}</span><strong>L{selectedLevel.level}</strong><h2>{selectedLevel.title}</h2><p>{selectedLevel.role}</p></div>
          <div className="drawer-body"><p className="definition">{selectedLevel.definition}</p><div className="pass-box"><small>一句话通关标准</small><b>{selectedLevel.standard}</b></div>
            <h3>核心能力</h3><ul className="check-list">{selectedLevel.abilities.map(item => <li key={item}>{item}</li>)}</ul>
            <h3>业务实践</h3><div className="practice-list">{selectedLevel.practices.map((item,i) => <div key={item}><span>{String(i+1).padStart(2,'0')}</span>{item}</div>)}</div>
            <h3>自我提升路径</h3><p className="path-copy">{selectedLevel.path}</p>
            {!!selectedLevel.resources.length && <><h3>学习资源</h3><div className="resource-list">{selectedLevel.resources.map(r => <a key={r.label} href={r.url} target="_blank" rel="noreferrer"><span>↗</span>{r.label}<small>官方资源</small></a>)}</div></>}
          </div>
        </aside>
      </div>}

      {editing && <div className="overlay form-overlay" onMouseDown={e => e.target === e.currentTarget && setEditing(null)}>
        <form className="edit-modal" onSubmit={saveMember}>
          <button type="button" className="close" onClick={() => setEditing(null)}>×</button>
          <span className="eyebrow">PERSONAL GROWTH CARD</span><h2>更新 {editing.name} 的爬坡卡</h2><p>记录真实进展，月度 Review 时用产出与业务效果举证。</p>
          <div className="form-grid"><label>当前层级<select value={editing.currentLevel} onChange={e => setEditing({...editing,currentLevel:Number(e.target.value)})}>{levels.map(l => <option key={l.level} value={l.level}>L{l.level} · {l.title}</option>)}</select></label><label>目标层级<select value={editing.targetLevel} onChange={e => setEditing({...editing,targetLevel:Number(e.target.value)})}>{levels.map(l => <option key={l.level} value={l.level}>L{l.level} · {l.title}</option>)}</select></label><label>达成时间<input type="date" value={editing.targetDate} onChange={e => setEditing({...editing,targetDate:e.target.value})} /></label><label>当前状态<select value={editing.status} onChange={e => setEditing({...editing,status:e.target.value})}>{['正常','进行中','待举证','有风险'].map(s => <option key={s}>{s}</option>)}</select></label></div>
          <label>当前差距项<textarea rows={2} value={editing.gap} onChange={e => setEditing({...editing,gap:e.target.value})} placeholder="对照目标层级，描述还缺什么" /></label><label>本月自我提升计划<textarea rows={2} value={editing.plan} onChange={e => setEditing({...editing,plan:e.target.value})} placeholder="本月要完成的具体行动" /></label><label>举证材料链接<input value={editing.evidence} onChange={e => setEditing({...editing,evidence:e.target.value})} placeholder="https://..." /></label><label>下月行业锚点任务<input value={editing.nextTask} onChange={e => setEditing({...editing,nextTask:e.target.value})} placeholder="与重点商机对齐的实战任务" /></label>
          <div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>取消</button><button className="primary" disabled={saving}>{saving ? '保存中…' : '保存爬坡卡'}</button></div>
        </form>
      </div>}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

export default function Home() {
  return <Dashboard levels={levels} industryAnchors={industryAnchors} stageMeta={stageMeta} />;
}
