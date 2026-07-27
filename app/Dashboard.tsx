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
import { signOut } from "next-auth/react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle,
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
  Paperclip,
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
  Evidence,
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
type TeamTab = "members" | "assets" | "report";
type ReviewScope = "mine" | "assigned" | "all";

type CheckinDraft = {
  memberId: number; targetLevel: number; targetDate: string;
  progressStatus: string; gap: string; plan: string; nextTask: string;
};

type EvidenceDraft = {
  id?: number;
  memberId: number; level: number; criterionKey: string; title: string; kind: string;
  url: string; outcome: string; nominateAsset: boolean; complianceConfirmed: boolean;
};

type AssetDraft = {
  memberId: number; title: string; description: string; assetType: string; industry: string; url: string; complianceConfirmed: boolean;
};

type OnboardingDraft = {
  step: number; groupName: string; industry: string; targetLevel: number; targetDate: string; nextTask: string;
};

const SIGN_IN_URL = "/login";
const CURRENT_CYCLE = new Date().toISOString().slice(0, 7);
const TODAY = new Date().toISOString().slice(0, 10);

async function handleSignOut() {
  if (!window.confirm("确定退出登录吗？")) return;
  await signOut({ redirect: false });
  window.location.href = "/";
}

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
function reviewStaleDays(review: Review) {
  if (!["已提交", "评审中", "待补证"].includes(review.state)) return 0;
  const submitted = new Date(review.submittedAt.slice(0, 10)).getTime();
  if (Number.isNaN(submitted)) return 0;
  return Math.floor((Date.now() - submitted) / 86400000);
}

function DialogFrame({ title, onClose, children, size = "normal" }: { title: string; onClose: () => void; children: ReactNode; size?: "normal" | "wide" | "drawer" }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, input, select, textarea, a")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div ref={dialogRef} className={`dialog-card dialog-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="icon-button dialog-close" type="button" aria-label="关闭" onClick={onClose} autoFocus><X size={20} /></button>
      {children}
    </div>
  </div>;
}

function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><p>{copy}</p>{action}</div>;
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return <span className={`field-label${required ? " required" : ""}`}>{text}</span>;
}

function nextCriterionId(level: LevelDefinition) {
  const max = level.criteria.reduce((acc, item) => { const suffix = Number(item.id.split("-").pop()); return Number.isFinite(suffix) && suffix > acc ? suffix : acc; }, 0);
  return `criterion-${level.level}-${max + 1}`;
}

function ReviewMaterialPanel({ levelDef, evidences }: { levelDef?: LevelDefinition; evidences: Evidence[] }) {
  if (!levelDef) return null;
  const total = levelDef.criteria.length;
  const coveredCount = levelDef.criteria.filter(criterion => evidences.some(item => item.criterionKey === criterion.id)).length;
  const allCovered = total > 0 && coveredCount === total;
  const extras = evidences.filter(item => !levelDef.criteria.some(criterion => criterion.id === item.criterionKey));
  return <div className="review-material">
    <div className="review-material-head"><b>L{levelDef.level} 通关标准与证据</b><em className={allCovered ? "all-covered" : ""}>已覆盖 {coveredCount}/{total}</em></div>
    <div className="review-material-group"><b>通关标准</b><em className={allCovered ? "all-covered" : ""}>已覆盖 {coveredCount}/{total}</em></div>
    {levelDef.criteria.map(criterion => {
      const items = evidences.filter(item => item.criterionKey === criterion.id);
      return <div className={`review-criterion${items.length ? " covered" : ""}`} key={criterion.id}>
        <div className="review-criterion-head">{items.length ? <Check size={16} /> : <CircleAlert size={16} />}<b>{criterion.label}</b><small>{items.length ? `${items.length} 条证据` : "暂无证据"}</small></div>
        {items.map(item => <div className="review-evidence-item" key={item.id}><div><b>{item.title}</b><small>{item.kind} · {item.status} · {formatDate(item.createdAt)}</small>{item.outcome ? <p>{item.outcome}</p> : null}</div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开 ${item.title} 材料`}><ExternalLink size={16} /></a> : null}</div>)}
      </div>;
    })}
    {extras.length ? <>
      <div className="review-material-group"><b>其他证据</b><em>{extras.length} 条</em></div>
      <div className="review-criterion covered">{extras.map(item => <div className="review-evidence-item" key={item.id}><div><b>{item.title}</b><small>{item.kind} · {item.status} · {formatDate(item.createdAt)}</small>{item.outcome ? <p>{item.outcome}</p> : null}</div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开 ${item.title} 材料`}><ExternalLink size={16} /></a> : null}</div>)}</div>
    </> : null}
  </div>;
}

export default function Dashboard({ levels: fallbackLevels, industryAnchors, stageMeta }: Props) {
  const [activeView, setActiveView] = useState<ViewId>("growth");
  const [teamTab, setTeamTab] = useState<TeamTab>("report");
  const [reviewScope, setReviewScope] = useState<ReviewScope>("mine");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft | null>(null);
  const onboardingShownRef = useRef(false);
  const [reviewSubmitOpen, setReviewSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewDecision, setReviewDecision] = useState("已通过");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamGroup, setTeamGroup] = useState("全部");
  const [teamFilter, setTeamFilter] = useState("全部");
  const [teamLevelFilter, setTeamLevelFilter] = useState<number | null>(null);
  const [teamPageSize, setTeamPageSize] = useState(20);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [assetQuery, setAssetQuery] = useState("");
  const [assetType, setAssetType] = useState("全部");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<"framework" | "access">("framework");
  const [frameworkLevelDraft, setFrameworkLevelDraft] = useState<LevelDefinition | null>(null);
  const [frameworkNote, setFrameworkNote] = useState("");

  const activeLevels = (workspace?.levels?.length ?? 0) >= 10 ? workspace!.levels : fallbackLevels;
  const focusedLevel = activeLevels.find(level => level.level === focusedLevelNumber) || activeLevels[0];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  const applyWorkspace = useCallback((data: WorkspacePayload) => {
    setWorkspace(data);
    if (data.myMember) {
      const nextLevel = Math.min((data.myMember.currentLevel ?? 0) + 1, activeLevels.length || 10);
      setFocusedLevelNumber(nextLevel);
    }
    if (data.me?.role === "reviewer" || data.me?.role === "admin") setReviewScope("assigned");
    if (data.myMember && data.myMember.industry === "未分配" && !onboardingShownRef.current) {
      onboardingShownRef.current = true;
      setOnboardingDraft({ step: 1, groupName: data.myMember.groupName || "综合组", industry: "通用", targetLevel: Math.max(data.myMember.targetLevel, data.myMember.currentLevel + 1), targetDate: data.myMember.targetDate, nextTask: data.myMember.nextTask || "" });
    }
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
      .then(data => { if (!cancelled) { applyWorkspace(data); setLoadError(null); } })
      .catch(error => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : "工作区暂时不可用"); setToast(error instanceof Error ? error.message : "工作区暂时不可用"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyWorkspace]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失败");
      await loadWorkspace();
      if (success) showToast(success);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "操作失败";
      setSubmitError(msg);
      showToast(msg);
      return false;
    } finally { setBusy(false); }
  }

  function openCheckin(member = workspace?.myMember || null) {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    if (!member) return;
    setFormErrors({});
    setCheckinDraft({ memberId: member.id, targetLevel: member.targetLevel, targetDate: member.targetDate, progressStatus: member.progressStatus, gap: member.gap, plan: member.plan, nextTask: member.nextTask });
  }

  function openEvidence(member = workspace?.myMember || null, level = nextLevelNumber, presetCriterion?: string) {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    if (!member) return;
    const definition = activeLevels.find(item => item.level === level) || nextLevelDef;
    let selectedCriterion = presetCriterion || "";
    if (!selectedCriterion && definition.criteria.length) {
      const criterionCounts = definition.criteria.map(c => ({
        id: c.id,
        count: myEvidence.filter(e => e.criterionKey === c.id && e.level === level).length
      }));
      const leastCovered = criterionCounts.sort((a, b) => a.count - b.count)[0];
      selectedCriterion = leastCovered?.id || definition.criteria[0]?.id || "";
    }
    setFormErrors({});
    setEvidenceDraft({ memberId: member.id, level, criterionKey: selectedCriterion, title: "", kind: "链接", url: "", outcome: "", nominateAsset: false, complianceConfirmed: false });
  }

  function openEvidenceEdit(item: Evidence) {
    if (!workspace?.authenticated) return;
    setFormErrors({});
    setEvidenceDraft({ id: item.id, memberId: item.memberId, level: item.level, criterionKey: item.criterionKey, title: item.title, kind: item.kind, url: item.url, outcome: item.outcome, nominateAsset: false, complianceConfirmed: false });
  }

  function openAsset() {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    const member = workspace.myMember;
    if (!member) return;
    setFormErrors({});
    setAssetDraft({ memberId: member.id, title: "", description: "", assetType: "Skill", industry: member.industry === "未分配" ? "通用" : member.industry, url: "", complianceConfirmed: false });
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
  const targetEvidence = myEvidence.filter(item => item.level === Math.min((myMember?.currentLevel ?? 0) + 1, activeLevels.length || 10));
  const currentLevel = myMember?.currentLevel ?? 0;
  const maxLevel = activeLevels.length || 10;
  const nextLevelNumber = Math.min(currentLevel + 1, maxLevel);
  const atTopLevel = currentLevel >= maxLevel;
  const nextLevelDef = activeLevels.find(level => level.level === nextLevelNumber) || activeLevels[0];
  const nextLevelEvidence = myEvidence.filter(item => item.level === nextLevelNumber);
  const latestFeedback = workspace?.reviews.find(review => review.memberId === myMember?.id && review.feedback)?.feedback || "提交后由主评人给出具体反馈";
  const canReview = workspace?.me?.role === "admin" || workspace?.me?.role === "reviewer";
  const canDecideSelected = Boolean(selectedReview && (workspace?.me?.role === "admin" || selectedReview.reviewerEmail === workspace?.me?.email));
  const currentStage = stageForLevel(myMember?.currentLevel ?? workspace?.metrics.median ?? 0, stageMeta);

  const groups = useMemo(() => ["全部", ...Array.from(new Set((workspace?.members || []).map(member => member.groupName)))], [workspace?.members]);
  const groupStats = useMemo(() => {
    const map: Record<string, { count: number; levelSum: number; checkedIn: number }> = {};
    for (const member of workspace?.members || []) {
      const entry = map[member.groupName] || (map[member.groupName] = { count: 0, levelSum: 0, checkedIn: 0 });
      entry.count += 1;
      entry.levelSum += member.currentLevel;
      if (member.checkedInThisMonth) entry.checkedIn += 1;
    }
    return Object.entries(map).map(([name, entry]) => ({ name, count: entry.count, avgLevel: (entry.levelSum / entry.count).toFixed(1), rate: Math.round(entry.checkedIn / entry.count * 100) })).sort((a, b) => b.count - a.count);
  }, [workspace?.members]);
  const reviewPulse = useMemo(() => ["已提交", "评审中", "待补证"].map(state => ({ state, count: (workspace?.reviews || []).filter(review => review.state === state).length })), [workspace?.reviews]);
  const uncheckedCount = useMemo(() => (workspace?.members || []).filter(member => !member.checkedInThisMonth).length, [workspace?.members]);
  const filteredMembers = useMemo(() => (workspace?.members || []).filter(member => {
    const matchesGroup = teamGroup === "全部" || member.groupName === teamGroup;
    const matchesLevel = teamLevelFilter === null || member.currentLevel === teamLevelFilter;
    const matchesQuery = `${member.name}${member.role}${member.nextTask}${member.groupName}`.toLowerCase().includes(teamQuery.toLowerCase());
    return matchesGroup && matchesLevel && matchesQuery;
  }).toSorted((a, b) => Number(a.checkedInThisMonth) - Number(b.checkedInThisMonth) || b.overdueTasks - a.overdueTasks || b.currentLevel - a.currentLevel), [teamGroup, teamLevelFilter, teamQuery, workspace?.members]);
  const filteredTeamMembers = useMemo(() => filteredMembers.filter(m => {
    if (teamFilter === '未更新') {
      const lastUpdate = m.updatedAt ? new Date(m.updatedAt) : null;
      return !lastUpdate || (Date.now() - lastUpdate.getTime() > 7 * 24 * 60 * 60 * 1000);
    }
    if (teamFilter === '需关注') {
      return !m.targetLevel || !m.targetDate;
    }
    return true;
  }), [filteredMembers, teamFilter]);
  const displayedMembers = filteredTeamMembers.slice(0, teamPageSize);
  const filteredAssets = useMemo(() => (workspace?.assets || []).filter(asset => {
    const matchesType = assetType === "全部" || asset.type === assetType;
    return matchesType && `${asset.title}${asset.description || ""}${asset.industry}${asset.ownerName}`.toLowerCase().includes(assetQuery.toLowerCase());
  }), [assetQuery, assetType, workspace?.assets]);
  const pendingReviewCount = useMemo(() => (workspace?.reviews || []).filter(review => review.reviewerEmail === workspace?.me?.email && ["已提交", "评审中", "待补证"].includes(review.state)).length, [workspace?.me?.email, workspace?.reviews]);
  const visibleReviews = useMemo(() => {
    const reviews = workspace?.reviews || [];
    let filtered: Review[];
    if (reviewScope === "assigned") filtered = reviews.filter(review => review.reviewerEmail === workspace?.me?.email);
    else if (reviewScope === "mine") filtered = reviews.filter(review => review.memberId === workspace?.me?.memberId);
    else filtered = reviews;
    return filtered.toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }, [reviewScope, workspace?.me, workspace?.reviews]);

  function copyUncheckedList() {
    const names = (workspace?.members || []).filter(member => !member.checkedInThisMonth).map(member => member.name);
    if (!names.length) { showToast("本月所有成员都已更新进展"); return; }
    navigator.clipboard.writeText(`本月尚未更新成长进展（${names.length} 人）：${names.join("、")}`)
      .then(() => showToast(`已复制 ${names.length} 位未更新成员名单`))
      .catch(() => showToast("复制失败，请重试"));
  }

  function exportMonthlyReport() {
    const report = workspace?.monthlyReport;
    if (!report || !workspace) return;
    const lines = [
      `# 千问计划月报 · ${report.cycle}`,
      "",
      `- 参与率：${report.participationRate}%（${report.updatedThisMonth}/${report.memberCount} 已更新进展）`,
      `- 本月晋级：${report.promotions.length} 人`,
      `- 本月新增证据：${report.newEvidenceCount} 条`,
      `- 本月新增成果：${report.newAssetCount} 项（已发布 ${report.publishedAssetCount} 项）`,
      `- 团队层级：平均 L${workspace.metrics.average} · 中位 L${workspace.metrics.median}`,
      "",
      "## 层级分布",
      "",
      ...workspace.metrics.distribution.map((count, index) => `- L${index + 1}：${count} 人`),
      "",
      "## 晋级名单",
      "",
      ...(report.promotions.length ? report.promotions.map(item => `- ${item.memberName}：L${item.fromLevel} → L${item.toLevel}（${item.createdAt.slice(0, 10)}）`) : ["- 本月暂无晋级"]),
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `千问计划月报-${report.cycle}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("月报已导出");
  }

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
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setMobileNavOpen(false); }}><Icon size={20} /><span>{label}</span>{id === "review" && pendingReviewCount > 0 ? <span className="nav-badge">{pendingReviewCount}</span> : null}</button>)}
      </nav>
      <div className="account-area">
        {workspace?.me?.role === "admin" ? <button className="icon-button settings-button" type="button" onClick={openAdmin} aria-label="管理设置"><Settings2 size={20} /></button> : null}
        {workspace?.authenticated ? <>
          <button className="account-chip" type="button" onClick={handleSignOut} title="退出登录"><span>{initials(workspace.me?.displayName || "千")}</span><span><b>{workspace.me?.displayName}</b><small>{workspace.me?.role === "admin" ? "管理员" : workspace.me?.role === "reviewer" ? "成员 · 评审人" : "成员"}</small></span></button>
        </> : <a className="header-action" href={SIGN_IN_URL}>登录后更新</a>}
      </div>
    </header>

    <section className="control-workspace">
      {loading && !workspace ? <div className="loading-screen"><span /><p>正在整理成长数据…</p></div> : null}
      {loadError && !workspace ? <div className="error-card"><p>加载失败：{loadError}</p><button className="btn btn-secondary" onClick={() => { setLoadError(null); setLoading(true); loadWorkspace().finally(() => setLoading(false)); }}>重试</button></div> : null}

      {activeView === "growth" && workspace ? <section className="workspace-view growth-view">
        <div className="page-heading compact-heading">
          <div><h1>{workspace.authenticated ? `${workspace.me?.displayName}，专注下一次升级` : "让每一次成长，都有清晰的下一步"}</h1><p className="heading-summary">{myMember ? `当前 L${myMember.currentLevel} · ${atTopLevel ? `已登顶 L${maxLevel}` : `下一级 L${nextLevelNumber}`} · ${myMember.progressStatus}` : `团队中位 L${workspace.metrics.median} · 从真实工作结果开始`}</p></div>
        </div>

        <div className="growth-focus-grid">
          <section className="growth-hero-panel">
            <div className="growth-hero-top"><span>{myMember ? "当前认证" : "团队中位层级"}</span><em>{CURRENT_CYCLE} 周期 · {currentStage.label}</em></div>
            <div className="growth-level-lockup"><strong>L{myMember?.currentLevel ?? workspace.metrics.median}</strong><div><small>{myMember ? "下一级" : "体系起点"}</small><b>{myMember ? `L${nextLevelNumber} · ${nextLevelDef.title} · ${nextLevelEvidence.filter(e => nextLevelDef.criteria.some(c => c.id === e.criterionKey)).length}/${nextLevelDef.criteria.length}已覆盖` : `L1 · ${activeLevels[0].title} · 登录后开始逐层爬坡`}</b><span>{!myMember ? "从真实工作结果开始" : atTopLevel ? "已抵达体系最高层级" : myMember.reviewStatus === "已通过" ? "已晋级，请更新进展设定新一级计划" : `计划 ${formatDate(myMember.targetDate)} 前完成`}</span></div></div>
            <div className="growth-progress" aria-label="成长进度">
              {activeLevels.map(level => <button key={level.level} className={`${myMember && myMember.currentLevel >= level.level ? "reached" : ""} ${myMember && !atTopLevel && level.level === nextLevelNumber ? "target" : ""} ${level.level === nextLevelNumber ? "next" : ""}`} onClick={() => { setFocusedLevelNumber(level.level); setActiveView("capability"); }} aria-label={`查看 L${level.level} ${level.title}`}><i /><span>L{level.level}</span></button>)}
            </div>
            <div className="growth-hero-footer"><span><small>证据</small><b>{myMember ? `${nextLevelEvidence.length} / ${nextLevelDef.criteria.length}` : `${workspace.metrics.evidenceCompletion}%`}</b></span><span><small>评审状态</small><b>{myMember?.reviewStatus || `${workspace.metrics.pendingReviews} 项进行中`}</b></span>{myMember?.gap ? <span><small>差距摘要</small><b>{myMember.gap.substring(0, 30)}{myMember.gap.length > 30 ? "…" : ""}</b></span> : null}{myMember?.updatedAt ? <span><small>最后更新</small><b>{formatDate(myMember.updatedAt)}</b></span> : null}<span className="footer-actions"><button className="text-link" onClick={() => { setFocusedLevelNumber(nextLevelNumber); setActiveView("capability"); }}>查看目标标准 <ChevronRight size={16} /></button>{workspace.authenticated && myMember ? <button className="ghost-action" onClick={() => openCheckin(myMember)}>更新成长进展</button> : null}</span></div>
          </section>

          <aside className="next-action-card">
            <div className="panel-heading"><div><h2>当前只推进这一件事</h2></div><span className={myMember?.overdueTasks ? "risk-dot" : "ok-dot"} /></div>
            <h3>{myMember?.nextTask || "完成首次能力定位，并添加一条真实工作证据"}</h3>
            <div className="action-meta"><span><Clock3 size={16} />{formatDate(myMember?.targetDate || "2026-09-30")}</span><span><Gauge size={16} />{myMember?.progressStatus || "进行中"}</span></div>
            {workspace.authenticated ? <button className={`primary-action full${myEvidence.length === 0 ? ' pulse-animation' : ''}`} onClick={() => openEvidence()}>添加 L{nextLevelNumber} 证据 <Plus size={16} /></button> : null}
          </aside>
        </div>

        <div className="growth-detail-grid">
          <section className="target-criteria-card">
            <div className="panel-heading"><div><h2>L{nextLevelNumber} 通关清单</h2><p>达成后即可选择主评人提交</p></div><b>{nextLevelEvidence.length}/{nextLevelDef.criteria.length}</b></div>
            <div className="criteria-checklist">{nextLevelDef.criteria.map((criterion, index) => { const evidence = nextLevelEvidence.find(item => item.criterionKey === criterion.id); return <button key={criterion.id} onClick={() => { if (evidence) { openEvidenceEdit(evidence); } else { openEvidence(myMember, nextLevelNumber, criterion.id); } }}><span className={evidence ? "done" : ""}>{evidence ? <Check size={16} /> : index + 1}</span><span><b>{criterion.label}</b>{evidence ? <span className="criterion-evidence"><Paperclip size={16} /> {evidence.title} <span className={`tone-${evidence.status || 'draft'}`} aria-label={`证据状态：${evidence.status || '草稿'}`}>{evidence.status || '草稿'}</span></span> : <small>{criterion.evidenceHint}</small>}</span><em>{evidence ? evidence.status : "待举证"}</em></button>; })}</div>
            {(() => { const activeReview = workspace.reviews.find(review => review.memberId === myMember?.id && ["已提交", "评审中", "待补证"].includes(review.state)); if (activeReview || myMember?.pendingReviewId) { return <button type="button" className="checklist-ready is-pending-review" onClick={() => { setReviewScope("mine"); setActiveView("review"); }}><Clock3 size={16} /> 晋级申请进行中 · {activeReview?.state || myMember?.reviewStatus} <ChevronRight size={16} /></button>; } const coveredCriteria = nextLevelDef.criteria.filter(c => nextLevelEvidence.some(e => e.criterionKey === c.id)); const total = nextLevelDef.criteria.length; const covered = coveredCriteria.length; if (covered >= total && total > 0) { return <button type="button" className="checklist-ready" onClick={() => { setReviewerEmail(""); setSubmitSuccess(false); setFormErrors({}); setReviewSubmitOpen(true); }}><CheckCircle size={16} /> 可提交晋级申请 <ArrowRight size={16} /></button>; } return <div className="checklist-pending">还需 {total - covered} 条证据覆盖通关标准</div>; })()}
          </section>
          <aside className="feedback-card"><UserRoundCheck size={20} /><span className="eyebrow">LATEST FEEDBACK</span><h2>最近反馈</h2><p>{latestFeedback}</p><button className="text-link" onClick={() => setActiveView("review")}>查看评审记录 <ChevronRight size={16} /></button></aside>
        </div>
      </section> : null}

      {activeView === "capability" && workspace ? <section className="workspace-view capability-view">
        <div className="page-heading"><div><h1>能力阶梯</h1></div><div className="framework-badge"><BadgeCheck size={16} /><span><small>当前版本</small><b>{workspace.framework.published.versionName}</b></span></div></div>
        <div className="stage-legend">{stageMeta.map(stage => <span key={stage.label}><i style={{ background: stage.color }} />{stage.label}<small>{stage.range}</small></span>)}</div>
        <div className="ladder-map" aria-label="能力阶梯">
          {activeLevels.map(level => <button key={level.level} className={`${focusedLevel.level === level.level ? "active" : ""} ${myMember?.currentLevel === level.level ? "current" : ""} ${!atTopLevel && level.level === nextLevelNumber ? "target" : ""}`} style={{ "--step": level.level, "--stage": stageForLevel(level.level, stageMeta).color } as CSSProperties} onClick={() => setFocusedLevelNumber(level.level)}><span>L{level.level}</span><b>{level.title}</b><small>{level.stage}</small>{myMember?.currentLevel === level.level ? <em>当前</em> : (!atTopLevel && level.level === nextLevelNumber) ? <em>下一级</em> : null}</button>)}
        </div>
        <div className="capability-detail" style={{ "--stage": stageForLevel(focusedLevel.level, stageMeta).color } as CSSProperties}>
          <div className="capability-title"><span>{focusedLevel.stage} · {focusedLevel.role}</span><strong>L{focusedLevel.level}</strong><h2>{focusedLevel.title}</h2><p>{focusedLevel.definition}</p><div className="standard-callout"><small>认证标准</small><b>{focusedLevel.standard}</b></div><div className="capability-actions"><button className="primary-action" onClick={() => openEvidence(myMember, focusedLevel.level)}>添加证据 <Plus size={16} /></button><button className="secondary-action" onClick={() => setLevelGuide(focusedLevel)}>查看完整指南</button></div></div>
          <div className="criteria-panel"><div className="panel-heading"><div><h3>通关标准</h3><p>{selectedLevelEvidence.length} 条个人证据已关联</p></div></div>{focusedLevel.criteria.map((criterion, index) => { const evidence = selectedLevelEvidence.find(item => item.criterionKey === criterion.id); return <div className="criterion-row" key={criterion.id}><span className={evidence ? "done" : ""}>{evidence ? <Check size={16} /> : index + 1}</span><div><b>{criterion.label}</b><small>{evidence?.title || criterion.evidenceHint}</small></div><em>{evidence ? evidence.status : "待举证"}</em></div>; })}</div>
          <aside className="resource-preview"><BookOpen size={20} /><h3>实践与资源</h3><ul>{focusedLevel.practices.slice(0, 3).map(item => <li key={item}><Check size={16} />{item}</li>)}</ul>{focusedLevel.resources.slice(0, 2).map(resource => <a key={resource.label} href={resource.url} target="_blank" rel="noreferrer">{resource.label}<ExternalLink size={16} /></a>)}</aside>
        </div>
      </section> : null}

      {activeView === "review" && workspace ? <section className="workspace-view review-view">
        <div className="page-heading"><div><h1>评审中心</h1><p className="heading-summary">{CURRENT_CYCLE} 周期 · {myMember?.pendingReviewId ? `进行中（${myMember.reviewStatus}）` : `${visibleReviews.length} 条记录`}</p></div></div>
        <div className="review-scope-tabs" role="tablist">
          <button className={reviewScope === "mine" ? "active" : ""} onClick={() => setReviewScope("mine")}>我的申请</button>
          {canReview ? <button className={reviewScope === "assigned" ? "active" : ""} onClick={() => setReviewScope("assigned")}>我的待评 <em>{workspace.reviews.filter(review => review.reviewerEmail === workspace.me?.email && ["已提交", "评审中", "待补证"].includes(review.state)).length}</em></button> : null}
          {workspace.me?.role === "admin" ? <button className={reviewScope === "all" ? "active" : ""} onClick={() => setReviewScope("all")}>全部评审</button> : null}
        </div>
        <section className="review-board">
          <div className="review-board-head"><span>申请人与目标</span><span>材料</span><span>状态</span><span>主评人</span><span>提交时间</span><span /></div>
          <div className="review-board-body">{visibleReviews.map(review => <button className="review-row" key={review.id} onClick={() => { setSelectedReview(review); setReviewFeedback(review.feedback || ""); setReviewDecision(review.state === "待补证" ? "待补证" : "已通过"); }}><span className="person-cell"><i className="member-avatar">{initials(review.memberName)}</i><span><b>{review.memberName}</b><small>L{review.fromLevel} → L{review.targetLevel}</small></span></span><span><b>{review.evidenceCount}</b><small>条证据</small></span><span><em className={`state-label ${toneClass(review.state)}`} aria-label={`评审状态：${review.state}`}>{review.state}</em></span><span>{review.reviewerName}</span><span>{formatDate(review.submittedAt)}{reviewStaleDays(review) > 3 ? <em className="stale-label">滞留 {reviewStaleDays(review)} 天</em> : null}</span><ChevronRight size={16} /></button>)}{!visibleReviews.length ? <EmptyState icon={<ClipboardCheck size={20} />} title={workspace.authenticated ? "这里还没有记录" : "登录后查看评审记录"} copy={reviewScope === "assigned" ? "暂无待评申请，已完成的评审可在「我的申请」或「全部评审」中查看。" : "添加下一级证据后，即可发起第一次晋级申请。"} action={!workspace.authenticated ? <a className="primary-action" href={SIGN_IN_URL}>登录查看</a> : undefined} /> : null}</div>
        </section>
        <div className="review-principles"><span><ShieldCheck size={20} /><b>认证层级不可自改</b></span><span><Clock3 size={20} /><b>建议 3 天内完成</b></span><span><UserRoundCheck size={20} /><b>一位主评人负责到底</b></span></div>
      </section> : null}

      {activeView === "team" && workspace ? <section className="workspace-view team-view">
        <div className="page-heading"><div><h1>团队</h1></div><div className="heading-metrics"><span><b>{workspace.metrics.updatedThisMonth}/{workspace.metrics.memberCount}</b><small>本月已更新</small></span><span><b>{workspace.metrics.atRisk}</b><small>需关注</small></span><span><b>{workspace.assets.filter(item => item.reviewStatus === "已发布").length}</b><small>成果</small></span></div></div>
        <div className="section-tabs">{workspace.monthlyReport ? <button className={teamTab === "report" ? "active" : ""} onClick={() => setTeamTab("report")}><Gauge size={20} />团队分析</button> : null}<button className={teamTab === "members" ? "active" : ""} onClick={() => setTeamTab("members")}><Users size={20} />成员概览</button><button className={teamTab === "assets" ? "active" : ""} onClick={() => setTeamTab("assets")}><Library size={20} />成果库</button></div>
        {teamTab === "members" ? <>
          <div className="team-toolbar"><label className="search-field"><Search size={20} /><input value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="搜索成员、岗位或任务" /></label><div className="segmented-filter">{groups.map(item => <button key={item} className={teamGroup === item ? "active" : ""} onClick={() => setTeamGroup(item)}>{item}</button>)}</div>{workspace.me?.role === "admin" ? <button className="secondary-action" onClick={copyUncheckedList}>复制未更新名单</button> : null}</div>
          <div className="team-filters">{['全部', '未更新', '需关注'].map(filter => (<button key={filter} className={`btn btn-text ${teamFilter === filter ? 'active' : ''}`} onClick={() => { setTeamFilter(filter); setTeamPageSize(20); }}>{filter}</button>))}{teamLevelFilter !== null ? <button className="btn btn-text active" onClick={() => setTeamLevelFilter(null)}>层级 L{teamLevelFilter} ×</button> : null}</div>
          <section className="team-table-panel"><div className="team-table-head team-table-4col"><span>成员</span><span>层级</span><span>状态</span><span>操作</span></div><div className="team-table-body">{displayedMembers.map(member => <button className="team-row team-row-4col" key={member.id} onClick={() => setSelectedMember(member)}><span className="person-cell"><i className={`member-avatar industry-${member.industry}`}>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.role} · {member.groupName}</small></span></span><span className="level-triplet"><b>L{member.currentLevel}</b><em className="arrow">→</em><em>L{Math.min(member.currentLevel + 1, activeLevels.length || 10)}</em></span><span>{!member.checkedInThisMonth ? <em className="risk-label">本月未更新</em> : member.overdueTasks ? <em className="risk-label">逾期 {member.overdueTasks}</em> : <em className={`state-label ${toneClass(member.progressStatus)}`} aria-label={`推进状态：${member.progressStatus}`}>{member.progressStatus}</em>}</span><ChevronRight size={16} /></button>)}{!displayedMembers.length ? <EmptyState icon={<Users size={20} />} title="没有符合条件的成员" copy="调整搜索或小组筛选后重试。" /> : null}</div></section>
          {teamPageSize < filteredTeamMembers.length && (<button className="btn btn-text" onClick={() => setTeamPageSize(prev => prev + 20)}>加载更多（还有 {filteredTeamMembers.length - teamPageSize} 人）</button>)}
        </> : teamTab === "assets" ? <>
          <div className="asset-summary"><span><b>{workspace.assets.length}</b><small>团队成果</small></span><span><b>{workspace.assets.filter(item => ["待审核", "审核中"].includes(item.reviewStatus)).length}</b><small>待审核</small></span><span><b>{workspace.assets.reduce((sum, item) => sum + item.reusePeople, 0)}</b><small>内部复用人次</small></span><button className="primary-action" onClick={openAsset}>提交成果 <Plus size={16} /></button></div>
          <div className="asset-toolbar"><label className="search-field"><Search size={20} /><input value={assetQuery} onChange={event => setAssetQuery(event.target.value)} placeholder="搜索成果、行业或作者" /></label><div className="segmented-filter">{["全部", "Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <button key={item} className={assetType === item ? "active" : ""} onClick={() => setAssetType(item)}>{item}</button>)}</div></div>
          {workspace.me?.role === "admin" && selectedAssets.length > 0 && <div className="batch-actions"><span>已选 {selectedAssets.length} 项</span><button className="primary-action" disabled={busy} onClick={async () => { for (const id of selectedAssets) { await mutate({ action: "review_asset", assetId: Number(id), decision: "已发布" }, ""); } setSelectedAssets([]); showToast(`已批量发布 ${selectedAssets.length} 项成果`); }}>全部发布</button><button className="secondary-action" disabled={busy} onClick={async () => { const reason = window.prompt("请填写退回原因（将应用于所选成果）")?.trim(); if (!reason) return; for (const id of selectedAssets) { await mutate({ action: "review_asset", assetId: Number(id), decision: "待补充", feedback: reason }, ""); } setSelectedAssets([]); showToast(`已批量退回 ${selectedAssets.length} 项成果`); }}>全部退回</button></div>}
          <div className="assets-grid"><section className="asset-library-panel"><div className="asset-list">{filteredAssets.map(asset => <div key={asset.id} className="asset-row-wrapper">{workspace.me?.role === "admin" && ["待审核", "审核中"].includes(asset.reviewStatus) && <input type="checkbox" checked={selectedAssets.includes(String(asset.id))} onChange={e => { if (e.target.checked) { setSelectedAssets(prev => [...prev, String(asset.id)]); } else { setSelectedAssets(prev => prev.filter(id => id !== String(asset.id))); } }} />}<AssetRow asset={asset} isAdmin={workspace.me?.role === "admin"} myMemberId={workspace.me?.memberId ?? null} onReview={(decision, feedback) => mutate({ action: "review_asset", assetId: asset.id, decision, feedback }, `成果已更新为“${decision}”`)} onResubmit={() => mutate({ action: "resubmit_asset", assetId: asset.id }, "成果已重新提交审核")} onWithdraw={() => mutate({ action: "withdraw_asset", assetId: asset.id }, "成果已撤回，可在成果库中重新提交")} busy={busy} /></div>)}{!filteredAssets.length ? <EmptyState icon={<Library size={20} />} title="没有符合条件的成果" copy="调整搜索或类型筛选后重试。" /> : null}</div></section><aside className="anchor-panel"><div className="panel-heading"><div><h2>行业实战锚点</h2><p>成果从真实业务任务中沉淀</p></div><BookOpen size={20} /></div>{industryAnchors.map(anchor => <button key={anchor.name} onClick={() => setSelectedAnchor(anchor)}><span><b>{anchor.name}</b><small>{anchor.items.length} 项锚点任务</small></span><ChevronRight size={16} /></button>)}</aside></div>
        </> : workspace.monthlyReport ? <>
          <div className="report-summary">
            <button className="analytics-kpi" onClick={() => { setTeamTab("members"); setTeamFilter("未更新"); setTeamPageSize(20); }} aria-label="查看未更新成员"><b>{workspace.monthlyReport.participationRate}%</b><small>参与率（{workspace.monthlyReport.updatedThisMonth}/{workspace.monthlyReport.memberCount}）</small>{uncheckedCount > 0 ? <em className="kpi-hint">未更新 {uncheckedCount} 人 →</em> : null}</button>
            <span><b>{workspace.monthlyReport.promotions.length}</b><small>本月晋级</small></span>
            <span><b>{workspace.monthlyReport.newEvidenceCount}</b><small>本月新增证据</small></span>
            <span><b>{workspace.monthlyReport.newAssetCount}</b><small>本月新增成果</small></span>
            <button className="secondary-action" onClick={exportMonthlyReport}>导出报告 <ExternalLink size={16} /></button>
          </div>
          <div className="analytics-grid">
            <section className="analytics-card">
              <div className="panel-heading"><div><h2>层级分布</h2><p>点击层级查看成员 · 平均 L{workspace.metrics.average} · 中位 L{workspace.metrics.median}</p></div></div>
              <div className="distribution-chart" aria-label={`团队层级分布：${workspace.metrics.distribution.map((count, index) => `L${index + 1} ${count}人`).join('，')}`}>{workspace.metrics.distribution.map((count, index) => { const maxCount = Math.max(...workspace.metrics.distribution, 1); return <button key={index} className="distribution-col" onClick={() => { setTeamLevelFilter(prev => prev === index + 1 ? null : index + 1); setTeamTab("members"); setTeamPageSize(20); }} aria-label={`查看 L${index + 1} 成员，共 ${count} 人`}><b>{count || ""}</b><i style={{ height: `${Math.max(count / maxCount * 100, count ? 8 : 2)}%` }} /><span>L{index + 1}</span></button>; })}</div>
            </section>
            <section className="analytics-card">
              <div className="panel-heading"><div><h2>小组对比</h2><p>本月更新率 · 点击小组查看成员</p></div><Users size={20} /></div>
              <div className="group-compare-list">{groupStats.map(group => <button key={group.name} className="group-compare-row" onClick={() => { setTeamGroup(group.name); setTeamTab("members"); setTeamPageSize(20); }}><span className="group-name"><b>{group.name}</b><small>{group.count} 人 · 平均 L{group.avgLevel}</small></span><span className="group-rate"><i style={{ width: `${group.rate}%` }} /></span><em>{group.rate}%</em></button>)}</div>
            </section>
            <section className="analytics-card">
              <div className="panel-heading"><div><h2>评审动态</h2><p>进行中的晋级申请 · 点击跳转评审中心</p></div><ClipboardCheck size={20} /></div>
              <div className="review-pulse-grid">{reviewPulse.map(item => <button key={item.state} className="review-pulse-card" onClick={() => { setReviewScope(workspace.me?.role === "admin" ? "all" : canReview ? "assigned" : "mine"); setActiveView("review"); }} aria-label={`${item.state} ${item.count} 项，前往评审中心`}><span className={`pulse-dot ${toneClass(item.state)}`} /><b>{item.count}</b><small>{item.state}</small></button>)}</div>
            </section>
            <section className="analytics-card">
              <div className="panel-heading"><div><h2>本月晋级名单</h2><p>{workspace.monthlyReport.cycle} 周期通过评审的晋级</p></div><BadgeCheck size={20} /></div>
              {workspace.monthlyReport.promotions.length ? <div className="promotion-list">{workspace.monthlyReport.promotions.map(item => <button className="promotion-row" key={item.id} onClick={() => { const member = workspace.members.find(entry => entry.name === item.memberName); if (member) setSelectedMember(member); }}><span className="member-avatar">{initials(item.memberName)}</span><span><b>{item.memberName}</b><small>{formatDate(item.createdAt)}</small></span><em>L{item.fromLevel} → L{item.toLevel}</em></button>)}</div> : <EmptyState icon={<BadgeCheck size={20} />} title="本月暂无晋级" copy="通过评审的晋级会出现在这里。" />}
            </section>
          </div>
        </> : <EmptyState icon={<Gauge size={20} />} title="团队分析数据生成中" copy="本月首个成员更新进展后，这里会展示团队仪表盘。" />}
      </section> : null}
    </section>

    {onboardingDraft ? <DialogFrame title="欢迎加入千问计划" onClose={() => setOnboardingDraft(null)} size="wide"><div className="dialog-form">
      <div className="dialog-heading"><span>WELCOME · STEP {onboardingDraft.step}/2</span><h2>{onboardingDraft.step === 1 ? "先告诉我们你在哪里" : "写下你的下一步行动"}</h2></div>
      <div className="onboarding-steps" aria-hidden="true">{[1, 2].map(step => <span key={step} className={onboardingDraft.step >= step ? "active" : ""} />)}</div>
      {onboardingDraft.step === 1 ? <div className="form-grid"><label>所属小组<input value={onboardingDraft.groupName} onChange={event => setOnboardingDraft({ ...onboardingDraft, groupName: event.target.value })} placeholder="例如：能源组" /></label><label>主要行业<select value={onboardingDraft.industry} onChange={event => setOnboardingDraft({ ...onboardingDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div> : null}
      {onboardingDraft.step === 2 ? <><label><FieldLabel text="下一步行动" required /><input value={onboardingDraft.nextTask} onChange={event => { setOnboardingDraft({ ...onboardingDraft, nextTask: event.target.value }); setFormErrors(prev => { const { onboardingNextTask, ...rest } = prev; return rest; }); }} onBlur={event => { if (!event.target.value.trim()) setFormErrors(prev => ({ ...prev, onboardingNextTask: "此字段为必填" })); }} placeholder="例如：用 AI 完成一次客户拜访前的情报汇总" aria-invalid={!!formErrors.onboardingNextTask} aria-describedby={formErrors.onboardingNextTask ? "onboarding-next-task-error" : undefined} />{formErrors.onboardingNextTask ? <span id="onboarding-next-task-error" className="field-error">{formErrors.onboardingNextTask}</span> : null}</label><label><FieldLabel text="下一级计划完成日期" required /><input type="date" min={TODAY} value={onboardingDraft.targetDate} aria-invalid={!!formErrors.onboardingDate} aria-describedby={formErrors.onboardingDate ? "onboarding-date-error" : undefined} onChange={event => { setOnboardingDraft({ ...onboardingDraft, targetDate: event.target.value }); setFormErrors(prev => { const { onboardingDate, ...rest } = prev; return rest; }); }} />{formErrors.onboardingDate ? <span id="onboarding-date-error" className="field-error">{formErrors.onboardingDate}</span> : null}</label></> : null}
      <div className="form-actions">
        {onboardingDraft.step > 1 ? <button type="button" className="secondary-action" onClick={() => setOnboardingDraft({ ...onboardingDraft, step: onboardingDraft.step - 1 })}>上一步</button> : <button type="button" className="secondary-action" onClick={() => setOnboardingDraft(null)}>稍后完成</button>}
        {onboardingDraft.step < 2 ? <button type="button" className="primary-action" onClick={() => setOnboardingDraft({ ...onboardingDraft, step: onboardingDraft.step + 1 })}>下一步 <ArrowRight size={16} /></button> : <button type="button" className="primary-action" disabled={busy || !onboardingDraft.nextTask.trim()} onClick={async () => { if (onboardingDraft.targetDate && onboardingDraft.targetDate < TODAY) { setFormErrors(prev => ({ ...prev, onboardingDate: "完成日期不能早于今天" })); return; } const ok = await mutate({ action: "complete_onboarding", groupName: onboardingDraft.groupName, industry: onboardingDraft.industry, targetDate: onboardingDraft.targetDate, nextTask: onboardingDraft.nextTask }, "欢迎加入千问计划，成长档案已建立"); if (ok) { setOnboardingDraft(null); openEvidence(workspace?.myMember, nextLevelNumber); } }}>{busy ? "保存中…" : "完成引导"}</button>}
      </div>
    </div></DialogFrame> : null}

    {checkinDraft ? <DialogFrame title="更新成长进展" onClose={() => setCheckinDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); if (checkinDraft.targetDate && checkinDraft.targetDate < TODAY) { setFormErrors(prev => ({ ...prev, checkinDate: "完成日期不能早于今天" })); return; } const ok = await mutate({ action: "update_checkin", ...checkinDraft }, "进展已更新"); if (ok) setCheckinDraft(null); }}>
      <div className="dialog-heading"><span>PERSONAL CHECK-IN</span><h2>更新成长进展</h2></div>
      <div className="certified-banner"><BadgeCheck size={20} /><span><small>当前认证层级</small><b>L{workspace?.members.find(item => item.id === checkinDraft.memberId)?.currentLevel ?? 0} · 下一级 L{nextLevelNumber} · 逐层爬坡</b></span></div>
      <div className="form-section-label">本次进展<small>建议每周更新一次</small></div>
      <div className="form-grid"><label><FieldLabel text="推进状态" required /><select value={checkinDraft.progressStatus} onChange={event => setCheckinDraft({ ...checkinDraft, progressStatus: event.target.value })}>{["正常", "进行中", "有风险", "阻塞"].map(status => <option key={status}>{status}</option>)}</select></label><label><FieldLabel text="下一级计划完成日期" required /><input type="date" min={TODAY} value={checkinDraft.targetDate} aria-invalid={!!formErrors.checkinDate} aria-describedby={formErrors.checkinDate ? "checkin-date-error" : undefined} onChange={event => { setCheckinDraft({ ...checkinDraft, targetDate: event.target.value }); setFormErrors(prev => { const { checkinDate, ...rest } = prev; return rest; }); }} />{formErrors.checkinDate ? <span id="checkin-date-error" className="field-error">{formErrors.checkinDate}</span> : null}</label></div>
      <label>下一步任务<input value={checkinDraft.nextTask} onChange={event => setCheckinDraft({ ...checkinDraft, nextTask: event.target.value })} placeholder="当前最重要的一件事" /></label>
      <label>当前差距<textarea rows={3} value={checkinDraft.gap} onChange={event => setCheckinDraft({ ...checkinDraft, gap: event.target.value })} placeholder="对照下一级标准，描述还缺少什么" /></label>
      <label>本月行动计划<textarea rows={3} value={checkinDraft.plan} onChange={event => setCheckinDraft({ ...checkinDraft, plan: event.target.value })} placeholder="写清楚具体动作、截止时间与业务场景" /></label>
      <div className="form-actions"><button type="button" className="secondary-action" onClick={() => setCheckinDraft(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存更新"}</button></div>
    </form></DialogFrame> : null}

    {evidenceDraft ? <DialogFrame title={evidenceDraft.id ? "编辑晋级证据" : "添加晋级证据"} onClose={() => setEvidenceDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = evidenceDraft.id ? await mutate({ action: "update_evidence", evidenceId: evidenceDraft.id, level: evidenceDraft.level, criterionKey: evidenceDraft.criterionKey, title: evidenceDraft.title, kind: evidenceDraft.kind, url: evidenceDraft.url, outcome: evidenceDraft.outcome }, "证据已更新，重新进入待核验") : await mutate({ action: "add_evidence", ...evidenceDraft }, evidenceDraft.nominateAsset ? "证据已添加，并推荐到团队成果库" : "证据已添加，等待评审核验"); if (ok) setEvidenceDraft(null); }}>
      <div className="dialog-heading"><span>EVIDENCE</span><h2>{evidenceDraft.id ? "编辑" : "添加"} L{evidenceDraft.level} 晋级证据</h2></div>
      {evidenceDraft.level !== nextLevelNumber && <div className="level-hint">当前填写的是 L{evidenceDraft.level} 证据，你的下一级是 L{nextLevelNumber}</div>}
      <div className="form-grid"><label>证据层级<select value={evidenceDraft.level} onChange={event => { const level = Number(event.target.value); const definition = activeLevels.find(item => item.level === level)!; setEvidenceDraft({ ...evidenceDraft, level, criterionKey: definition.criteria[0]?.id || "" }); }}>{activeLevels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label></div>
      <label><FieldLabel text="关联通关标准" required /><select value={evidenceDraft.criterionKey} onChange={event => setEvidenceDraft({ ...evidenceDraft, criterionKey: event.target.value })}>{activeLevels.find(item => item.level === evidenceDraft.level)?.criteria.map(criterion => <option key={criterion.id} value={criterion.id}>{criterion.label}</option>)}</select></label>
      <label><FieldLabel text="证据标题" required /><input required value={evidenceDraft.title} onChange={event => setEvidenceDraft({ ...evidenceDraft, title: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({...prev, title: '此字段为必填'})); } else { setFormErrors(prev => {const {title, ...rest} = prev; return rest;}); } }} placeholder="例如：MES 测试环境集成 POC 复盘" aria-describedby={formErrors.title ? "title-error" : undefined} aria-invalid={!!formErrors.title} />{formErrors.title && <span id="title-error" className="field-error">{formErrors.title}</span>}</label>
      <label><FieldLabel text="业务结果" required /><textarea required rows={4} value={evidenceDraft.outcome} onChange={event => setEvidenceDraft({ ...evidenceDraft, outcome: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({...prev, outcome: '此字段为必填'})); } else { setFormErrors(prev => {const {outcome, ...rest} = prev; return rest;}); } }} placeholder={(evidenceDraft.level || nextLevelNumber) <= 3 ? "说明提效效果，如：节省了多少时间/减少了多少错误" : (evidenceDraft.level || nextLevelNumber) <= 6 ? "说明客户价值，如：帮助客户解决了什么问题" : "说明行业影响，如：推动了什么标准/影响了多少组织"} aria-describedby={formErrors.outcome ? "outcome-error" : undefined} aria-invalid={!!formErrors.outcome} />{formErrors.outcome && <span id="outcome-error" className="field-error">{formErrors.outcome}</span>}</label>
      <details className="evidence-more"><summary>更多信息（可选）</summary>
        <label>证据类型<select value={evidenceDraft.kind} onChange={event => setEvidenceDraft({ ...evidenceDraft, kind: event.target.value })}>{["链接", "报告", "仓库", "演示", "使用记录", "客户反馈"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>材料链接<input type="url" value={evidenceDraft.url} onChange={event => setEvidenceDraft({ ...evidenceDraft, url: event.target.value })} placeholder="https://…（可选）" /></label>
      </details>
      {!evidenceDraft.id ? <label className="switch-row"><input type="checkbox" checked={evidenceDraft.nominateAsset} onChange={event => setEvidenceDraft({ ...evidenceDraft, nominateAsset: event.target.checked, complianceConfirmed: false })} /><span><b>推荐沉淀为团队成果</b><small>管理员审核发布后，团队可检索复用，并可作为 L6+ 资产证据。</small></span></label> : null}
      {evidenceDraft.nominateAsset ? <label className="compliance-check"><input type="checkbox" checked={evidenceDraft.complianceConfirmed} onChange={event => setEvidenceDraft({ ...evidenceDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户、人名和真实数据已脱敏，密钥与内网地址已剥离。</small></span></label> : null}
      {submitError && <div className="field-error">提交失败，请重试</div>}
      <div className="form-actions">{evidenceDraft.id ? <button type="button" className="danger-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "delete_evidence", evidenceId: evidenceDraft.id }, "证据已删除"); if (ok) setEvidenceDraft(null); }}>删除证据</button> : null}<button type="button" className="secondary-action" onClick={() => setEvidenceDraft(null)}>取消</button><button className="primary-action" disabled={busy || !evidenceDraft.title?.trim() || !evidenceDraft.outcome?.trim() || (evidenceDraft.nominateAsset && !evidenceDraft.complianceConfirmed)}>{busy ? "保存中…" : evidenceDraft.id ? "保存修改" : "添加证据"}</button></div>
    </form></DialogFrame> : null}

    {reviewSubmitOpen && myMember ? <DialogFrame title="提交晋级申请" onClose={() => { setReviewSubmitOpen(false); setSubmitSuccess(false); }} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "submit_review", memberId: myMember.id, reviewerEmail }, ""); if (ok) { setSubmitSuccess(true); setTimeout(() => { setReviewSubmitOpen(false); setSubmitSuccess(false); showToast("晋级申请已提交给主评人"); }, 2500); } }}>{submitSuccess ? <div className="submit-success"><CheckCircle size={48} className="success-icon" /><h3>已提交，等待评审</h3><p>主评人将在 3 个工作日内开始评审</p></div> : <><div className="dialog-heading"><span>PROMOTION REVIEW</span><h2>确认申请材料并选择主评人</h2></div><div className="review-detail-summary"><span><small>申请路径</small><b>L{myMember.currentLevel} → L{nextLevelNumber}</b></span><span><small>下一级计划完成日期</small><b>{formatDate(myMember.targetDate)}</b></span><span><small>下一级证据</small><b>{targetEvidence.length} 条</b></span></div><p className="dialog-hint">目标级别由系统按逐级爬坡规则自动锁定为下一级</p><ReviewMaterialPanel levelDef={activeLevels.find(level => level.level === nextLevelNumber)} evidences={targetEvidence} />{!targetEvidence.length ? <div className="readonly-notice"><CircleAlert size={20} /><span>至少添加 1 条 L{nextLevelNumber} 证据后才能提交评审。</span></div> : null}<div className="form-section-label"><FieldLabel text="选择主评人" required /><small>评审人只处理分配给自己的申请</small></div><div className="reviewer-options">{workspace?.reviewers.filter(reviewer => reviewer.memberId !== myMember.id).map(reviewer => <label key={reviewer.email} className={reviewerEmail === reviewer.email ? "selected" : ""}><input type="radio" name="reviewer" value={reviewer.email} checked={reviewerEmail === reviewer.email} onChange={() => setReviewerEmail(reviewer.email)} /><span className="member-avatar">{initials(reviewer.displayName)}</span><span><b>{reviewer.displayName}</b><small>{reviewer.groupName} · {reviewer.role === "admin" ? "管理员" : "评审人"}</small></span><em>{reviewer.pendingCount} 项待评</em></label>)}</div>{!workspace?.reviewers.some(reviewer => reviewer.memberId !== myMember.id) ? <div className="readonly-notice"><CircleAlert size={20} /><span>目前没有可选主评人，请联系管理员先为一位成员开启评审权限。</span></div> : null}<div className="form-actions"><button type="button" className="secondary-action" onClick={() => setReviewSubmitOpen(false)}>取消</button><button className="primary-action" disabled={busy || !reviewerEmail || !targetEvidence.length}>{busy ? "提交中…" : "确认提交"}</button></div></>}</form></DialogFrame> : null}

    {selectedReview ? <DialogFrame title={`${selectedReview.memberName} 的晋级评审`} onClose={() => setSelectedReview(null)} size="wide"><div className="dialog-form"><div className="dialog-heading"><span>REVIEW DECISION</span><h2>{selectedReview.memberName} · L{selectedReview.fromLevel} → L{selectedReview.targetLevel}</h2></div><div className="review-detail-summary"><span><small>当前状态</small><b>{selectedReview.state}</b></span><span><small>主评人</small><b>{selectedReview.reviewerName}</b></span><span><small>提交时间</small><b>{formatDate(selectedReview.submittedAt)}</b></span></div><p className="dialog-hint">目标级别由系统按逐级爬坡规则自动锁定为下一级</p>{selectedReview.state === "已通过" ? (selectedReview.memberId === workspace?.me?.memberId ? <div className="promotion-note"><BadgeCheck size={20} /><span>你已晋级至 L{Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，去『我的成长』更新下一级进展</span><button type="button" className="text-link" onClick={() => { setSelectedReview(null); setActiveView("growth"); }}>前往更新 <ChevronRight size={16} /></button></div> : <div className="promotion-note"><BadgeCheck size={20} /><span>成员已晋级至 L{Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，请提醒其更新下一级进展</span></div>) : null}<ReviewMaterialPanel levelDef={activeLevels.find(level => level.level === selectedReview.targetLevel)} evidences={workspace?.evidences.filter(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel) || []} />{selectedReview.state === "待补证" && (() => { const reviewLevelDef = activeLevels.find(l => l.level === selectedReview.targetLevel); const reviewEvidences = workspace?.evidences.filter(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel) || []; const missingCriteria = reviewLevelDef?.criteria.filter(c => !reviewEvidences.some(e => e.criterionKey === c.id)) || []; return missingCriteria.length > 0 ? <div className="missing-criteria"><p>需补充以下标准的证据：</p><ul>{missingCriteria.map(c => <li key={c.id}><span>{c.label}</span>{selectedReview.memberId === workspace?.me?.memberId ? <button className="text-link" onClick={() => { setSelectedReview(null); openEvidence(myMember, selectedReview.targetLevel, c.id); }}>直接补充该证据 →</button> : null}</li>)}</ul></div> : null; })()}{selectedReview.feedback ? <div className="feedback-box"><UserRoundCheck size={20} /><div><small>已有反馈</small><p>{selectedReview.feedback}</p></div></div> : null}{selectedReview.memberId === workspace?.me?.memberId && ["已提交", "评审中", "待补证"].includes(selectedReview.state) ? (() => { const feedbackBaseline = selectedReview.reviewedAt || selectedReview.submittedAt; const hasFreshEvidence = (workspace?.evidences || []).some(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel && item.createdAt > feedbackBaseline); return <>{selectedReview.state === "待补证" && !hasFreshEvidence ? <div className="readonly-notice"><CircleAlert size={20} /><span>反馈后暂无新增证据，请先补充新证据后再重新提交。</span></div> : null}<div className="form-actions owner-actions">{selectedReview.state === "待补证" ? <button className="primary-action" disabled={busy || !hasFreshEvidence} onClick={async () => { const ok = await mutate({ action: "resubmit_review", reviewId: selectedReview.id }, "已重新提交给主评人"); if (ok) setSelectedReview(null); }}>{busy ? "提交中…" : "补证完成，重新提交"}</button> : null}<button className="danger-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "withdraw_review", reviewId: selectedReview.id }, "申请已撤回，可修改后重新提交"); if (ok) setSelectedReview(null); }}>撤回申请</button></div></>; })() : null}{canDecideSelected ? <><label><FieldLabel text="评审结论" required /><select value={reviewDecision} onChange={event => { setReviewDecision(event.target.value); if (event.target.value === "已通过") setFormErrors(prev => { const { reviewFeedback: cleared, ...rest } = prev; return rest; }); }}>{["已通过", "待补证", "未通过"].map(item => <option key={item}>{item}</option>)}</select></label><label><FieldLabel text="评审反馈" required={reviewDecision !== "已通过"} /><textarea rows={5} value={reviewFeedback} onChange={event => { setReviewFeedback(event.target.value); setFormErrors(prev => { const { reviewFeedback: cleared, ...rest } = prev; return rest; }); }} onBlur={event => { if ((reviewDecision === "待补证" || reviewDecision === "未通过") && !event.target.value.trim()) setFormErrors(prev => ({ ...prev, reviewFeedback: "此字段为必填" })); }} placeholder={reviewDecision === '已通过' ? '简要说明通过理由（可选）' : reviewDecision === '待补证' ? '请指出缺少哪些证据/标准未覆盖（必填）' : reviewDecision === '未通过' ? '请说明原因和改进建议（必填）' : '请填写评审意见'} aria-invalid={!!formErrors.reviewFeedback} aria-describedby={formErrors.reviewFeedback ? "review-feedback-error" : undefined} />{formErrors.reviewFeedback ? <span id="review-feedback-error" className="field-error">{formErrors.reviewFeedback}</span> : null}</label><div className="form-actions"><button className="secondary-action" onClick={() => setSelectedReview(null)}>稍后处理</button><button className="primary-action" disabled={busy || ((reviewDecision === '待补证' || reviewDecision === '未通过') && !reviewFeedback?.trim())} onClick={async () => { const ok = await mutate({ action: "review_decision", reviewId: selectedReview.id, decision: reviewDecision, feedback: reviewFeedback }, reviewDecision === "已通过" ? `评审已通过，成员已晋级至 L${Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，请提醒其更新下一级进展` : `评审已更新为“${reviewDecision}”`); if (ok) setSelectedReview(null); }}>{busy ? "处理中…" : "确认评审结论"}</button></div></> : <div className="readonly-notice"><LockKeyhole size={20} /><span>该申请由 {selectedReview.reviewerName} 主评，你可以查看进度与反馈。</span></div>}</div></DialogFrame> : null}

    {selectedMember ? <DialogFrame title={`${selectedMember.name} 的成长档案`} onClose={() => setSelectedMember(null)} size="drawer"><div className="member-profile"><div className="profile-hero"><span className={`member-avatar large industry-${selectedMember.industry}`}>{initials(selectedMember.name)}</span><div><h2>{selectedMember.name}</h2><p>{selectedMember.role} · {selectedMember.groupName}</p></div></div><div className="profile-levels"><span><small>认证</small><b>L{selectedMember.currentLevel}</b></span><span><small>下一级</small><b>L{Math.min(selectedMember.currentLevel + 1, activeLevels.length || 10)}</b></span></div><section><h3>当前差距</h3><p>{selectedMember.gap || "待补充"}</p></section><section><h3>本月计划</h3><p>{selectedMember.plan || "待补充"}</p></section><section><h3>下一步任务</h3><p>{selectedMember.nextTask || "待补充"}</p></section><div className="profile-facts"><span><FileCheck2 size={20} />{selectedMember.evidenceCount} 条证据</span><span><History size={20} />更新于 {formatDate(selectedMember.updatedAt)}</span><span><ClipboardCheck size={20} />{selectedMember.reviewStatus}</span></div>{workspace?.me?.role === "admin" ? <button className="secondary-action full" onClick={() => { setSelectedMember(null); openCheckin(selectedMember); }}>代维护进展</button> : null}</div></DialogFrame> : null}

    {assetDraft ? <DialogFrame title="提交团队成果" onClose={() => setAssetDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "create_asset", ...assetDraft }, "成果已提交审核"); if (ok) setAssetDraft(null); }}><div className="dialog-heading"><span>TEAM RESULT</span><h2>提交团队成果</h2></div><div className="form-grid"><label><FieldLabel text="成果类型" required /><select value={assetDraft.assetType} onChange={event => setAssetDraft({ ...assetDraft, assetType: event.target.value })}>{["Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <option key={item}>{item}</option>)}</select></label><label><FieldLabel text="所属行业" required /><select value={assetDraft.industry} onChange={event => setAssetDraft({ ...assetDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div><label><FieldLabel text="成果名称" required /><input required value={assetDraft.title} onChange={event => setAssetDraft({ ...assetDraft, title: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({ ...prev, assetTitle: '此字段为必填' })); } else { setFormErrors(prev => { const { assetTitle, ...rest } = prev; return rest; }); } }} placeholder="使用业务价值清晰的名称" aria-describedby={formErrors.assetTitle ? "asset-title-error" : undefined} aria-invalid={!!formErrors.assetTitle} />{formErrors.assetTitle && <span id="asset-title-error" className="field-error">{formErrors.assetTitle}</span>}</label><label><FieldLabel text="成果描述（可选）" /><textarea rows={3} maxLength={500} value={assetDraft.description} onChange={event => setAssetDraft({ ...assetDraft, description: event.target.value })} placeholder="写清业务价值与适用场景：解决什么问题、适合哪些行业与任务复用" /></label><label><FieldLabel text="仓库或材料链接" /><input type="url" value={assetDraft.url} onChange={event => setAssetDraft({ ...assetDraft, url: event.target.value })} placeholder="https://…（可选）" /></label><label className="compliance-check"><input type="checkbox" checked={assetDraft.complianceConfirmed} onChange={event => setAssetDraft({ ...assetDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户与人名已匿名化、真实数据已替换、密钥与内网地址已剥离。</small></span></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setAssetDraft(null)}>取消</button><button className="primary-action" disabled={busy || !assetDraft.title.trim() || !assetDraft.complianceConfirmed}>{busy ? "提交中…" : "提交审核"}</button></div></form></DialogFrame> : null}

    {adminOpen && workspace?.me?.role === "admin" ? <DialogFrame title="管理设置" onClose={() => setAdminOpen(false)} size="drawer"><div className="admin-settings"><div className="admin-heading"><span>ADMIN SETTINGS</span><h2>管理设置</h2></div><div className="admin-tabs"><button className={adminTab === "framework" ? "active" : ""} onClick={() => setAdminTab("framework")}>十级体系</button><button className={adminTab === "access" ? "active" : ""} onClick={() => setAdminTab("access")}>成员与评审人</button></div>{adminTab === "framework" ? <div className="framework-admin"><div className="framework-status"><span><small>线上版本</small><b>{workspace.framework.published.versionName} · 已发布</b></span><span><small>编辑版本</small><b>{workspace.framework.draft?.versionName || "保存后自动创建草稿"}</b></span></div><div className="level-admin-picker">{(workspace.framework.draft?.levels || workspace.framework.published.levels).map(level => <button key={level.level} className={frameworkLevelDraft?.level === level.level ? "active" : ""} onClick={() => setFrameworkLevelDraft(structuredClone(level))}>L{level.level}<span>{level.title}</span></button>)}</div>{frameworkLevelDraft ? <form className="admin-level-form" onSubmit={async event => { event.preventDefault(); const criteria = frameworkLevelDraft.criteria.map(item => ({ ...item, label: item.label.trim(), evidenceHint: item.evidenceHint.trim() || "提交可核验材料" })).filter(item => item.label); const sanitized = { ...frameworkLevelDraft, criteria }; const ok = await mutate({ action: "save_framework_level", frameworkLevel: sanitized, changeNote: frameworkNote }, `L${frameworkLevelDraft.level} 草稿已保存`); if (ok) setFrameworkLevelDraft(sanitized); }}><div className="form-grid"><label><FieldLabel text="层级名称" required /><input value={frameworkLevelDraft.title} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, title: event.target.value })} /></label><label>能力角色<input value={frameworkLevelDraft.role} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, role: event.target.value })} /></label></div><label>所属阶段<select value={frameworkLevelDraft.stage} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, stage: event.target.value })}>{stageMeta.map(stage => <option key={stage.label}>{stage.label}</option>)}</select></label><label>能力定义<textarea rows={4} value={frameworkLevelDraft.definition} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, definition: event.target.value })} /></label><label><FieldLabel text="认证标准" required /><textarea rows={3} value={frameworkLevelDraft.standard} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, standard: event.target.value })} /></label><label>核心能力（用顿号分隔）<textarea rows={3} value={frameworkLevelDraft.abilities.join("、")} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, abilities: event.target.value.split(/[、，,\n]/).map(item => item.trim()).filter(Boolean) })} /></label><div className="criteria-editor"><div className="form-section-label"><FieldLabel text="通关标准" required /><small>每条包含标准与证据提示，保存时自动序列化</small></div>{frameworkLevelDraft.criteria.map((criterion, index) => <div className="criteria-editor-row" key={criterion.id}><input value={criterion.label} placeholder="标准" aria-label={`第 ${index + 1} 条标准`} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><input value={criterion.evidenceHint} placeholder="证据提示" aria-label={`第 ${index + 1} 条证据提示`} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.map((item, i) => i === index ? { ...item, evidenceHint: event.target.value } : item) })} /><button type="button" className="icon-button criteria-remove" aria-label={`删除第 ${index + 1} 条标准`} onClick={() => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}<button type="button" className="secondary-action criteria-add" onClick={() => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: [...frameworkLevelDraft.criteria, { id: nextCriterionId(frameworkLevelDraft), label: "", evidenceHint: "" }] })}><Plus size={16} /> 添加标准</button></div><label>版本说明<input value={frameworkNote} onChange={event => setFrameworkNote(event.target.value)} placeholder="说明本次为什么调整" /></label><div className="form-actions sticky-actions"><button className="secondary-action" type="button" disabled={busy || !workspace.framework.draft} onClick={async () => { const ok = await mutate({ action: "publish_framework", changeNote: frameworkNote }, "新版十级体系已发布"); if (ok) setAdminOpen(false); }}>发布新版</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存草稿"}</button></div></form> : null}</div> : <div className="access-admin"><div className="role-stats">Admin({workspace.workspaceUsers.filter(u => u.role === 'admin').length}) | Reviewer({workspace.workspaceUsers.filter(u => u.role === 'reviewer').length}) | Member({workspace.workspaceUsers.filter(u => u.role === 'member' || !u.role).length})</div><div className="admin-note"><ShieldCheck size={20} /><p>评审人也是普通成员，只多一个“处理分配给自己的评审”权限；管理员建议保留 1–2 位。</p></div><NewUserForm busy={busy} onCreate={fields => mutate({ action: "create_user", ...fields }, `${fields.displayName} 的账号已创建`)} />{workspace.workspaceUsers.map(user => <ManagedUserRow key={`${user.email}:${user.role}:${user.groupName}`} user={user} busy={busy} isSelf={user.email === workspace.me?.email} onSave={(role, groupName) => mutate({ action: "update_user_access", email: user.email, role, groupName }, `${user.displayName} 的权限已更新`)} />)}</div>}</div></DialogFrame> : null}

    {levelGuide ? <DialogFrame title={`L${levelGuide.level} ${levelGuide.title}完整指南`} onClose={() => setLevelGuide(null)} size="drawer"><div className="level-guide"><div className="guide-hero" style={{ "--stage": stageForLevel(levelGuide.level, stageMeta).color } as CSSProperties}><span>{levelGuide.stage}</span><strong>L{levelGuide.level}</strong><h2>{levelGuide.title}</h2><p>{levelGuide.role}</p></div><section><p className="guide-definition">{levelGuide.definition}</p><div className="standard-callout"><small>认证标准</small><b>{levelGuide.standard}</b></div></section><section><h3>通关标准与证据示例</h3>{levelGuide.criteria.map((criterion, index) => <div className="guide-criterion" key={criterion.id}><span>{index + 1}</span><div><b>{criterion.label}</b><small>{criterion.evidenceHint}</small></div></div>)}</section><section><h3>业务实践</h3><ul>{levelGuide.practices.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul></section><section><h3>自我提升路径</h3><p>{levelGuide.path}</p></section>{levelGuide.resources.length ? <section><h3>学习资源</h3>{levelGuide.resources.map(resource => <a className="resource-link" key={resource.label} href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.label}<ChevronRight size={16} /></a>)}</section> : null}</div></DialogFrame> : null}

    {selectedAnchor ? <DialogFrame title={`${selectedAnchor.name}行业实战锚点`} onClose={() => setSelectedAnchor(null)} size="drawer"><div className="anchor-detail"><div className="anchor-hero"><span>{selectedAnchor.version}</span><h2>{selectedAnchor.name}</h2><p>{selectedAnchor.owner} · 每季度更新</p></div><p className="anchor-intro">每一个锚点任务都关联真实项目，优秀证据经审核后进入团队成果库。</p>{selectedAnchor.items.map((item, index) => <div className="anchor-task" key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>L{item.level} · {item.title}</b><small>{item.template}</small></div><button onClick={() => { setSelectedAnchor(null); setFocusedLevelNumber(item.level); setActiveView("capability"); }} aria-label={`查看 L${item.level} 标准`}><ChevronRight size={16} /></button></div>)}<div className="compliance-rule"><FolderKanban size={20} /><div><b>成果关系</b><p>证据证明个人达标；审核发布后的成果沉淀组织复用，并反馈 L6+ 的能力认证。</p></div></div></div></DialogFrame> : null}

    {toast ? <div className="toast" role="status">{toast}</div> : null}
  </main>;
}

function ManagedUserRow({ user, busy, isSelf, onSave }: { user: ManagedWorkspaceUser; busy: boolean; isSelf: boolean; onSave: (role: ManagedWorkspaceUser["role"], groupName: string) => Promise<boolean> }) {
  const [role, setRole] = useState(user.role);
  const [groupName, setGroupName] = useState(user.groupName);
  return <div className="managed-user-row"><span className="member-avatar">{initials(user.displayName)}</span><span><b>{user.displayName}</b><small>{user.email}</small>{isSelf ? <small>本人账号 · 不能降低自己的管理员权限</small> : null}</span><label><small>身份</small><select value={role} disabled={isSelf} onChange={event => setRole(event.target.value as ManagedWorkspaceUser["role"])}><option value="member">成员</option><option value="reviewer">成员 · 评审人</option><option value="admin">管理员</option></select></label><label><small>小组</small><input value={groupName} onChange={event => setGroupName(event.target.value)} /></label><button className="secondary-action" disabled={busy || (role === user.role && groupName === user.groupName)} onClick={() => onSave(role, groupName)}>保存</button></div>;
}

function NewUserForm({ busy, onCreate }: { busy: boolean; onCreate: (fields: { email: string; displayName: string; password: string; role: string; groupName: string }) => Promise<boolean> }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [groupName, setGroupName] = useState("综合组");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.includes("@");
  const passwordValid = password.length >= 6;
  return <form className="new-user-form" onSubmit={async event => { event.preventDefault(); const ok = await onCreate({ email, displayName, password, role, groupName }); if (ok) { setDisplayName(""); setEmail(""); setPassword(""); setRole("member"); setGroupName("综合组"); } }}>
    <b><Plus size={16} /> 添加成员账号</b>
    <div className="new-user-grid">
      <label><small className="field-label required">姓名</small><input required value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="真实姓名" /></label>
      <label><small className="field-label required">邮箱</small><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@qianwen" /></label>
      <label><small className="field-label required">初始密码</small><input required type="password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 6 位" /></label>
      <label><small>身份</small><select value={role} onChange={event => setRole(event.target.value)}><option value="member">成员</option><option value="reviewer">成员 · 评审人</option><option value="admin">管理员</option></select></label>
      <label><small>小组</small><input value={groupName} onChange={event => setGroupName(event.target.value)} /></label>
    </div>
    <span className="new-user-hint">新成员首次登录会自动进入 2 步引导完成建档</span>
    <button className="primary-action" disabled={busy || !emailValid || !passwordValid}>{busy ? "创建中…" : "创建账号"}</button>
  </form>;
}

function AssetRow({ asset, isAdmin, myMemberId, onReview, onResubmit, onWithdraw, busy }: { asset: AssetRecord; isAdmin: boolean; myMemberId: number | null; onReview: (decision: string, feedback?: string) => Promise<boolean>; onResubmit: () => Promise<boolean>; onWithdraw: () => Promise<boolean>; busy: boolean }) {
  const [returnReason, setReturnReason] = useState<string | null>(null);
  const isOwner = asset.ownerMemberId === myMemberId;
  return <article className="asset-row"><div className="asset-icon">{asset.type === "Skill" ? <Sparkles size={20} /> : asset.type === "知识库" ? <BookOpen size={20} /> : asset.type === "评测集" ? <PackageCheck size={20} /> : <FolderKanban size={20} />}</div><div className="asset-copy"><div><h3>{asset.title}</h3><span>{asset.type} · {asset.industry}</span></div><p>{asset.ownerName} · 更新于 {formatDate(asset.updatedAt)}{asset.sourceEvidenceId ? " · 来自成长证据" : ""}</p>{asset.description ? <p className="asset-desc" title={asset.description}>{asset.description}</p> : null}{asset.reviewStatus === "待补充" && asset.reviewFeedback && (isOwner || isAdmin) ? <p className={`asset-feedback ${toneClass(asset.reviewStatus)}`}>退回原因：{asset.reviewFeedback}</p> : null}</div><div className="asset-reuse"><b>{asset.reusePeople}</b><small>人复用</small></div><div className="asset-states"><em className={`state-label ${toneClass(asset.reviewStatus)}`} aria-label={`审核状态：${asset.reviewStatus}`}>{asset.reviewStatus}</em><small><ShieldCheck size={16} />{asset.complianceStatus}</small></div>{isAdmin && ["待审核", "审核中"].includes(asset.reviewStatus) ? <div className="asset-review-actions"><button disabled={busy} onClick={() => setReturnReason(reason => reason === null ? "" : null)}>退回</button><button disabled={busy} onClick={() => onReview("已发布")}>发布</button></div> : isOwner && ["待审核", "审核中"].includes(asset.reviewStatus) ? <div className="asset-review-actions"><button disabled={busy} onClick={onWithdraw}>撤回</button></div> : ["待补充", "已撤回"].includes(asset.reviewStatus) && (isAdmin || isOwner) ? <div className="asset-review-actions"><button disabled={busy} onClick={onResubmit}>重新提交</button></div> : asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`打开 ${asset.title}`}><ExternalLink size={16} /></a> : <span className="muted-link">—</span>}{isAdmin && returnReason !== null && ["待审核", "审核中"].includes(asset.reviewStatus) ? <div className="asset-return-form"><textarea rows={2} value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="填写退回原因，说明需要补充什么" /><button className="secondary-action" type="button" disabled={busy} onClick={() => setReturnReason(null)}>取消</button><button className="primary-action" type="button" disabled={busy || !returnReason.trim()} onClick={async () => { const ok = await onReview("待补充", returnReason.trim()); if (ok) setReturnReason(null); }}>确认退回</button></div> : null}</article>;
}
