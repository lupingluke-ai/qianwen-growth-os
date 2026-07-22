"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FolderKanban,
  Gauge,
  History,
  Library,
  LockKeyhole,
  Map,
  Menu,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import type {
  AssetRecord,
  IndustryAnchor,
  LevelDefinition,
  ManagedWorkspaceUser,
  Review,
  StageMeta,
  WorkspaceMember,
  WorkspacePayload,
} from "./types";

type Props = { levels: LevelDefinition[]; industryAnchors: IndustryAnchor[]; stageMeta: StageMeta[] };
type ViewId = "growth" | "capability" | "review" | "team";
type TeamTab = "members" | "assets";
type ReviewScope = "mine" | "assigned" | "all";

type CheckinDraft = {
  memberId: number; selfLevel: number; targetLevel: number; targetDate: string;
  progressStatus: string; gap: string; plan: string; nextTask: string;
};

type EvidenceDraft = {
  memberId: number; level: number; criterionKey: string; title: string; kind: string;
  url: string; outcome: string; nominateAsset: boolean; complianceConfirmed: boolean;
};

type AssetDraft = {
  memberId: number; title: string; assetType: string; industry: string; url: string; complianceConfirmed: boolean;
};

const SIGN_IN_URL = "/signin-with-chatgpt?return_to=%2F";

function initials(name: string) { return name.trim().slice(-2) || "千"; }
function formatDate(value: string) {
  if (!value) return "—";
  const date = value.slice(0, 10).replaceAll("-", ".");
  return date.startsWith("2026.") ? date.slice(5) : date;
}
function stageForLevel(level: number, stages: StageMeta[]) {
  if (level <= 3) return stages[0];
  if (level <= 6) return stages[1];
  if (level <= 9) return stages[2];
  return stages[3];
}
function toneClass(value: string) { return `tone-${value.replaceAll(" ", "-")}`; }

function DialogFrame({ title, onClose, children, size = "normal" }: { title: string; onClose: () => void; children: ReactNode; size?: "normal" | "wide" | "drawer" }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div ref={dialogRef} className={`dialog-card dialog-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="icon-button dialog-close" type="button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
      {children}
    </div>
  </div>;
}

function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><p>{copy}</p>{action}</div>;
}

export default function Dashboard({ levels: fallbackLevels, industryAnchors, stageMeta }: Props) {
  const [activeView, setActiveView] = useState<ViewId>("growth");
  const [teamTab, setTeamTab] = useState<TeamTab>("members");
  const [reviewScope, setReviewScope] = useState<ReviewScope>("mine");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedLevelNumber, setFocusedLevelNumber] = useState(4);
  const [levelGuide, setLevelGuide] = useState<LevelDefinition | null>(null);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<IndustryAnchor | null>(null);
  const [checkinDraft, setCheckinDraft] = useState<CheckinDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [reviewSubmitOpen, setReviewSubmitOpen] = useState(false);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewDecision, setReviewDecision] = useState("已通过");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamGroup, setTeamGroup] = useState("全部");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetType, setAssetType] = useState("全部");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<"framework" | "access">("framework");
  const [frameworkLevelDraft, setFrameworkLevelDraft] = useState<LevelDefinition | null>(null);
  const [frameworkNote, setFrameworkNote] = useState("");

  const activeLevels = workspace?.levels?.length === 10 ? workspace.levels : fallbackLevels;
  const focusedLevel = activeLevels.find(level => level.level === focusedLevelNumber) || activeLevels[0];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  const applyWorkspace = useCallback((data: WorkspacePayload) => {
    setWorkspace(data);
    if (data.myMember) setFocusedLevelNumber(data.myMember.targetLevel);
    if ((data.me?.role === "reviewer" || data.me?.role === "admin") && data.reviews.some(review => review.reviewerEmail === data.me?.email)) setReviewScope("assigned");
  }, []);

  const loadWorkspace = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    const data = await response.json() as WorkspacePayload & { error?: string };
    if (!response.ok) throw new Error(data.error || "读取工作区失败");
    applyWorkspace(data);
  }, [applyWorkspace]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as WorkspacePayload & { error?: string };
        if (!response.ok) throw new Error(data.error || "读取工作区失败");
        return data;
      })
      .then(data => { if (!cancelled) applyWorkspace(data); })
      .catch(error => { if (!cancelled) setToast(error instanceof Error ? error.message : "工作区暂时不可用"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyWorkspace]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失败");
      await loadWorkspace();
      showToast(success);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally { setBusy(false); }
  }

  function openCheckin(member = workspace?.myMember || null) {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    if (!member) return;
    setCheckinDraft({ memberId: member.id, selfLevel: member.selfLevel, targetLevel: member.targetLevel, targetDate: member.targetDate, progressStatus: member.progressStatus, gap: member.gap, plan: member.plan, nextTask: member.nextTask });
  }

  function openEvidence(member = workspace?.myMember || null, level = member?.targetLevel || focusedLevel.level) {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    if (!member) return;
    const definition = activeLevels.find(item => item.level === level) || focusedLevel;
    setEvidenceDraft({ memberId: member.id, level, criterionKey: definition.criteria[0]?.id || "", title: "", kind: "链接", url: "", outcome: "", nominateAsset: false, complianceConfirmed: false });
  }

  function openAsset() {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    const member = workspace.myMember;
    if (!member) return;
    setAssetDraft({ memberId: member.id, title: "", assetType: "Skill", industry: member.industry === "未分配" ? "通用" : member.industry, url: "", complianceConfirmed: false });
  }

  function openAdmin() {
    if (!workspace?.framework) return;
    const editable = workspace.framework.draft?.levels || workspace.framework.published.levels;
    setFrameworkLevelDraft(structuredClone(editable[0]));
    setFrameworkNote(workspace.framework.draft?.changeNote || "");
    setAdminOpen(true);
  }

  const myMember = workspace?.myMember;
  const myEvidence = useMemo(() => workspace?.evidences.filter(item => item.memberId === myMember?.id) || [], [myMember?.id, workspace?.evidences]);
  const selectedLevelEvidence = useMemo(() => myEvidence.filter(item => item.level === focusedLevel.level), [focusedLevel.level, myEvidence]);
  const targetLevel = activeLevels.find(level => level.level === (myMember?.targetLevel || 6)) || activeLevels[5];
  const targetEvidence = myEvidence.filter(item => item.level === targetLevel.level);
  const latestFeedback = workspace?.reviews.find(review => review.memberId === myMember?.id && review.feedback)?.feedback || "提交后由主评人给出具体反馈";
  const canReview = workspace?.me?.role === "admin" || workspace?.me?.role === "reviewer";
  const canDecideSelected = Boolean(selectedReview && (workspace?.me?.role === "admin" || selectedReview.reviewerEmail === workspace?.me?.email));
  const currentStage = stageForLevel(myMember?.currentLevel || workspace?.metrics.median || 1, stageMeta);

  const groups = useMemo(() => ["全部", ...Array.from(new Set((workspace?.members || []).map(member => member.groupName)))], [workspace?.members]);
  const filteredMembers = useMemo(() => (workspace?.members || []).filter(member => {
    const matchesGroup = teamGroup === "全部" || member.groupName === teamGroup;
    const matchesQuery = `${member.name}${member.role}${member.nextTask}${member.groupName}`.toLowerCase().includes(teamQuery.toLowerCase());
    return matchesGroup && matchesQuery;
  }).toSorted((a, b) => b.overdueTasks - a.overdueTasks || b.currentLevel - a.currentLevel), [teamGroup, teamQuery, workspace?.members]);
  const filteredAssets = useMemo(() => (workspace?.assets || []).filter(asset => {
    const matchesType = assetType === "全部" || asset.type === assetType;
    return matchesType && `${asset.title}${asset.industry}${asset.ownerName}`.toLowerCase().includes(assetQuery.toLowerCase());
  }), [assetQuery, assetType, workspace?.assets]);
  const visibleReviews = useMemo(() => {
    const reviews = workspace?.reviews || [];
    if (reviewScope === "assigned") return reviews.filter(review => review.reviewerEmail === workspace?.me?.email);
    if (reviewScope === "mine") return reviews.filter(review => review.memberId === workspace?.me?.memberId);
    return reviews;
  }, [reviewScope, workspace?.me, workspace?.reviews]);

  const navItems = [
    { id: "growth" as const, label: "我的成长", icon: Target },
    { id: "capability" as const, label: "能力阶梯", icon: Map },
    { id: "review" as const, label: "评审中心", icon: ClipboardCheck },
    { id: "team" as const, label: "团队", icon: Users },
  ];

  return <main className="control-shell">
    <header className="control-header">
      <button className="brand-button" onClick={() => setActiveView("growth")} aria-label="回到我的成长"><span className="brand-mark">千</span><span>千问计划</span></button>
      <button className="mobile-menu" aria-label="打开导航" onClick={() => setMobileNavOpen(open => !open)}><Menu size={20} /></button>
      <nav className={`control-nav ${mobileNavOpen ? "is-open" : ""}`} aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setMobileNavOpen(false); }}><Icon size={17} /><span>{label}</span></button>)}
      </nav>
      <div className="account-area">
        {workspace?.me?.role === "admin" ? <button className="icon-button settings-button" type="button" onClick={openAdmin} aria-label="管理设置"><Settings2 size={19} /></button> : null}
        {workspace?.authenticated ? <>
          <button className="header-action" onClick={() => openCheckin()}>继续更新</button>
          <a className="account-chip" href="/signout-with-chatgpt?return_to=%2F" title="退出登录"><span>{initials(workspace.me?.displayName || "千")}</span><span><b>{workspace.me?.displayName}</b><small>{workspace.me?.role === "admin" ? "管理员" : workspace.me?.role === "reviewer" ? "成员 · 评审人" : "成员"}</small></span></a>
        </> : <a className="header-action" href={SIGN_IN_URL}>登录后更新</a>}
      </div>
    </header>

    <section className="control-workspace">
      {loading && !workspace ? <div className="loading-screen"><span /><p>正在整理成长数据…</p></div> : null}

      {activeView === "growth" && workspace ? <section className="workspace-view growth-view">
        <div className="page-heading compact-heading">
          <div><span className="eyebrow">PERSONAL GROWTH</span><h1>{workspace.authenticated ? `${workspace.me?.displayName}，专注下一次升级。` : "让每一次成长，都有清晰的下一步。"}</h1><p>{workspace.authenticated ? "这里只保留与你本月目标直接相关的信息。" : "十级能力标准、真实证据与轻量评审，帮助团队把 AI 能力落到工作结果。"}</p></div>
          {workspace.authenticated ? <button className="primary-action" onClick={() => openCheckin()}>更新本周进展 <ArrowRight size={17} /></button> : <a className="primary-action" href={SIGN_IN_URL}><LockKeyhole size={16} /> 进入个人工作区</a>}
        </div>

        <div className="growth-focus-grid">
          <section className="growth-hero-panel">
            <div className="growth-hero-top"><span>{myMember ? "当前认证" : "团队中位层级"}</span><em>{currentStage.label}</em></div>
            <div className="growth-level-lockup"><strong>L{myMember?.currentLevel || workspace.metrics.median}</strong><div><small>下一目标</small><b>L{myMember?.targetLevel || 6} · {targetLevel.title}</b><span>{myMember ? `计划 ${formatDate(myMember.targetDate)} 前完成` : "从真实工作结果开始"}</span></div></div>
            <div className="growth-progress" aria-label="十级成长进度">
              {activeLevels.map(level => <button key={level.level} className={`${(myMember?.currentLevel || workspace.metrics.median) >= level.level ? "reached" : ""} ${myMember?.targetLevel === level.level ? "target" : ""}`} onClick={() => { setFocusedLevelNumber(level.level); setActiveView("capability"); }} aria-label={`查看 L${level.level} ${level.title}`}><i /><span>L{level.level}</span></button>)}
            </div>
            <div className="growth-hero-footer"><span><small>证据</small><b>{myMember ? `${targetEvidence.length} / ${targetLevel.criteria.length}` : `${workspace.metrics.evidenceCompletion}%`}</b></span><span><small>评审状态</small><b>{myMember?.reviewStatus || `${workspace.metrics.pendingReviews} 项进行中`}</b></span><button onClick={() => { setFocusedLevelNumber(targetLevel.level); setActiveView("capability"); }}>查看目标标准 <ChevronRight size={16} /></button></div>
          </section>

          <aside className="next-action-card">
            <div className="panel-heading"><div><span className="eyebrow">NEXT ACTION</span><h2>本周只推进这一件事</h2></div><span className={myMember?.overdueTasks ? "risk-dot" : "ok-dot"} /></div>
            <h3>{myMember?.nextTask || "完成首次能力定位，并添加一条真实工作证据"}</h3>
            <p>{myMember?.plan || "选择一个正在推进的工作场景，用结果而不是学习时长证明能力。"}</p>
            <div className="action-meta"><span><Clock3 size={16} />{formatDate(myMember?.targetDate || "2026-09-30")}</span><span><Gauge size={16} />{myMember?.progressStatus || "进行中"}</span></div>
            {workspace.authenticated ? <button className="secondary-action full" onClick={() => openEvidence()}>添加证据 <Plus size={16} /></button> : null}
          </aside>
        </div>

        <div className="growth-detail-grid">
          <section className="target-criteria-card">
            <div className="panel-heading"><div><h2>L{targetLevel.level} 通关清单</h2><p>达成后即可选择主评人提交</p></div><b>{targetEvidence.length}/{targetLevel.criteria.length}</b></div>
            <div className="criteria-checklist">{targetLevel.criteria.map((criterion, index) => { const evidence = targetEvidence.find(item => item.criterionKey === criterion.id); return <button key={criterion.id} onClick={() => openEvidence(myMember, targetLevel.level)}><span className={evidence ? "done" : ""}>{evidence ? <Check size={15} /> : index + 1}</span><span><b>{criterion.label}</b><small>{evidence?.title || criterion.evidenceHint}</small></span><em>{evidence ? evidence.status : "待举证"}</em></button>; })}</div>
          </section>
          <aside className="feedback-card"><UserRoundCheck size={21} /><span className="eyebrow">LATEST FEEDBACK</span><h2>最近反馈</h2><p>{latestFeedback}</p><button className="text-button" onClick={() => setActiveView("review")}>查看评审记录 <ChevronRight size={15} /></button></aside>
        </div>
      </section> : null}

      {activeView === "capability" && workspace ? <section className="workspace-view capability-view">
        <div className="page-heading"><div><span className="eyebrow">CAPABILITY LADDER</span><h1>十级能力阶梯</h1><p>从“会用 AI”到“会赢 AI”，点击任一级下钻查看标准、详情与资源。</p></div><div className="framework-badge"><BadgeCheck size={16} /><span><small>当前版本</small><b>{workspace.framework.published.versionName}</b></span></div></div>
        <div className="stage-legend">{stageMeta.map(stage => <span key={stage.label}><i style={{ background: stage.color }} />{stage.label}<small>{stage.range}</small></span>)}</div>
        <div className="ladder-map" aria-label="十级能力阶梯">
          {activeLevels.map(level => <button key={level.level} className={`${focusedLevel.level === level.level ? "active" : ""} ${myMember?.currentLevel === level.level ? "current" : ""} ${myMember?.targetLevel === level.level ? "target" : ""}`} style={{ "--step": level.level, "--stage": stageForLevel(level.level, stageMeta).color } as CSSProperties} onClick={() => setFocusedLevelNumber(level.level)}><span>L{level.level}</span><b>{level.title}</b><small>{level.stage}</small>{myMember?.currentLevel === level.level ? <em>当前</em> : myMember?.targetLevel === level.level ? <em>目标</em> : null}</button>)}
        </div>
        <div className="capability-detail" style={{ "--stage": stageForLevel(focusedLevel.level, stageMeta).color } as CSSProperties}>
          <div className="capability-title"><span>{focusedLevel.stage} · {focusedLevel.role}</span><strong>L{focusedLevel.level}</strong><h2>{focusedLevel.title}</h2><p>{focusedLevel.definition}</p><div className="standard-callout"><small>认证标准</small><b>{focusedLevel.standard}</b></div><div className="capability-actions"><button className="primary-action" onClick={() => openEvidence(myMember, focusedLevel.level)}>添加证据 <Plus size={16} /></button><button className="secondary-action" onClick={() => setLevelGuide(focusedLevel)}>查看完整指南</button></div></div>
          <div className="criteria-panel"><div className="panel-heading"><div><h3>通关标准</h3><p>{selectedLevelEvidence.length} 条个人证据已关联</p></div></div>{focusedLevel.criteria.map((criterion, index) => { const evidence = selectedLevelEvidence.find(item => item.criterionKey === criterion.id); return <div className="criterion-row" key={criterion.id}><span className={evidence ? "done" : ""}>{evidence ? <Check size={15} /> : index + 1}</span><div><b>{criterion.label}</b><small>{evidence?.title || criterion.evidenceHint}</small></div><em>{evidence ? evidence.status : "待举证"}</em></div>; })}</div>
          <aside className="resource-preview"><BookOpen size={21} /><h3>实践与资源</h3><ul>{focusedLevel.practices.slice(0, 3).map(item => <li key={item}><Check size={14} />{item}</li>)}</ul>{focusedLevel.resources.slice(0, 2).map(resource => <a key={resource.label} href={resource.url} target="_blank" rel="noreferrer">{resource.label}<ExternalLink size={14} /></a>)}</aside>
        </div>
      </section> : null}

      {activeView === "review" && workspace ? <section className="workspace-view review-view">
        <div className="page-heading"><div><span className="eyebrow">REVIEW CENTER</span><h1>评审中心</h1><p>申请人自选一位主评人，用材料完成轻量、可追溯的晋级评审。</p></div>{myMember && !myMember.pendingReviewId ? <button className="primary-action" onClick={() => { setReviewerEmail(""); setReviewSubmitOpen(true); }}>提交晋级申请 <ArrowRight size={17} /></button> : null}</div>
        <div className="review-scope-tabs" role="tablist">
          <button className={reviewScope === "mine" ? "active" : ""} onClick={() => setReviewScope("mine")}>我的申请</button>
          {canReview ? <button className={reviewScope === "assigned" ? "active" : ""} onClick={() => setReviewScope("assigned")}>我的待评 <em>{workspace.reviews.filter(review => review.reviewerEmail === workspace.me?.email && ["已提交", "评审中", "待补证"].includes(review.state)).length}</em></button> : null}
          {workspace.me?.role === "admin" ? <button className={reviewScope === "all" ? "active" : ""} onClick={() => setReviewScope("all")}>全部评审</button> : null}
        </div>
        <section className="review-board">
          <div className="review-board-head"><span>申请人与目标</span><span>材料</span><span>状态</span><span>主评人</span><span>提交时间</span><span /></div>
          <div className="review-board-body">{visibleReviews.map(review => <button className="review-row" key={review.id} onClick={() => { setSelectedReview(review); setReviewFeedback(review.feedback || ""); setReviewDecision(review.state === "待补证" ? "待补证" : "已通过"); }}><span className="person-cell"><i className="member-avatar">{initials(review.memberName)}</i><span><b>{review.memberName}</b><small>L{review.fromLevel} → L{review.targetLevel}</small></span></span><span><b>{review.evidenceCount}</b><small>条证据</small></span><span><em className={`state-label ${toneClass(review.state)}`}>{review.state}</em></span><span>{review.reviewerName}</span><span>{formatDate(review.submittedAt)}</span><ChevronRight size={16} /></button>)}{!visibleReviews.length ? <EmptyState icon={<ClipboardCheck size={26} />} title={workspace.authenticated ? "这里还没有记录" : "登录后查看评审记录"} copy={reviewScope === "assigned" ? "当前没有分配给你的评审。" : "添加目标层级证据后，即可发起第一次晋级申请。"} action={!workspace.authenticated ? <a className="primary-action" href={SIGN_IN_URL}>登录查看</a> : undefined} /> : null}</div>
        </section>
        <div className="review-principles"><span><ShieldCheck size={19} /><b>认证层级不可自改</b><small>只有“已通过”的评审才更新认证层级</small></span><span><Clock3 size={19} /><b>建议 3 天内完成</b><small>材料不完整可一次性退回补证</small></span><span><UserRoundCheck size={19} /><b>一位主评人负责到底</b><small>30 人团队无需复杂联合评审</small></span></div>
      </section> : null}

      {activeView === "team" && workspace ? <section className="workspace-view team-view">
        <div className="page-heading"><div><span className="eyebrow">TEAM WORKSPACE</span><h1>团队</h1><p>一层小组、成员状态与可复用成果，足够支撑 30 人团队持续推进。</p></div><div className="heading-metrics"><span><b>{workspace.metrics.memberCount}</b><small>成员</small></span><span><b>{workspace.metrics.atRisk}</b><small>需关注</small></span><span><b>{workspace.assets.filter(item => item.reviewStatus === "已发布").length}</b><small>成果</small></span></div></div>
        <div className="section-tabs"><button className={teamTab === "members" ? "active" : ""} onClick={() => setTeamTab("members")}><Users size={17} />成员概览</button><button className={teamTab === "assets" ? "active" : ""} onClick={() => setTeamTab("assets")}><Library size={17} />成果库</button></div>
        {teamTab === "members" ? <>
          <div className="team-toolbar"><label className="search-field"><Search size={17} /><input value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="搜索成员、岗位或任务" /></label><div className="segmented-filter">{groups.map(item => <button key={item} className={teamGroup === item ? "active" : ""} onClick={() => setTeamGroup(item)}>{item}</button>)}</div></div>
          <section className="team-table-panel"><div className="team-table-head"><span>成员</span><span>认证 / 自评 / 目标</span><span>证据</span><span>评审</span><span>本周下一步</span><span>状态</span><span /></div><div className="team-table-body">{filteredMembers.map(member => <button className="team-row" key={member.id} onClick={() => setSelectedMember(member)}><span className="person-cell"><i className={`member-avatar industry-${member.industry}`}>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.role} · {member.groupName}</small></span></span><span className="level-triplet"><b>L{member.currentLevel}</b><i>L{member.selfLevel}</i><em>L{member.targetLevel}</em></span><span><b>{member.evidenceCount}</b><small>条材料</small></span><span><em className={`state-label ${toneClass(member.reviewStatus)}`}>{member.reviewStatus}</em></span><span className="next-cell">{member.nextTask || "待补充"}</span><span>{member.overdueTasks ? <em className="risk-label">逾期 {member.overdueTasks}</em> : <em className={`state-label ${toneClass(member.progressStatus)}`}>{member.progressStatus}</em>}</span><ChevronRight size={16} /></button>)}{!filteredMembers.length ? <EmptyState icon={<Users size={26} />} title="没有符合条件的成员" copy="调整搜索或小组筛选后重试。" /> : null}</div></section>
        </> : <>
          <div className="asset-summary"><span><b>{workspace.assets.length}</b><small>团队成果</small></span><span><b>{workspace.assets.filter(item => item.reviewStatus === "待审核").length}</b><small>待审核</small></span><span><b>{workspace.assets.reduce((sum, item) => sum + item.reusePeople, 0)}</b><small>内部复用人次</small></span><button className="primary-action" onClick={openAsset}>提交成果 <Plus size={16} /></button></div>
          <div className="asset-toolbar"><label className="search-field"><Search size={17} /><input value={assetQuery} onChange={event => setAssetQuery(event.target.value)} placeholder="搜索成果、行业或作者" /></label><div className="segmented-filter">{["全部", "Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <button key={item} className={assetType === item ? "active" : ""} onClick={() => setAssetType(item)}>{item}</button>)}</div></div>
          <div className="assets-grid"><section className="asset-library-panel"><div className="asset-list">{filteredAssets.map(asset => <AssetRow key={asset.id} asset={asset} isAdmin={workspace.me?.role === "admin"} onReview={decision => mutate({ action: "review_asset", assetId: asset.id, decision }, `成果已更新为“${decision}”`)} busy={busy} />)}{!filteredAssets.length ? <EmptyState icon={<Library size={26} />} title="没有符合条件的成果" copy="调整搜索或类型筛选后重试。" /> : null}</div></section><aside className="anchor-panel"><div className="panel-heading"><div><h2>行业实战锚点</h2><p>成果从真实业务任务中沉淀</p></div><BookOpen size={20} /></div>{industryAnchors.map(anchor => <button key={anchor.name} onClick={() => setSelectedAnchor(anchor)}><span><b>{anchor.name}</b><small>{anchor.items.length} 项锚点任务</small></span><ChevronRight size={16} /></button>)}</aside></div>
        </>}
      </section> : null}
    </section>

    {checkinDraft ? <DialogFrame title="更新成长进展" onClose={() => setCheckinDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "update_checkin", ...checkinDraft }, "本周进展已更新"); if (ok) setCheckinDraft(null); }}><div className="dialog-heading"><span>PERSONAL CHECK-IN</span><h2>更新本周成长进展</h2><p>认证层级由评审确认；这里记录自评、目标、行动和阻塞。</p></div><div className="certified-banner"><BadgeCheck size={20} /><span><small>当前认证层级</small><b>L{workspace?.members.find(item => item.id === checkinDraft.memberId)?.currentLevel || 1} · 不可直接修改</b></span></div><div className="form-grid"><label>自评层级<select value={checkinDraft.selfLevel} onChange={event => setCheckinDraft({ ...checkinDraft, selfLevel: Number(event.target.value) })}>{activeLevels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>目标层级<select value={checkinDraft.targetLevel} onChange={event => setCheckinDraft({ ...checkinDraft, targetLevel: Number(event.target.value) })}>{activeLevels.filter(level => level.level >= checkinDraft.selfLevel).map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>目标日期<input type="date" value={checkinDraft.targetDate} onChange={event => setCheckinDraft({ ...checkinDraft, targetDate: event.target.value })} /></label><label>推进状态<select value={checkinDraft.progressStatus} onChange={event => setCheckinDraft({ ...checkinDraft, progressStatus: event.target.value })}>{["正常", "进行中", "有风险", "阻塞"].map(status => <option key={status}>{status}</option>)}</select></label></div><label>当前差距<textarea rows={3} value={checkinDraft.gap} onChange={event => setCheckinDraft({ ...checkinDraft, gap: event.target.value })} placeholder="对照目标层级，描述还缺少什么" /></label><label>本月行动计划<textarea rows={3} value={checkinDraft.plan} onChange={event => setCheckinDraft({ ...checkinDraft, plan: event.target.value })} placeholder="写清楚具体动作、截止时间与业务场景" /></label><label>下一步任务<input value={checkinDraft.nextTask} onChange={event => setCheckinDraft({ ...checkinDraft, nextTask: event.target.value })} placeholder="本周最重要的一件事" /></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setCheckinDraft(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存本周更新"}</button></div></form></DialogFrame> : null}

    {evidenceDraft ? <DialogFrame title="添加晋级证据" onClose={() => setEvidenceDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "add_evidence", ...evidenceDraft }, evidenceDraft.nominateAsset ? "证据已添加，并推荐到团队成果库" : "证据已添加，等待评审核验"); if (ok) setEvidenceDraft(null); }}><div className="dialog-heading"><span>EVIDENCE</span><h2>添加 L{evidenceDraft.level} 晋级证据</h2><p>一条证据对应一项通关标准；优秀成果可直接推荐到团队成果库。</p></div><div className="form-grid"><label>目标层级<select value={evidenceDraft.level} onChange={event => { const level = Number(event.target.value); const definition = activeLevels.find(item => item.level === level)!; setEvidenceDraft({ ...evidenceDraft, level, criterionKey: definition.criteria[0]?.id || "" }); }}>{activeLevels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>证据类型<select value={evidenceDraft.kind} onChange={event => setEvidenceDraft({ ...evidenceDraft, kind: event.target.value })}>{["链接", "报告", "仓库", "演示", "使用记录", "客户反馈"].map(kind => <option key={kind}>{kind}</option>)}</select></label></div><label>关联通关标准<select value={evidenceDraft.criterionKey} onChange={event => setEvidenceDraft({ ...evidenceDraft, criterionKey: event.target.value })}>{activeLevels.find(item => item.level === evidenceDraft.level)?.criteria.map(criterion => <option key={criterion.id} value={criterion.id}>{criterion.label}</option>)}</select></label><label>证据标题<input required value={evidenceDraft.title} onChange={event => setEvidenceDraft({ ...evidenceDraft, title: event.target.value })} placeholder="例如：MES 测试环境集成 POC 复盘" /></label><label>材料链接<input type="url" value={evidenceDraft.url} onChange={event => setEvidenceDraft({ ...evidenceDraft, url: event.target.value })} placeholder="https://…（可选）" /></label><label>业务结果<textarea required rows={4} value={evidenceDraft.outcome} onChange={event => setEvidenceDraft({ ...evidenceDraft, outcome: event.target.value })} placeholder="说明客户反馈、复用人数、提效数据或商机推进结果" /></label><label className="switch-row"><input type="checkbox" checked={evidenceDraft.nominateAsset} onChange={event => setEvidenceDraft({ ...evidenceDraft, nominateAsset: event.target.checked, complianceConfirmed: false })} /><span><b>推荐沉淀为团队成果</b><small>管理员审核发布后，团队可检索复用，并可作为 L6+ 资产证据。</small></span></label>{evidenceDraft.nominateAsset ? <label className="compliance-check"><input type="checkbox" checked={evidenceDraft.complianceConfirmed} onChange={event => setEvidenceDraft({ ...evidenceDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户、人名和真实数据已脱敏，密钥与内网地址已剥离。</small></span></label> : null}<div className="form-actions"><button type="button" className="secondary-action" onClick={() => setEvidenceDraft(null)}>取消</button><button className="primary-action" disabled={busy || (evidenceDraft.nominateAsset && !evidenceDraft.complianceConfirmed)}>{busy ? "保存中…" : "添加证据"}</button></div></form></DialogFrame> : null}

    {reviewSubmitOpen && myMember ? <DialogFrame title="选择主评人" onClose={() => setReviewSubmitOpen(false)} size="normal"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "submit_review", memberId: myMember.id, reviewerEmail }, "晋级申请已提交给主评人"); if (ok) setReviewSubmitOpen(false); }}><div className="dialog-heading"><span>PROMOTION REVIEW</span><h2>选择本次主评人</h2><p>主评人会核验你的 L{myMember.targetLevel} 证据并给出最终结论。</p></div><div className="reviewer-options">{workspace?.reviewers.filter(reviewer => reviewer.memberId !== myMember.id).map(reviewer => <label key={reviewer.email} className={reviewerEmail === reviewer.email ? "selected" : ""}><input type="radio" name="reviewer" value={reviewer.email} checked={reviewerEmail === reviewer.email} onChange={() => setReviewerEmail(reviewer.email)} /><span className="member-avatar">{initials(reviewer.displayName)}</span><span><b>{reviewer.displayName}</b><small>{reviewer.groupName} · {reviewer.role === "admin" ? "管理员" : "评审人"}</small></span><em>{reviewer.pendingCount} 项待评</em></label>)}</div>{!workspace?.reviewers.some(reviewer => reviewer.memberId !== myMember.id) ? <div className="readonly-notice"><CircleAlert size={18} /><span>目前没有可选主评人，请联系管理员先为一位成员开启评审权限。</span></div> : null}<div className="form-actions"><button type="button" className="secondary-action" onClick={() => setReviewSubmitOpen(false)}>取消</button><button className="primary-action" disabled={busy || !reviewerEmail}>{busy ? "提交中…" : "确认提交"}</button></div></form></DialogFrame> : null}

    {selectedReview ? <DialogFrame title={`${selectedReview.memberName} 的晋级评审`} onClose={() => setSelectedReview(null)} size="wide"><div className="dialog-form"><div className="dialog-heading"><span>REVIEW DECISION</span><h2>{selectedReview.memberName} · L{selectedReview.fromLevel} → L{selectedReview.targetLevel}</h2><p>{selectedReview.evidenceCount} 条材料 · 体系版本 #{selectedReview.frameworkVersionId || "历史"}</p></div><div className="review-detail-summary"><span><small>当前状态</small><b>{selectedReview.state}</b></span><span><small>主评人</small><b>{selectedReview.reviewerName}</b></span><span><small>提交时间</small><b>{formatDate(selectedReview.submittedAt)}</b></span></div>{selectedReview.feedback ? <div className="feedback-box"><UserRoundCheck size={19} /><div><small>已有反馈</small><p>{selectedReview.feedback}</p></div></div> : null}{canDecideSelected ? <><label>评审结论<select value={reviewDecision} onChange={event => setReviewDecision(event.target.value)}>{["已通过", "待补证", "未通过"].map(item => <option key={item}>{item}</option>)}</select></label><label>评审反馈<textarea rows={5} value={reviewFeedback} onChange={event => setReviewFeedback(event.target.value)} placeholder="写清判断依据、缺少材料和下一步建议" /></label><div className="form-actions"><button className="secondary-action" onClick={() => setSelectedReview(null)}>稍后处理</button><button className="primary-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "review_decision", reviewId: selectedReview.id, decision: reviewDecision, feedback: reviewFeedback }, `评审已更新为“${reviewDecision}”`); if (ok) setSelectedReview(null); }}>{busy ? "处理中…" : "确认评审结论"}</button></div></> : <div className="readonly-notice"><LockKeyhole size={18} /><span>该申请由 {selectedReview.reviewerName} 主评，你可以查看进度与反馈。</span></div>}</div></DialogFrame> : null}

    {selectedMember ? <DialogFrame title={`${selectedMember.name} 的成长档案`} onClose={() => setSelectedMember(null)} size="drawer"><div className="member-profile"><div className="profile-hero"><span className={`member-avatar large industry-${selectedMember.industry}`}>{initials(selectedMember.name)}</span><div><h2>{selectedMember.name}</h2><p>{selectedMember.role} · {selectedMember.groupName}</p></div></div><div className="profile-levels"><span><small>认证</small><b>L{selectedMember.currentLevel}</b></span><span><small>自评</small><b>L{selectedMember.selfLevel}</b></span><span><small>目标</small><b>L{selectedMember.targetLevel}</b></span></div><section><h3>当前差距</h3><p>{selectedMember.gap || "待补充"}</p></section><section><h3>本月计划</h3><p>{selectedMember.plan || "待补充"}</p></section><section><h3>下一步任务</h3><p>{selectedMember.nextTask || "待补充"}</p></section><div className="profile-facts"><span><FileCheck2 size={17} />{selectedMember.evidenceCount} 条证据</span><span><History size={17} />更新于 {formatDate(selectedMember.updatedAt)}</span><span><ClipboardCheck size={17} />{selectedMember.reviewStatus}</span></div>{workspace?.me?.role === "admin" ? <button className="secondary-action full" onClick={() => { setSelectedMember(null); openCheckin(selectedMember); }}>代维护进展</button> : null}</div></DialogFrame> : null}

    {assetDraft ? <DialogFrame title="提交团队成果" onClose={() => setAssetDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "create_asset", ...assetDraft }, "成果已提交审核"); if (ok) setAssetDraft(null); }}><div className="dialog-heading"><span>TEAM RESULT</span><h2>提交团队成果</h2><p>发布后的成果供团队检索复用，也能支撑 L6+ 的组织影响证据。</p></div><div className="form-grid"><label>成果类型<select value={assetDraft.assetType} onChange={event => setAssetDraft({ ...assetDraft, assetType: event.target.value })}>{["Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <option key={item}>{item}</option>)}</select></label><label>所属行业<select value={assetDraft.industry} onChange={event => setAssetDraft({ ...assetDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div><label>成果名称<input required value={assetDraft.title} onChange={event => setAssetDraft({ ...assetDraft, title: event.target.value })} placeholder="使用业务价值清晰的名称" /></label><label>仓库或材料链接<input type="url" value={assetDraft.url} onChange={event => setAssetDraft({ ...assetDraft, url: event.target.value })} placeholder="https://…（可选）" /></label><label className="compliance-check"><input type="checkbox" checked={assetDraft.complianceConfirmed} onChange={event => setAssetDraft({ ...assetDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户与人名已匿名化、真实数据已替换、密钥与内网地址已剥离。</small></span></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setAssetDraft(null)}>取消</button><button className="primary-action" disabled={busy || !assetDraft.complianceConfirmed}>{busy ? "提交中…" : "提交审核"}</button></div></form></DialogFrame> : null}

    {adminOpen && workspace?.me?.role === "admin" ? <DialogFrame title="管理设置" onClose={() => setAdminOpen(false)} size="drawer"><div className="admin-settings"><div className="admin-heading"><span>ADMIN SETTINGS</span><h2>管理设置</h2><p>只保留十级体系、成员权限与小组管理。</p></div><div className="admin-tabs"><button className={adminTab === "framework" ? "active" : ""} onClick={() => setAdminTab("framework")}>十级体系</button><button className={adminTab === "access" ? "active" : ""} onClick={() => setAdminTab("access")}>成员与评审人</button></div>{adminTab === "framework" ? <div className="framework-admin"><div className="framework-status"><span><small>线上版本</small><b>{workspace.framework.published.versionName} · 已发布</b></span><span><small>编辑版本</small><b>{workspace.framework.draft?.versionName || "保存后自动创建草稿"}</b></span></div><div className="level-admin-picker">{(workspace.framework.draft?.levels || workspace.framework.published.levels).map(level => <button key={level.level} className={frameworkLevelDraft?.level === level.level ? "active" : ""} onClick={() => setFrameworkLevelDraft(structuredClone(level))}>L{level.level}<span>{level.title}</span></button>)}</div>{frameworkLevelDraft ? <form className="admin-level-form" onSubmit={async event => { event.preventDefault(); const ok = await mutate({ action: "save_framework_level", frameworkLevel: frameworkLevelDraft, changeNote: frameworkNote }, `L${frameworkLevelDraft.level} 草稿已保存`); if (ok && workspace) setFrameworkLevelDraft(frameworkLevelDraft); }}><div className="form-grid"><label>层级名称<input value={frameworkLevelDraft.title} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, title: event.target.value })} /></label><label>能力角色<input value={frameworkLevelDraft.role} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, role: event.target.value })} /></label></div><label>所属阶段<select value={frameworkLevelDraft.stage} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, stage: event.target.value })}>{stageMeta.map(stage => <option key={stage.label}>{stage.label}</option>)}</select></label><label>能力定义<textarea rows={4} value={frameworkLevelDraft.definition} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, definition: event.target.value })} /></label><label>认证标准<textarea rows={3} value={frameworkLevelDraft.standard} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, standard: event.target.value })} /></label><label>核心能力（用顿号分隔）<textarea rows={3} value={frameworkLevelDraft.abilities.join("、")} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, abilities: event.target.value.split(/[、，,\n]/).map(item => item.trim()).filter(Boolean) })} /></label><label>通关标准（每行：标准｜证据提示）<textarea rows={6} value={frameworkLevelDraft.criteria.map(item => `${item.label}｜${item.evidenceHint}`).join("\n")} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: event.target.value.split("\n").filter(Boolean).map((line, index) => { const [label, evidenceHint = "提交可核验材料"] = line.split(/[｜|]/); return { id: frameworkLevelDraft.criteria[index]?.id || `criterion-${frameworkLevelDraft.level}-${index + 1}`, label: label.trim(), evidenceHint: evidenceHint.trim() }; }) })} /></label><label>版本说明<input value={frameworkNote} onChange={event => setFrameworkNote(event.target.value)} placeholder="说明本次为什么调整" /></label><div className="form-actions sticky-actions"><button className="secondary-action" type="button" disabled={busy || !workspace.framework.draft} onClick={async () => { const ok = await mutate({ action: "publish_framework", changeNote: frameworkNote }, "新版十级体系已发布"); if (ok) setAdminOpen(false); }}>发布新版</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存草稿"}</button></div></form> : null}</div> : <div className="access-admin"><div className="admin-note"><ShieldCheck size={18} /><p>评审人也是普通成员，只多一个“处理分配给自己的评审”权限；管理员建议保留 1–2 位。</p></div>{workspace.workspaceUsers.map(user => <ManagedUserRow key={`${user.email}:${user.role}:${user.groupName}`} user={user} busy={busy} onSave={(role, groupName) => mutate({ action: "update_user_access", email: user.email, role, groupName }, `${user.displayName} 的权限已更新`)} />)}</div>}</div></DialogFrame> : null}

    {levelGuide ? <DialogFrame title={`L${levelGuide.level} ${levelGuide.title}完整指南`} onClose={() => setLevelGuide(null)} size="drawer"><div className="level-guide"><div className="guide-hero" style={{ "--stage": stageForLevel(levelGuide.level, stageMeta).color } as CSSProperties}><span>{levelGuide.stage}</span><strong>L{levelGuide.level}</strong><h2>{levelGuide.title}</h2><p>{levelGuide.role}</p></div><section><p className="guide-definition">{levelGuide.definition}</p><div className="standard-callout"><small>认证标准</small><b>{levelGuide.standard}</b></div></section><section><h3>通关标准与证据示例</h3>{levelGuide.criteria.map((criterion, index) => <div className="guide-criterion" key={criterion.id}><span>{index + 1}</span><div><b>{criterion.label}</b><small>{criterion.evidenceHint}</small></div></div>)}</section><section><h3>业务实践</h3><ul>{levelGuide.practices.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul></section><section><h3>自我提升路径</h3><p>{levelGuide.path}</p></section>{levelGuide.resources.length ? <section><h3>学习资源</h3>{levelGuide.resources.map(resource => <a className="resource-link" key={resource.label} href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.label}<ChevronRight size={15} /></a>)}</section> : null}</div></DialogFrame> : null}

    {selectedAnchor ? <DialogFrame title={`${selectedAnchor.name}行业实战锚点`} onClose={() => setSelectedAnchor(null)} size="drawer"><div className="anchor-detail"><div className="anchor-hero"><span>{selectedAnchor.version}</span><h2>{selectedAnchor.name}</h2><p>{selectedAnchor.owner} · 每季度更新</p></div><p className="anchor-intro">每一个锚点任务都关联真实项目，优秀证据经审核后进入团队成果库。</p>{selectedAnchor.items.map((item, index) => <div className="anchor-task" key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>L{item.level} · {item.title}</b><small>{item.template}</small></div><button onClick={() => { setSelectedAnchor(null); setFocusedLevelNumber(item.level); setActiveView("capability"); }} aria-label={`查看 L${item.level} 标准`}><ChevronRight size={17} /></button></div>)}<div className="compliance-rule"><FolderKanban size={19} /><div><b>成果关系</b><p>证据证明个人达标；审核发布后的成果沉淀组织复用，并反馈 L6+ 的能力认证。</p></div></div></div></DialogFrame> : null}

    {toast ? <div className="toast" role="status">{toast}</div> : null}
  </main>;
}

function ManagedUserRow({ user, busy, onSave }: { user: ManagedWorkspaceUser; busy: boolean; onSave: (role: ManagedWorkspaceUser["role"], groupName: string) => Promise<boolean> }) {
  const [role, setRole] = useState(user.role);
  const [groupName, setGroupName] = useState(user.groupName);
  return <div className="managed-user-row"><span className="member-avatar">{initials(user.displayName)}</span><span><b>{user.displayName}</b><small>{user.email}</small></span><label><small>身份</small><select value={role} onChange={event => setRole(event.target.value as ManagedWorkspaceUser["role"])}><option value="member">成员</option><option value="reviewer">成员 · 评审人</option><option value="admin">管理员</option></select></label><label><small>小组</small><input value={groupName} onChange={event => setGroupName(event.target.value)} /></label><button className="secondary-action" disabled={busy || (role === user.role && groupName === user.groupName)} onClick={() => onSave(role, groupName)}>保存</button></div>;
}

function AssetRow({ asset, isAdmin, onReview, busy }: { asset: AssetRecord; isAdmin: boolean; onReview: (decision: string) => Promise<boolean>; busy: boolean }) {
  return <article className="asset-row"><div className="asset-icon">{asset.type === "Skill" ? <Sparkles size={19} /> : asset.type === "知识库" ? <BookOpen size={19} /> : asset.type === "评测集" ? <PackageCheck size={19} /> : <FolderKanban size={19} />}</div><div className="asset-copy"><div><h3>{asset.title}</h3><span>{asset.type} · {asset.industry}</span></div><p>{asset.ownerName} · 更新于 {formatDate(asset.updatedAt)}{asset.sourceEvidenceId ? " · 来自成长证据" : ""}</p></div><div className="asset-reuse"><b>{asset.reusePeople}</b><small>人复用</small></div><div className="asset-states"><em className={`state-label ${toneClass(asset.reviewStatus)}`}>{asset.reviewStatus}</em><small><ShieldCheck size={13} />{asset.complianceStatus}</small></div>{isAdmin && asset.reviewStatus === "待审核" ? <div className="asset-review-actions"><button disabled={busy} onClick={() => onReview("待补充")}>退回</button><button disabled={busy} onClick={() => onReview("已发布")}>发布</button></div> : asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`打开 ${asset.title}`}><ExternalLink size={17} /></a> : <span className="muted-link">—</span>}</article>;
}
