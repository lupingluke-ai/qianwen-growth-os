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
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FolderKanban,
  History,
  Library,
  LockKeyhole,
  Map,
  Menu,
  Plus,
  Search,
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
  Review,
  StageMeta,
  WorkspaceMember,
  WorkspacePayload,
} from "./types";

type Props = {
  levels: LevelDefinition[];
  industryAnchors: IndustryAnchor[];
  stageMeta: StageMeta[];
};

type ViewId = "growth" | "capability" | "review" | "team" | "assets";

type CheckinDraft = {
  memberId: number;
  selfLevel: number;
  targetLevel: number;
  targetDate: string;
  progressStatus: string;
  gap: string;
  plan: string;
  nextTask: string;
};

type EvidenceDraft = {
  memberId: number;
  level: number;
  criterionKey: string;
  title: string;
  kind: string;
  url: string;
  outcome: string;
};

type AssetDraft = {
  memberId: number;
  title: string;
  assetType: string;
  industry: string;
  url: string;
  complianceConfirmed: boolean;
};

const SIGN_IN_URL = "/signin-with-chatgpt?return_to=%2F";
function initials(name: string) {
  return name.trim().slice(-2) || "千";
}

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

function toneClass(value: string) {
  return `tone-${value.replaceAll(" ", "-")}`;
}

function DialogFrame({ title, onClose, children, size = "normal" }: { title: string; onClose: () => void; children: ReactNode; size?: "normal" | "wide" | "drawer" }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
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

export default function Dashboard({ levels, industryAnchors, stageMeta }: Props) {
  const [activeView, setActiveView] = useState<ViewId>("growth");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedLevel, setFocusedLevel] = useState<LevelDefinition>(levels[3]);
  const [levelGuide, setLevelGuide] = useState<LevelDefinition | null>(null);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<IndustryAnchor | null>(null);
  const [checkinDraft, setCheckinDraft] = useState<CheckinDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [reviewDecision, setReviewDecision] = useState("已通过");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamIndustry, setTeamIndustry] = useState("全部");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetType, setAssetType] = useState("全部");

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取工作区失败");
      setWorkspace(data);
      if (data.myMember) {
        const target = levels.find(level => level.level === data.myMember.targetLevel);
        if (target) setFocusedLevel(target);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "工作区暂时不可用");
    } finally {
      setLoading(false);
    }
  }, [levels]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as WorkspacePayload & { error?: string };
        if (!response.ok) throw new Error(data.error || "读取工作区失败");
        return data;
      })
      .then(data => {
        if (cancelled) return;
        setWorkspace(data);
        if (data.myMember) {
          const target = levels.find(level => level.level === data.myMember?.targetLevel);
          if (target) setFocusedLevel(target);
        }
      })
      .catch(error => {
        if (cancelled) return;
        setToast(error instanceof Error ? error.message : "工作区暂时不可用");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [levels]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      await loadWorkspace();
      showToast(success);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openCheckin(member = workspace?.myMember || null) {
    if (!workspace?.authenticated) {
      window.location.href = SIGN_IN_URL;
      return;
    }
    if (!member) return;
    setCheckinDraft({
      memberId: member.id,
      selfLevel: member.selfLevel,
      targetLevel: member.targetLevel,
      targetDate: member.targetDate,
      progressStatus: member.progressStatus,
      gap: member.gap,
      plan: member.plan,
      nextTask: member.nextTask,
    });
  }

  function openEvidence(member = workspace?.myMember || null, level = member?.targetLevel || focusedLevel.level) {
    if (!workspace?.authenticated) {
      window.location.href = SIGN_IN_URL;
      return;
    }
    if (!member) return;
    const definition = levels.find(item => item.level === level) || focusedLevel;
    setEvidenceDraft({ memberId: member.id, level, criterionKey: definition.criteria[0]?.id || "", title: "", kind: "链接", url: "", outcome: "" });
  }

  function openAsset() {
    if (!workspace?.authenticated) {
      window.location.href = SIGN_IN_URL;
      return;
    }
    const member = workspace.myMember;
    if (!member) return;
    setAssetDraft({ memberId: member.id, title: "", assetType: "Skill", industry: member.industry === "未分配" ? "高校" : member.industry, url: "", complianceConfirmed: false });
  }

  const myEvidence = useMemo(() => workspace?.evidences.filter(item => item.memberId === workspace.myMember?.id) || [], [workspace]);
  const selectedLevelEvidence = useMemo(() => myEvidence.filter(item => item.level === focusedLevel.level), [focusedLevel.level, myEvidence]);
  const filteredMembers = useMemo(() => (workspace?.members || []).filter(member => {
    const matchesIndustry = teamIndustry === "全部" || member.industry === teamIndustry;
    const matchesQuery = `${member.name}${member.role}${member.nextTask}`.toLowerCase().includes(teamQuery.toLowerCase());
    return matchesIndustry && matchesQuery;
  }).toSorted((a, b) => {
    if (a.overdueTasks !== b.overdueTasks) return b.overdueTasks - a.overdueTasks;
    if (a.progressStatus === "有风险" && b.progressStatus !== "有风险") return -1;
    return b.currentLevel - a.currentLevel;
  }), [teamIndustry, teamQuery, workspace]);
  const filteredAssets = useMemo(() => (workspace?.assets || []).filter(asset => {
    const matchesType = assetType === "全部" || asset.type === assetType;
    return matchesType && `${asset.title}${asset.industry}${asset.ownerName}`.toLowerCase().includes(assetQuery.toLowerCase());
  }), [assetQuery, assetType, workspace]);

  const navItems = [
    { id: "growth" as const, label: "我的成长", icon: Target },
    { id: "capability" as const, label: "能力体系", icon: Map },
    { id: "review" as const, label: "Review", icon: ClipboardCheck },
    { id: "team" as const, label: "团队", icon: Users },
    { id: "assets" as const, label: "资产", icon: Library },
  ];

  const metrics = workspace?.metrics;
  const myMember = workspace?.myMember;
  const currentStage = stageForLevel(myMember?.currentLevel || metrics?.median || 1, stageMeta);
  const canReview = workspace?.me?.role === "admin" || workspace?.me?.role === "reviewer";

  return <main className="control-shell">
    <header className="control-header">
      <button className="brand-button" onClick={() => setActiveView("growth")} aria-label="回到我的成长">
        <span className="brand-mark">千</span><span>千问计划</span>
      </button>
      <button className="mobile-menu" aria-label="打开导航" onClick={() => setMobileNavOpen(open => !open)}><Menu size={20} /></button>
      <nav className={`control-nav ${mobileNavOpen ? "is-open" : ""}`} aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setMobileNavOpen(false); }}><Icon size={17} /><span>{label}</span></button>)}
      </nav>
      <div className="account-area">
        {workspace?.authenticated ? <>
          <button className="header-action" onClick={() => openCheckin()}>继续更新</button>
          <a className="account-chip" href="/signout-with-chatgpt?return_to=%2F" title="退出登录"><span>{initials(workspace.me?.displayName || "千")}</span><span><b>{workspace.me?.displayName}</b><small>{workspace.me?.role === "admin" ? "管理员" : workspace.me?.role === "reviewer" ? "评审人" : "成员"}</small></span></a>
        </> : <a className="header-action" href={SIGN_IN_URL}>登录后更新</a>}
      </div>
    </header>

    <section className="control-workspace">
      {loading && !workspace ? <div className="loading-screen"><span /><p>正在整理成长数据…</p></div> : null}

      {activeView === "growth" && workspace ? <section className="workspace-view growth-view">
        <div className="page-heading">
          <div><h1>从行动到认证，每一步都有证据。</h1><p>{workspace.authenticated ? `${workspace.me?.displayName}，这是你本月最重要的成长动作。` : "公开视图展示团队整体进展；登录后可维护个人记录与提交评审。"}</p></div>
          <div className="heading-actions">{workspace.authenticated ? <button className="primary-action" onClick={() => openCheckin()}>继续更新 <ArrowRight size={17} /></button> : <a className="primary-action" href={SIGN_IN_URL}><LockKeyhole size={16} /> 登录后进入个人工作区</a>}</div>
        </div>

        <div className="growth-primary-grid">
          <section className="journey-command">
            <div className="command-top"><span>{myMember ? "当前认证" : "团队中位层级"}</span><span>{currentStage.label}</span></div>
            <div className="command-level"><strong>L{myMember?.currentLevel || metrics?.median || 0}</strong><div><span>{myMember ? `自评 L${myMember.selfLevel}` : `平均 L${metrics?.average || 0}`}</span><b>{myMember ? `目标 L${myMember.targetLevel}` : "目标 L6"}</b></div></div>
            <div className="journey-rail" aria-label="十级成长路径">
              {levels.map(level => <button key={level.level} className={`${(myMember?.currentLevel || metrics?.median || 0) >= level.level ? "reached" : ""} ${myMember?.targetLevel === level.level ? "target" : ""}`} onClick={() => { setFocusedLevel(level); setActiveView("capability"); }} aria-label={`查看 L${level.level} ${level.title}`}><i /><span>{level.level}</span></button>)}
            </div>
            <div className="stage-bands">{stageMeta.map(stage => <span key={stage.label}><b>{stage.label}</b><small>{stage.range}</small></span>)}</div>
            <div className="command-bottom">
              <div><small>证据完成</small><b>{myMember ? `${Math.min(myMember.evidenceCount, 5)} / 5` : `${metrics?.evidenceCompletion || 0}%`}</b></div>
              <div><small>评审状态</small><b>{myMember?.reviewStatus || `${metrics?.pendingReviews || 0} 项进行中`}</b></div>
              <button onClick={() => { setFocusedLevel(levels.find(item => item.level === (myMember?.targetLevel || 6)) || levels[5]); setActiveView("capability"); }}>查看下一层标准 <ChevronRight size={16} /></button>
            </div>
          </section>

          <aside className="next-action-panel">
            <div className="panel-heading"><div><h2>本月下一步</h2><p>7月30日 Review</p></div><span className={myMember?.overdueTasks ? "risk-dot" : "ok-dot"} /></div>
            <div className="action-focus"><small>当前任务</small><h3>{myMember?.nextTask || "完成团队第 5 个月里程碑"}</h3><p>{myMember?.plan || "推动平均能力达到 L6，并沉淀一批可复用资产。"}</p></div>
            <div className="action-facts">
              <div><CircleAlert size={17} /><span><small>阻塞项</small><b>{myMember?.gap || `${metrics?.atRisk || 0} 人需要关注`}</b></span></div>
              <div><Clock3 size={17} /><span><small>目标时间</small><b>{formatDate(myMember?.targetDate || "2026-09-30")}</b></span></div>
              <div><UserRoundCheck size={17} /><span><small>最近反馈</small><b>{workspace.reviews.find(review => review.memberId === myMember?.id)?.feedback || "提交后将由主评人给出反馈"}</b></span></div>
            </div>
            {workspace.authenticated ? <button className="secondary-action full" onClick={() => openEvidence()}>添加一条证据 <Plus size={16} /></button> : null}
          </aside>
        </div>

        <div className="growth-secondary-grid">
          <section className="team-pulse-panel">
            <div className="panel-heading"><div><h2>团队能力脉搏</h2><p>分布比单一平均值更接近真实结构</p></div><button className="text-button" onClick={() => setActiveView("team")}>查看团队 <ChevronRight size={15} /></button></div>
            <div className="distribution-chart" aria-label="团队层级分布">
              {(metrics?.distribution || Array(10).fill(0)).map((count, index) => <div key={index}><span style={{ height: `${Math.max(7, count * 24)}px` }} className={count ? "has-value" : ""}><i>{count || ""}</i></span><small>L{index + 1}</small></div>)}
            </div>
            <div className="pulse-metrics"><span><b>{metrics?.median || 0}</b><small>中位层级</small></span><span><b>{metrics?.l3Rate || 0}%</b><small>L3 达成</small></span><span><b>{metrics?.l6Rate || 0}%</b><small>L6 资产化</small></span><span><b>{metrics?.overdue || 0}</b><small>逾期任务</small></span></div>
          </section>

          <section className="review-queue-mini">
            <div className="panel-heading"><div><h2>Review 队列</h2><p>{metrics?.pendingReviews || 0} 项待处理</p></div><button className="text-button" onClick={() => setActiveView("review")}>打开队列 <ChevronRight size={15} /></button></div>
            <div className="compact-list">{workspace.reviews.slice(0, 3).map(review => <button key={review.id} onClick={() => { setSelectedReview(review); setReviewFeedback(review.feedback || ""); }}><span className="member-avatar">{initials(review.memberName)}</span><span><b>{review.memberName}</b><small>L{review.fromLevel} → L{review.targetLevel} · {review.evidenceCount} 条证据</small></span><em className={`state-label ${toneClass(review.state)}`}>{review.state}</em></button>)}{!workspace.reviews.length ? <EmptyState icon={workspace.authenticated ? <ClipboardCheck size={24} /> : <LockKeyhole size={24} />} title={workspace.authenticated ? "暂无评审" : "登录后查看评审明细"} copy={workspace.authenticated ? "提交晋级申请后会出现在这里。" : "公开视图只展示队列数量，不展示个人材料。"} /> : null}</div>
          </section>
        </div>
      </section> : null}

      {activeView === "capability" && workspace ? <section className="workspace-view capability-view">
        <div className="page-heading"><div><h1>能力体系</h1><p>通用核心、岗位主赛道与商业影响层，全部用可核验产出通关。</p></div><div className="stage-legend">{stageMeta.map(stage => <span key={stage.label}><i style={{ background: stage.color }} />{stage.label}</span>)}</div></div>
        <div className="level-navigation">{levels.map(level => <button key={level.level} className={focusedLevel.level === level.level ? "active" : ""} style={{ "--stage": stageForLevel(level.level, stageMeta).color } as CSSProperties} onClick={() => setFocusedLevel(level)}><small>L{level.level}</small><b>{level.title}</b><span>{level.stage}</span></button>)}</div>
        <div className="capability-workbench" style={{ "--stage": stageForLevel(focusedLevel.level, stageMeta).color } as CSSProperties}>
          <div className="capability-number"><span>LEVEL</span><strong>{String(focusedLevel.level).padStart(2, "0")}</strong><small>{focusedLevel.stage}</small></div>
          <div className="capability-main"><span className="stage-label">{focusedLevel.role}</span><h2>{focusedLevel.title}</h2><p>{focusedLevel.definition}</p><div className="standard-callout"><small>认证标准</small><b>{focusedLevel.standard}</b></div>{focusedLevel.badges?.length ? <div className="badge-row">{focusedLevel.badges.map(badge => <span key={badge}><BadgeCheck size={15} />{badge}</span>)}</div> : null}<div className="capability-actions"><button className="primary-action" onClick={() => openEvidence(workspace.myMember, focusedLevel.level)}>添加证据 <Plus size={16} /></button><button className="secondary-action" onClick={() => setLevelGuide(focusedLevel)}>完整级别指南</button></div></div>
          <div className="criteria-panel"><div className="panel-heading"><div><h3>原子通关标准</h3><p>{selectedLevelEvidence.length} 条证据已关联</p></div></div>{focusedLevel.criteria.map((criterion, index) => { const evidence = selectedLevelEvidence.find(item => item.criterionKey === criterion.id); return <div className="criterion-row" key={criterion.id}><span className={evidence ? "done" : ""}>{evidence ? <Check size={15} /> : index + 1}</span><div><b>{criterion.label}</b><small>{evidence?.title || criterion.evidenceHint}</small></div><em>{evidence ? evidence.status : "待举证"}</em></div>; })}</div>
        </div>
      </section> : null}

      {activeView === "review" && workspace ? <section className="workspace-view review-view">
        <div className="page-heading"><div><h1>月度 Review</h1><p>提交证据、核验业务结果、形成正式认证与下一步行动。</p></div>{myMember && !myMember.pendingReviewId ? <button className="primary-action" onClick={async () => { const ok = await mutate({ action: "submit_review", memberId: myMember.id }, "晋级申请已提交"); if (ok) setActiveView("review"); }}>提交晋级申请 <ArrowRight size={17} /></button> : null}</div>
        <div className="review-layout">
          <section className="review-table-panel">
            <div className="review-summary-strip"><span><b>{metrics?.pendingReviews || 0}</b><small>进行中</small></span><span><b>{workspace.reviews.filter(item => item.state === "待补证").length}</b><small>待补证</small></span><span><b>{metrics?.reviewReady || 0}</b><small>本月已就绪</small></span><span><b>≤3天</b><small>评审 SLA</small></span></div>
            <div className="table-header review-columns"><span>成员与申请</span><span>证据</span><span>状态</span><span>主评人</span><span>提交时间</span><span /></div>
            <div className="table-body">{workspace.reviews.map(review => <button className="table-row review-columns" key={review.id} onClick={() => { setSelectedReview(review); setReviewFeedback(review.feedback || ""); setReviewDecision(review.state === "待补证" ? "待补证" : "已通过"); }}><span className="person-cell"><i className="member-avatar">{initials(review.memberName)}</i><span><b>{review.memberName}</b><small>L{review.fromLevel} → L{review.targetLevel}</small></span></span><span><b>{review.evidenceCount}</b><small>条材料</small></span><span><em className={`state-label ${toneClass(review.state)}`}>{review.state}</em></span><span>{review.reviewerName}</span><span>{formatDate(review.submittedAt)}</span><ChevronRight size={16} /></button>)}{!workspace.reviews.length ? <EmptyState icon={workspace.authenticated ? <ClipboardCheck size={26} /> : <LockKeyhole size={26} />} title={workspace.authenticated ? "队列已清空" : "登录后查看 Review 队列"} copy={workspace.authenticated ? "当前没有需要处理的晋级申请。" : "公开视图保留整体节奏与数量，个人申请和证据仅登录后可见。"} action={!workspace.authenticated ? <a className="primary-action" href={SIGN_IN_URL}>登录查看</a> : undefined} /> : null}</div>
          </section>
          <aside className="review-process-panel"><h2>固定评审节奏</h2><p>减少现场汇报，把时间留给有争议和可复用的案例。</p><ol>{["每周轻量更新行动与阻塞", "Review 前 5 天提交材料", "前 3 天完成预审与补证", "现场聚焦争议与最佳实践", "2 天内固化结论与反馈"].map((item, index) => <li key={item}><span>{index + 1}</span><b>{item}</b></li>)}</ol><div className="review-rule"><ShieldCheck size={20} /><div><b>认证层级不可自改</b><p>只有“已通过”的评审会更新认证层级，并写入历史记录。</p></div></div></aside>
        </div>
      </section> : null}

      {activeView === "team" && workspace ? <section className="workspace-view team-view">
        <div className="page-heading"><div><h1>团队驾驶舱</h1><p>按风险、逾期和评审状态排序，而不是只看谁的层级更高。</p></div><div className="heading-metrics"><span><b>{metrics?.memberCount}</b><small>成员</small></span><span><b>{metrics?.atRisk}</b><small>风险</small></span><span><b>{metrics?.pendingReviews}</b><small>待评审</small></span></div></div>
        <div className="team-toolbar"><label className="search-field"><Search size={17} /><input value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="搜索成员、岗位或任务" /></label><div className="segmented-filter">{["全部", "高校", "新质", "能源", "政务", "未分配"].map(item => <button key={item} className={teamIndustry === item ? "active" : ""} onClick={() => setTeamIndustry(item)}>{item}</button>)}</div></div>
        <section className="team-table-panel"><div className="table-header team-columns"><span>成员</span><span>认证 / 自评 / 目标</span><span>证据</span><span>评审状态</span><span>下一步</span><span>风险</span><span /></div><div className="table-body">{filteredMembers.map(member => <button className="table-row team-columns" key={member.id} onClick={() => setSelectedMember(member)}><span className="person-cell"><i className={`member-avatar industry-${member.industry}`}>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.role} · {member.industry}</small></span></span><span className="level-triplet"><b>L{member.currentLevel}</b><i>L{member.selfLevel}</i><em>L{member.targetLevel}</em></span><span><b>{member.evidenceCount}</b><small>条有效材料</small></span><span><em className={`state-label ${toneClass(member.reviewStatus)}`}>{member.reviewStatus}</em></span><span className="next-cell">{member.nextTask || "待补充"}</span><span>{member.overdueTasks ? <em className="risk-label">逾期 {member.overdueTasks}</em> : <em className={`state-label ${toneClass(member.progressStatus)}`}>{member.progressStatus}</em>}</span><ChevronRight size={16} /></button>)}{!filteredMembers.length ? <EmptyState icon={<Users size={26} />} title="没有符合条件的成员" copy="调整搜索或行业筛选后重试。" /> : null}</div></section>
      </section> : null}

      {activeView === "assets" && workspace ? <section className="workspace-view assets-view">
        <div className="page-heading"><div><h1>组织资产</h1><p>所有 Skill、知识库、评测集与原型都经过合规自查、审核和复用验证。</p></div><button className="primary-action" onClick={openAsset}>提交资产 <Plus size={17} /></button></div>
        <div className="asset-stat-strip"><span><b>{workspace.assets.length}</b><small>团队资产</small></span><span><b>{workspace.assets.filter(item => item.reviewStatus === "已发布").length}</b><small>已发布</small></span><span><b>{workspace.assets.reduce((sum, item) => sum + item.reusePeople, 0)}</b><small>内部复用人次</small></span><span><b>{workspace.assets.reduce((sum, item) => sum + item.reuseClients, 0)}</b><small>客户复用</small></span></div>
        <div className="assets-layout">
          <section className="asset-library-panel"><div className="asset-toolbar"><label className="search-field"><Search size={17} /><input value={assetQuery} onChange={event => setAssetQuery(event.target.value)} placeholder="搜索资产、行业或作者" /></label><div className="segmented-filter">{["全部", "Skill", "知识库", "评测集", "原型"].map(item => <button key={item} className={assetType === item ? "active" : ""} onClick={() => setAssetType(item)}>{item}</button>)}</div></div><div className="asset-list">{filteredAssets.map(asset => <AssetRow key={asset.id} asset={asset} />)}{!filteredAssets.length ? <EmptyState icon={<Library size={26} />} title="没有符合条件的资产" copy="调整搜索或类型筛选后重试。" /> : null}</div></section>
          <aside className="anchor-panel"><div className="panel-heading"><div><h2>行业实战锚点</h2><p>2026 Q3 · 与重点商机对齐</p></div><BookOpen size={20} /></div><div className="anchor-list">{industryAnchors.map(anchor => <button key={anchor.name} onClick={() => setSelectedAnchor(anchor)}><span><b>{anchor.name}</b><small>{anchor.owner}</small></span><span><b>L3–L7</b><small>{anchor.items.length} 项任务</small></span><ChevronRight size={16} /></button>)}</div><div className="compliance-rule"><CircleAlert size={19} /><div><b>拿不准的，一律只发内网</b><p>提交时必须完成脱敏、样例数据、密钥剥离和行业负责人确认。</p></div></div></aside>
        </div>
      </section> : null}
    </section>

    {checkinDraft ? <DialogFrame title="更新成长进展" onClose={() => setCheckinDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "update_checkin", ...checkinDraft }, "本周进展已更新"); if (ok) setCheckinDraft(null); }}><div className="dialog-heading"><span>PERSONAL CHECK-IN</span><h2>更新本周成长进展</h2><p>认证层级由评审确认；这里记录自评、目标、行动和阻塞。</p></div><div className="certified-banner"><BadgeCheck size={20} /><span><small>当前认证层级</small><b>L{workspace?.members.find(item => item.id === checkinDraft.memberId)?.currentLevel || 1} · 不可直接修改</b></span></div><div className="form-grid"><label>自评层级<select value={checkinDraft.selfLevel} onChange={event => setCheckinDraft({ ...checkinDraft, selfLevel: Number(event.target.value) })}>{levels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>目标层级<select value={checkinDraft.targetLevel} onChange={event => setCheckinDraft({ ...checkinDraft, targetLevel: Number(event.target.value) })}>{levels.filter(level => level.level >= checkinDraft.selfLevel).map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>目标日期<input type="date" value={checkinDraft.targetDate} onChange={event => setCheckinDraft({ ...checkinDraft, targetDate: event.target.value })} /></label><label>推进状态<select value={checkinDraft.progressStatus} onChange={event => setCheckinDraft({ ...checkinDraft, progressStatus: event.target.value })}>{["正常", "进行中", "有风险", "阻塞"].map(status => <option key={status}>{status}</option>)}</select></label></div><label>当前差距<textarea rows={3} value={checkinDraft.gap} onChange={event => setCheckinDraft({ ...checkinDraft, gap: event.target.value })} placeholder="对照目标层级，描述还缺少什么" /></label><label>本月行动计划<textarea rows={3} value={checkinDraft.plan} onChange={event => setCheckinDraft({ ...checkinDraft, plan: event.target.value })} placeholder="写清楚具体动作、截止时间与业务场景" /></label><label>下一步任务<input value={checkinDraft.nextTask} onChange={event => setCheckinDraft({ ...checkinDraft, nextTask: event.target.value })} placeholder="本周最重要的一件事" /></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setCheckinDraft(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存本周更新"}</button></div></form></DialogFrame> : null}

    {evidenceDraft ? <DialogFrame title="添加晋级证据" onClose={() => setEvidenceDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "add_evidence", ...evidenceDraft }, "证据已添加，等待评审核验"); if (ok) setEvidenceDraft(null); }}><div className="dialog-heading"><span>EVIDENCE</span><h2>添加 L{evidenceDraft.level} 晋级证据</h2><p>一条证据对应一项通关标准，并写清真实业务效果。</p></div><div className="form-grid"><label>目标层级<select value={evidenceDraft.level} onChange={event => { const level = Number(event.target.value); const definition = levels.find(item => item.level === level)!; setEvidenceDraft({ ...evidenceDraft, level, criterionKey: definition.criteria[0].id }); }}>{levels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label><label>证据类型<select value={evidenceDraft.kind} onChange={event => setEvidenceDraft({ ...evidenceDraft, kind: event.target.value })}>{["链接", "报告", "仓库", "演示", "使用记录", "客户反馈"].map(kind => <option key={kind}>{kind}</option>)}</select></label></div><label>关联通关标准<select value={evidenceDraft.criterionKey} onChange={event => setEvidenceDraft({ ...evidenceDraft, criterionKey: event.target.value })}>{levels.find(item => item.level === evidenceDraft.level)?.criteria.map(criterion => <option key={criterion.id} value={criterion.id}>{criterion.label}</option>)}</select></label><label>证据标题<input required value={evidenceDraft.title} onChange={event => setEvidenceDraft({ ...evidenceDraft, title: event.target.value })} placeholder="例如：MES 测试环境集成 POC 复盘" /></label><label>材料链接<input type="url" value={evidenceDraft.url} onChange={event => setEvidenceDraft({ ...evidenceDraft, url: event.target.value })} placeholder="https://…（可选）" /></label><label>业务结果<textarea required rows={4} value={evidenceDraft.outcome} onChange={event => setEvidenceDraft({ ...evidenceDraft, outcome: event.target.value })} placeholder="说明客户反馈、复用人数、提效数据或商机推进结果" /></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setEvidenceDraft(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "添加证据"}</button></div></form></DialogFrame> : null}

    {selectedReview ? <DialogFrame title={`${selectedReview.memberName} 的晋级评审`} onClose={() => setSelectedReview(null)} size="wide"><div className="dialog-form"><div className="dialog-heading"><span>REVIEW DECISION</span><h2>{selectedReview.memberName} · L{selectedReview.fromLevel} → L{selectedReview.targetLevel}</h2><p>{selectedReview.evidenceCount} 条材料 · {selectedReview.cycle} · {selectedReview.state}</p></div><div className="review-detail-summary"><span><small>当前状态</small><b>{selectedReview.state}</b></span><span><small>主评人</small><b>{selectedReview.reviewerName}</b></span><span><small>提交时间</small><b>{formatDate(selectedReview.submittedAt)}</b></span></div>{selectedReview.feedback ? <div className="feedback-box"><UserRoundCheck size={19} /><div><small>已有反馈</small><p>{selectedReview.feedback}</p></div></div> : null}{canReview ? <><label>评审结论<select value={reviewDecision} onChange={event => setReviewDecision(event.target.value)}>{["已通过", "待补证", "未通过"].map(item => <option key={item}>{item}</option>)}</select></label><label>评审反馈<textarea rows={5} value={reviewFeedback} onChange={event => setReviewFeedback(event.target.value)} placeholder="写清判断依据、缺少材料和下一步建议" /></label><div className="form-actions"><button className="secondary-action" onClick={() => setSelectedReview(null)}>稍后处理</button><button className="primary-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "review_decision", reviewId: selectedReview.id, decision: reviewDecision, feedback: reviewFeedback }, `评审已更新为“${reviewDecision}”`); if (ok) setSelectedReview(null); }}>{busy ? "处理中…" : "确认评审结论"}</button></div></> : <div className="readonly-notice"><LockKeyhole size={18} /><span>你可以查看自己的评审进度，正式结论由评审人确认。</span></div>}</div></DialogFrame> : null}

    {selectedMember ? <DialogFrame title={`${selectedMember.name} 的成长档案`} onClose={() => setSelectedMember(null)} size="drawer"><div className="member-profile"><div className="profile-hero"><span className={`member-avatar large industry-${selectedMember.industry}`}>{initials(selectedMember.name)}</span><div><h2>{selectedMember.name}</h2><p>{selectedMember.role} · {selectedMember.industry}</p></div></div><div className="profile-levels"><span><small>认证</small><b>L{selectedMember.currentLevel}</b></span><span><small>自评</small><b>L{selectedMember.selfLevel}</b></span><span><small>目标</small><b>L{selectedMember.targetLevel}</b></span></div><section><h3>当前差距</h3><p>{selectedMember.gap || "待补充"}</p></section><section><h3>本月计划</h3><p>{selectedMember.plan || "待补充"}</p></section><section><h3>下一步任务</h3><p>{selectedMember.nextTask || "待补充"}</p></section><div className="profile-facts"><span><FileCheck2 size={17} />{selectedMember.evidenceCount} 条证据</span><span><History size={17} />更新于 {formatDate(selectedMember.updatedAt)}</span><span><ClipboardCheck size={17} />{selectedMember.reviewStatus}</span></div>{workspace?.me?.role === "admin" ? <button className="secondary-action full" onClick={() => { setSelectedMember(null); openCheckin(selectedMember); }}>代维护进展</button> : null}</div></DialogFrame> : null}

    {assetDraft ? <DialogFrame title="提交团队资产" onClose={() => setAssetDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "create_asset", ...assetDraft }, "资产已提交审核"); if (ok) setAssetDraft(null); }}><div className="dialog-heading"><span>KNOWLEDGE TO ASSET</span><h2>提交团队资产</h2><p>资产通过合规审核和复用验证后，才能作为 L6+ 晋级证据。</p></div><div className="form-grid"><label>资产类型<select value={assetDraft.assetType} onChange={event => setAssetDraft({ ...assetDraft, assetType: event.target.value })}>{["Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <option key={item}>{item}</option>)}</select></label><label>所属行业<select value={assetDraft.industry} onChange={event => setAssetDraft({ ...assetDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div><label>资产名称<input required value={assetDraft.title} onChange={event => setAssetDraft({ ...assetDraft, title: event.target.value })} placeholder="使用业务价值清晰的名称" /></label><label>仓库或材料链接<input type="url" value={assetDraft.url} onChange={event => setAssetDraft({ ...assetDraft, url: event.target.value })} placeholder="https://…（可选）" /></label><label className="compliance-check"><input type="checkbox" checked={assetDraft.complianceConfirmed} onChange={event => setAssetDraft({ ...assetDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户与人名已匿名化、真实数据已替换、密钥与内网地址已剥离，敏感行业已获负责人确认。</small></span></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setAssetDraft(null)}>取消</button><button className="primary-action" disabled={busy || !assetDraft.complianceConfirmed}>{busy ? "提交中…" : "提交审核"}</button></div></form></DialogFrame> : null}

    {levelGuide ? <DialogFrame title={`L${levelGuide.level} ${levelGuide.title}完整指南`} onClose={() => setLevelGuide(null)} size="drawer"><div className="level-guide"><div className="guide-hero" style={{ "--stage": stageForLevel(levelGuide.level, stageMeta).color } as CSSProperties}><span>{levelGuide.stage}</span><strong>L{levelGuide.level}</strong><h2>{levelGuide.title}</h2><p>{levelGuide.role}</p></div><section><p className="guide-definition">{levelGuide.definition}</p><div className="standard-callout"><small>认证标准</small><b>{levelGuide.standard}</b></div></section><section><h3>通关标准与证据示例</h3>{levelGuide.criteria.map((criterion, index) => <div className="guide-criterion" key={criterion.id}><span>{index + 1}</span><div><b>{criterion.label}</b><small>{criterion.evidenceHint}</small></div></div>)}</section><section><h3>业务实践</h3><ul>{levelGuide.practices.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul></section><section><h3>自我提升路径</h3><p>{levelGuide.path}</p></section>{levelGuide.resources.length ? <section><h3>学习资源</h3>{levelGuide.resources.map(resource => <a className="resource-link" key={resource.label} href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.label}<ChevronRight size={15} /></a>)}</section> : null}</div></DialogFrame> : null}

    {selectedAnchor ? <DialogFrame title={`${selectedAnchor.name}行业实战锚点`} onClose={() => setSelectedAnchor(null)} size="drawer"><div className="anchor-detail"><div className="anchor-hero"><span>{selectedAnchor.version}</span><h2>{selectedAnchor.name}</h2><p>{selectedAnchor.owner} · 每季度更新</p></div><p className="anchor-intro">每一个锚点任务都要关联真实商机或客户项目，并在 Review 中用产出举证。</p>{selectedAnchor.items.map((item, index) => <div className="anchor-task" key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>L{item.level} · {item.title}</b><small>{item.template}</small></div><button onClick={() => { setSelectedAnchor(null); setFocusedLevel(levels[item.level - 1]); setActiveView("capability"); }} aria-label={`查看 L${item.level} 标准`}><ChevronRight size={17} /></button></div>)}<div className="compliance-rule"><FolderKanban size={19} /><div><b>任务要素</b><p>负责人、关联商机、截止时间、模板、产出链接与复盘结论。</p></div></div></div></DialogFrame> : null}

    {toast ? <div className="toast" role="status">{toast}</div> : null}
  </main>;
}

function AssetRow({ asset }: { asset: AssetRecord }) {
  return <article className="asset-row"><div className="asset-icon">{asset.type === "Skill" ? <Sparkles size={19} /> : asset.type === "知识库" ? <BookOpen size={19} /> : asset.type === "评测集" ? <BarChart3 size={19} /> : <FolderKanban size={19} />}</div><div className="asset-copy"><div><h3>{asset.title}</h3><span>{asset.type} · {asset.industry}</span></div><p>{asset.ownerName} · 更新于 {formatDate(asset.updatedAt)}</p></div><div className="asset-reuse"><b>{asset.reusePeople}</b><small>人复用</small></div><div className="asset-reuse"><b>{asset.reuseClients}</b><small>家客户</small></div><div className="asset-states"><em className={`state-label ${toneClass(asset.reviewStatus)}`}>{asset.reviewStatus}</em><small><ShieldCheck size={13} />{asset.complianceStatus}</small></div>{asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`打开 ${asset.title}`}><ExternalLink size={17} /></a> : <span className="muted-link">—</span>}</article>;
}
