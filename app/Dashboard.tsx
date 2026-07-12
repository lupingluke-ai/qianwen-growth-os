"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, ExternalLink,
  LayoutDashboard, Library, Map, Search, Sparkles, Target, Users, X,
} from "lucide-react";

type Member = {
  id: number; name: string; role: string; industry: string; currentLevel: number;
  targetLevel: number; targetDate: string; status: string; gap: string; plan: string;
  evidence: string; nextTask: string; updatedAt: string;
};

type Level = {
  level: number; title: string; role: string; stage: string; definition: string;
  standard: string; abilities: string[]; practices: string[]; path: string;
  resources: { label: string; url: string }[];
};

type IndustryAnchor = { name: string; tone: string; items: string[] };
type Stage = { label: string; range: string; color: string; copy: string };

type Props = { levels: Level[]; industryAnchors: IndustryAnchor[]; stageMeta: Stage[] };

function initials(name: string) { return name.slice(-2); }

export default function Dashboard({ levels, industryAnchors, stageMeta }: Props) {
  const [activeView, setActiveView] = useState("overview");
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<IndustryAnchor | null>(null);
  const [focusedLevel, setFocusedLevel] = useState<Level>(levels[4]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("全部行业");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const stageColor = (stage: string) => stageMeta.find(item => item.label === stage)?.color || "#0071e3";

  useEffect(() => { void fetchMembers(); }, []);

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

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/members", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
      });
      if (!response.ok) throw new Error();
      await fetchMembers();
      setEditing(null);
      setToast("爬坡卡已更新");
    } catch { setToast("保存失败，请稍后重试"); }
    finally { setSaving(false); setTimeout(() => setToast(""), 2600); }
  }

  const average = members.length ? members.reduce((sum, member) => sum + member.currentLevel, 0) / members.length : 0;
  const atRisk = members.filter(member => member.status === "有风险").length;
  const l3Rate = members.length ? Math.round(members.filter(member => member.currentLevel >= 3).length / members.length * 100) : 0;
  const needAttention = members.filter(member => member.status === "有风险" || member.status === "待举证");
  const filtered = useMemo(() => members.filter(member =>
    (industry === "全部行业" || member.industry === industry) && `${member.name}${member.role}`.includes(query)
  ), [members, industry, query]);

  const navItems = [
    { id: "overview", label: "总览", icon: LayoutDashboard },
    { id: "capability", label: "能力地图", icon: Map },
    { id: "members", label: "成员", icon: Users },
    { id: "resources", label: "资源", icon: Library },
  ];

  return <main className="app-shell apple-shell">
    <header className="app-header">
      <button className="brand" onClick={() => setActiveView("overview")} aria-label="回到总览">
        <span className="brand-mark">千</span><span>千问计划</span>
      </button>
      <nav className="main-nav" aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} className={activeView === id ? "active" : ""} onClick={() => setActiveView(id)}>
          <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
        </button>)}
      </nav>
      <div className="header-actions">
        <span className="sync-state"><i />已同步</span>
        <button className="pill-button" onClick={() => members[0] && setEditing(members[0])}>更新我的状态</button>
        <span className="user-avatar">管</span>
      </div>
    </header>

    <section className="workspace">
      {activeView === "overview" && <div className="view overview-view">
        <div className="view-heading compact-heading">
          <div><span className="overline">QIANWEN GROWTH OS</span><h1>让能力，持续发生。</h1><p>每一次真实业务实践，都成为下一次进阶的证据。</p></div>
          <button className="text-action" onClick={() => setActiveView("capability")}>查看完整能力体系 <ChevronRight size={17} /></button>
        </div>

        <div className="overview-grid">
          <section className="hero-stage">
            <div className="stage-head"><span>团队平均能力</span><span>目标 L6</span></div>
            <div className="level-display"><strong>L{average.toFixed(1)}</strong><small>当前处于「会建 AI」阶段</small></div>
            <div className="growth-rail" aria-label="十级能力进度">
              {levels.map(level => <button key={level.level} className={average >= level.level ? "reached" : ""} onClick={() => setSelectedLevel(level)} aria-label={`查看 L${level.level}`}><span>{level.level}</span></button>)}
            </div>
            <div className="stage-labels">{stageMeta.map(stage => <span key={stage.label}><b>{stage.label}</b><small>{stage.range}</small></span>)}</div>
            <div className="hero-stage-actions"><button onClick={() => setActiveView("capability")}>查看能力地图 <ArrowRight size={16} /></button><button onClick={() => members[0] && setEditing(members[0])}>更新爬坡卡</button></div>
          </section>

          <aside className="review-panel">
            <div className="panel-title"><div><span className="overline">MONTHLY REVIEW</span><h2>本月 Review</h2></div><span className="date-chip">7月30日</span></div>
            <div className="review-score"><strong>{Math.max(0, members.length - needAttention.length)}</strong><span>/ {members.length || 8} 已就绪</span></div>
            <div className="review-progress"><i style={{ width: `${members.length ? (members.length - needAttention.length) / members.length * 100 : 0}%` }} /></div>
            <div className="attention-list">
              {needAttention.slice(0, 3).map(member => <button key={member.id} onClick={() => setEditing(member)}><span className={`avatar industry-${member.industry}`}>{initials(member.name)}</span><span><b>{member.name}</b><small>{member.status} · {member.nextTask}</small></span><ChevronRight size={16} /></button>)}
              {!needAttention.length && <div className="all-clear"><Check size={18} />所有成员已准备就绪</div>}
            </div>
            <button className="review-link" onClick={() => setActiveView("members")}>查看全部成员 <ArrowRight size={15} /></button>
          </aside>
        </div>

        <div className="overview-footer">
          <div className="metric"><span>团队成员</span><strong>{members.length || "—"}</strong><small>人已建档</small></div>
          <div className="metric"><span>L3 达成率</span><strong>{l3Rate}%</strong><small>首月目标</small></div>
          <div className="metric"><span>风险关注</span><strong>{atRisk}</strong><small>需本月跟进</small></div>
          <div className="next-move"><Target size={19} /><span><small>下一个团队里程碑</small><b>第 5 个月 · 平均达到 L6</b></span><button onClick={() => setActiveView("members")}>推进计划 <ChevronRight size={15} /></button></div>
        </div>
      </div>}

      {activeView === "capability" && <div className="view capability-view">
        <div className="view-heading">
          <div><span className="overline">CAPABILITY MAP</span><h1>十级能力地图</h1><p>从会用到会赢。选择任一级，查看通关标准与成长路径。</p></div>
          <div className="stage-legend">{stageMeta.map(stage => <span key={stage.label}><i style={{ background: stage.color }} />{stage.label}</span>)}</div>
        </div>
        <div className="capability-canvas">
          <div className="level-selector">{levels.map(level => <button key={level.level} className={focusedLevel.level === level.level ? "active" : ""} style={{ "--accent": stageColor(level.stage) } as CSSProperties} onClick={() => setFocusedLevel(level)}><small>L{level.level}</small><b>{level.title}</b><span>{level.stage}</span></button>)}</div>
          <div className="level-detail-stage" style={{ "--accent": stageColor(focusedLevel.stage) } as CSSProperties}>
            <div className="level-number"><span>LEVEL</span><strong>{String(focusedLevel.level).padStart(2, "0")}</strong></div>
            <div className="level-summary"><span className="stage-chip">{focusedLevel.stage}</span><h2>{focusedLevel.title}</h2><p>{focusedLevel.role}</p><blockquote>{focusedLevel.definition}</blockquote><div className="pass-standard"><small>通关标准</small><b>{focusedLevel.standard}</b></div><button className="primary-button" onClick={() => setSelectedLevel(focusedLevel)}>查看完整详情 <ArrowRight size={16} /></button></div>
            <div className="ability-preview"><h3>核心能力</h3>{focusedLevel.abilities.map(item => <div key={item}><Check size={15} /><span>{item}</span></div>)}</div>
          </div>
        </div>
      </div>}

      {activeView === "members" && <div className="view members-view">
        <div className="view-heading member-title-row">
          <div><span className="overline">TEAM PROGRESS</span><h1>成员进度</h1><p>关注真实行动、业务举证和下一步任务。</p></div>
          <button className="primary-button" onClick={() => members[0] && setEditing(members[0])}>更新我的爬坡卡 <ArrowRight size={16} /></button>
        </div>
        <div className="member-toolbar"><label><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名或岗位" /></label><div>{["全部行业", "高校", "新质", "能源", "政务"].map(name => <button key={name} className={industry === name ? "active" : ""} onClick={() => setIndustry(name)}>{name}</button>)}</div></div>
        <div className="member-table">
          <div className="member-head"><span>成员</span><span>当前 / 目标</span><span>成长轨迹</span><span>状态</span><span>下一步任务</span><span /></div>
          <div className="member-scroll">{loading ? <div className="empty">正在载入团队进度…</div> : filtered.map(member => <button className="member-row" key={member.id} onClick={() => setEditing(member)}>
            <span className="person"><i className={`avatar industry-${member.industry}`}>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.role} · {member.industry}</small></span></span>
            <span className="level-pair"><b>L{member.currentLevel}</b><ArrowRight size={13} /><em>L{member.targetLevel}</em></span>
            <span className="member-progress"><i><b style={{ width: `${member.currentLevel / 10 * 100}%` }} /><mark style={{ left: `${member.targetLevel / 10 * 100}%` }} /></i><small>更新于 {member.updatedAt?.slice(5, 10) || "—"}</small></span>
            <span className={`status status-${member.status}`}>{member.status}</span>
            <span className="next-task">{member.nextTask || "待补充"}</span><ChevronRight size={16} />
          </button>)}{!loading && !filtered.length && <div className="empty">没有符合条件的成员</div>}</div>
        </div>
      </div>}

      {activeView === "resources" && <div className="view resources-view">
        <div className="view-heading"><div><span className="overline">KNOWLEDGE TO ASSET</span><h1>资源与行业实践</h1><p>让个人经验成为可复用、可验证、合规的团队资产。</p></div></div>
        <div className="resource-layout">
          <section className="asset-stage"><Sparkles size={24} /><h2>把个人提效，<br />沉淀为组织资产。</h2><p>Skill、知识库模板、评测集、原型代码与行业实践统一入库。</p><div className="asset-process">{["作者脱敏", "提交 PR", "L6+ 审核", "合并发布"].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div><button onClick={() => { setToast("团队资产库地址待管理员配置"); setTimeout(() => setToast(""), 2600); }}>进入团队资产库 <ExternalLink size={15} /></button></section>
          <section className="industry-stage"><div className="panel-title"><div><span className="overline">INDUSTRY ANCHORS</span><h2>四大行业实战锚点</h2></div><BookOpen size={21} /></div><div className="industry-grid">{industryAnchors.map(anchor => <button key={anchor.name} onClick={() => setSelectedAnchor(anchor)}><span>{anchor.name}</span><b>{anchor.items[0]}</b><small>{anchor.items.length} 个关键任务</small><ChevronRight size={16} /></button>)}</div></section>
          <aside className="compliance-stage"><CircleAlert size={20} /><span>合规红线</span><h2>拿不准的，<br />一律只发内网。</h2><ul><li>客户与人名匿名化</li><li>真实数据替换为样例</li><li>密钥与内网地址剥离</li><li>敏感行业负责人审核</li></ul></aside>
        </div>
      </div>}
    </section>

    {selectedLevel && <div className="overlay" onMouseDown={event => event.target === event.currentTarget && setSelectedLevel(null)}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`L${selectedLevel.level} ${selectedLevel.title}详情`}>
        <button className="close" onClick={() => setSelectedLevel(null)} aria-label="关闭"><X size={20} /></button>
        <div className="drawer-hero" style={{ "--accent": stageColor(selectedLevel.stage) } as CSSProperties}><span>{selectedLevel.stage}</span><strong>L{selectedLevel.level}</strong><h2>{selectedLevel.title}</h2><p>{selectedLevel.role}</p></div>
        <div className="drawer-body"><p className="definition">{selectedLevel.definition}</p><div className="pass-box"><small>一句话通关标准</small><b>{selectedLevel.standard}</b></div>
          <h3>核心能力</h3><ul className="check-list">{selectedLevel.abilities.map(item => <li key={item}>{item}</li>)}</ul>
          <h3>业务实践</h3><div className="practice-list">{selectedLevel.practices.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</div>)}</div>
          <h3>自我提升路径</h3><p className="path-copy">{selectedLevel.path}</p>
          {!!selectedLevel.resources.length && <><h3>学习资源</h3><div className="resource-list">{selectedLevel.resources.map(resource => <a key={resource.label} href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />{resource.label}<small>官方资源</small></a>)}</div></>}
        </div>
      </aside>
    </div>}

    {selectedAnchor && <div className="overlay" onMouseDown={event => event.target === event.currentTarget && setSelectedAnchor(null)}>
      <aside className="drawer anchor-drawer" role="dialog" aria-modal="true" aria-label={`${selectedAnchor.name}行业实战锚点`}>
        <button className="close" onClick={() => setSelectedAnchor(null)} aria-label="关闭"><X size={20} /></button>
        <div className="drawer-hero"><span>INDUSTRY ANCHORS</span><strong>{selectedAnchor.name}</strong><h2>行业实战锚点</h2><p>能力实践优先绑定真实客户场景。</p></div>
        <div className="drawer-body"><p className="definition">每一个锚点任务都应能回答“这对打单有什么用”，并在月度 Review 中用真实产出举证。</p><h3>关键任务</h3><div className="anchor-task-list">{selectedAnchor.items.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b><ChevronRight size={16} /></div>)}</div><div className="pass-box"><small>更新机制</small><b>行业线负责人每季度更新锚点任务，并与当期重点商机对齐。</b></div></div>
      </aside>
    </div>}

    {editing && <div className="overlay form-overlay" onMouseDown={event => event.target === event.currentTarget && setEditing(null)}>
      <form className="edit-modal" onSubmit={saveMember}>
        <button type="button" className="close" onClick={() => setEditing(null)} aria-label="关闭"><X size={20} /></button>
        <span className="overline">PERSONAL GROWTH CARD</span><h2>更新 {editing.name} 的爬坡卡</h2><p>记录真实进展，月度 Review 时用产出与业务效果举证。</p>
        <div className="form-grid"><label>当前层级<select value={editing.currentLevel} onChange={event => setEditing({ ...editing, currentLevel: Number(event.target.value) })}>{levels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>目标层级<select value={editing.targetLevel} onChange={event => setEditing({ ...editing, targetLevel: Number(event.target.value) })}>{levels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>达成时间<input type="date" value={editing.targetDate} onChange={event => setEditing({ ...editing, targetDate: event.target.value })} /></label><label>当前状态<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}>{["正常", "进行中", "待举证", "有风险"].map(status => <option key={status}>{status}</option>)}</select></label></div>
        <label>当前差距项<textarea rows={2} value={editing.gap} onChange={event => setEditing({ ...editing, gap: event.target.value })} placeholder="对照目标层级，描述还缺什么" /></label>
        <label>本月自我提升计划<textarea rows={2} value={editing.plan} onChange={event => setEditing({ ...editing, plan: event.target.value })} placeholder="本月要完成的具体行动" /></label>
        <label>举证材料链接<input value={editing.evidence} onChange={event => setEditing({ ...editing, evidence: event.target.value })} placeholder="https://..." /></label>
        <label>下月行业锚点任务<input value={editing.nextTask} onChange={event => setEditing({ ...editing, nextTask: event.target.value })} placeholder="与重点商机对齐的实战任务" /></label>
        <div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>取消</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存爬坡卡"}</button></div>
      </form>
    </div>}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}
