"use client";

import {
  type ClipboardEvent,
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
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  FolderKanban,
  Gauge,
  History,
  Library,
  LockKeyhole,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  PackageCheck,
  Paperclip,
  PenLine,
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
import { brand3dAssets, qwenworkLogos, type Brand3dAssetId } from "./brand-assets";
import { helpChapterLines, helpChaptersForRole, type HelpChapter, type HelpRole } from "./help-docs";
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
type AnalysisLens = "growth" | "assets";
type AnalysisPeriod = "month" | "quarter" | "all";

type CheckinDraft = {
  memberId: number; targetLevel: number; targetDate: string;
  progressStatus: string; gap: string; plan: string; nextTask: string;
};

type EvidenceDraft = {
  id?: number;
  memberId: number; level: number; criterionKey: string; title: string; kind: string;
  url: string; outcome: string; nominateAsset: boolean; assetType: string; complianceConfirmed: boolean;
};

type AssetDraft = {
  id?: number;
  memberId: number; title: string; description: string; assetType: string; industry: string; url: string; complianceConfirmed: boolean;
  reviewerEmail: string;
};

type ReviewTask = { kind: "promotion"; review: Review } | { kind: "asset"; asset: AssetRecord };

type OnboardingDraft = {
  step: number; groupName: string; industry: string; targetLevel: number; targetDate: string; nextTask: string;
};

type FeedbackRecord = {
  id: number; title: string; description: string; pageName: string; status: string;
  adminResponse: string; createdByEmail: string; createdAt: string; resolvedAt: string; hasScreenshot: boolean;
};

type FeedbackStats = { total: number; open: number; inProgress: number; resolved: number };

const FEEDBACK_STATUS_META: Record<string, { label: string; tone: string }> = {
  open: { label: "待处理", tone: "tone-warning" },
  in_progress: { label: "处理中", tone: "tone-info" },
  resolved: { label: "已解决", tone: "tone-success" },
  closed: { label: "已关闭", tone: "tone-neutral" },
};
const FEEDBACK_PAGE_OPTIONS = ["我的成长", "能力阶梯", "评审中心", "团队-成员概览", "团队-成果库", "团队-团队分析", "登录页", "管理设置", "其他"];
const FEEDBACK_SCREENSHOT_MAX = 2_800_000; // 与后端 SCREENSHOT_MAX_LENGTH 一致（Base64 字符串长度）
const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const SIGN_IN_URL = "/login";
const CURRENT_CYCLE = new Date().toISOString().slice(0, 7);
const TODAY = new Date().toISOString().slice(0, 10);

async function handleSignOut() {
  if (!window.confirm("确定退出登录吗？")) return;
  await signOut({ redirect: false });
  window.location.href = "/";
}

async function postWorkspace<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

async function compressScreenshot(file: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("读取图片失败")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new window.Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("图片解析失败")); img.src = dataUrl; });
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片压缩");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.8;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > 2 * 1024 * 1024 && quality > 0.35) { quality -= 0.1; output = canvas.toDataURL("image/jpeg", quality); }
  if (output.length > FEEDBACK_SCREENSHOT_MAX) throw new Error("截图压缩后仍超过大小限制，请截取更小的区域");
  return output;
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

function assetStaleDays(asset: AssetRecord) {
  if (asset.reviewStatus !== "待审核") return 0;
  const updated = new Date(asset.updatedAt.slice(0, 10)).getTime();
  if (Number.isNaN(updated)) return 0;
  return Math.floor((Date.now() - updated) / 86400000);
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

function EmptyState({ icon, title, copy, action, visual }: { icon: ReactNode; title: string; copy: string; action?: ReactNode; visual?: Brand3dAssetId }) {
  const asset = visual ? brand3dAssets[visual] : null;
  return <div className={`empty-state${asset ? " has-visual" : ""}`}>{asset ? <Image className="empty-state-visual" src={asset.src} width={1254} height={1254} alt="" aria-hidden="true" /> : icon}<h3>{title}</h3><p>{copy}</p>{action}</div>;
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
        {items.map(item => <div className="review-evidence-item" key={item.id}><div><b>{item.title}</b><small>{item.kind} · {item.status} · {formatDate(item.createdAt)}</small>{item.nominateAsset ? <span className="evidence-auto-publish"><Library size={13} />晋级通过后自动发布为{item.assetType || "Skill"}成果</span> : null}{item.outcome ? <p>{item.outcome}</p> : null}</div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开 ${item.title} 材料`}><ExternalLink size={16} /></a> : null}</div>)}
      </div>;
    })}
    {extras.length ? <>
      <div className="review-material-group"><b>其他证据</b><em>{extras.length} 条</em></div>
      <div className="review-criterion covered">{extras.map(item => <div className="review-evidence-item" key={item.id}><div><b>{item.title}</b><small>{item.kind} · {item.status} · {formatDate(item.createdAt)}</small>{item.nominateAsset ? <span className="evidence-auto-publish"><Library size={13} />晋级通过后自动发布为{item.assetType || "Skill"}成果</span> : null}{item.outcome ? <p>{item.outcome}</p> : null}</div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`打开 ${item.title} 材料`}><ExternalLink size={16} /></a> : null}</div>)}</div>
    </> : null}
  </div>;
}

export default function Dashboard({ levels: fallbackLevels, stageMeta }: Props) {
  const [activeView, setActiveView] = useState<ViewId>("growth");
  const [teamTab, setTeamTab] = useState<TeamTab>("report");
  const [analysisLens, setAnalysisLens] = useState<AnalysisLens>("growth");
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("month");
  const [analysisGroup, setAnalysisGroup] = useState("全部团队");
  const [reviewScope, setReviewScope] = useState<ReviewScope>("mine");
  const [reviewTypeFilter, setReviewTypeFilter] = useState<"all" | "promotion" | "asset">("all");
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuPopRef = useRef<HTMLDivElement>(null);
  const [focusedLevelNumber, setFocusedLevelNumber] = useState(4);
  const [levelGuide, setLevelGuide] = useState<LevelDefinition | null>(null);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<IndustryAnchor | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [checkinDraft, setCheckinDraft] = useState<CheckinDraft | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<EvidenceDraft | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft | null>(null);
  const onboardingShownRef = useRef<number | null>(null);
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
  const [assetQuery, setAssetQuery] = useState("");
  const [assetType, setAssetType] = useState("全部");
  const [assetStatusFilter, setAssetStatusFilter] = useState("全部");
  const [assetMineOnly, setAssetMineOnly] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<"framework" | "access" | "feedback">("framework");
  const [frameworkLevelDraft, setFrameworkLevelDraft] = useState<LevelDefinition | null>(null);
  const [frameworkNote, setFrameworkNote] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackPage, setFeedbackPage] = useState("其他");
  const [helpOpen, setHelpOpen] = useState(false);

  const activeLevels = (workspace?.levels?.length ?? 0) >= 10 ? workspace!.levels : fallbackLevels;
  const focusedLevel = activeLevels.find(level => level.level === focusedLevelNumber) || activeLevels[0];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function skipOnboarding() {
    const memberId = workspace?.myMember?.id;
    if (memberId != null) { try { window.localStorage.setItem(`qw_onboarding_skip_${memberId}`, String(Date.now())); } catch { /* localStorage 不可用时静默降级 */ } }
    setOnboardingDraft(null);
  }

  const applyWorkspace = useCallback((data: WorkspacePayload) => {
    setWorkspace(data);
    if (data.myMember) {
      const nextLevel = Math.min((data.myMember.currentLevel ?? 0) + 1, activeLevels.length || 10);
      setFocusedLevelNumber(nextLevel);
    }
    if (data.me?.role === "reviewer" || data.me?.role === "admin") setReviewScope("assigned");
    if (data.myMember && data.myMember.industry === "未分配" && onboardingShownRef.current !== data.myMember.id) {
      onboardingShownRef.current = data.myMember.id;
      let skipped = false;
      try { skipped = !!window.localStorage.getItem(`qw_onboarding_skip_${data.myMember.id}`); } catch { skipped = false; }
      if (!skipped) setOnboardingDraft({ step: 1, groupName: data.myMember.groupName || "综合组", industry: "通用", targetLevel: Math.max(data.myMember.targetLevel, data.myMember.currentLevel + 1), targetDate: data.myMember.targetDate, nextTask: data.myMember.nextTask || "" });
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

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (accountMenuRef.current?.contains(target) || accountMenuPopRef.current?.contains(target)) return;
      setAccountMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [accountMenuOpen]);

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

  function openCheckin() {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    const member = workspace.myMember;
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
    setEvidenceDraft({ memberId: member.id, level, criterionKey: selectedCriterion, title: "", kind: "链接", url: "", outcome: "", nominateAsset: false, assetType: "Skill", complianceConfirmed: false });
  }

  function openEvidenceEdit(item: Evidence) {
    if (!workspace?.authenticated) return;
    setFormErrors({});
    setEvidenceDraft({ id: item.id, memberId: item.memberId, level: item.level, criterionKey: item.criterionKey, title: item.title, kind: item.kind, url: item.url, outcome: item.outcome, nominateAsset: Boolean(item.nominateAsset), assetType: item.assetType || "Skill", complianceConfirmed: false });
  }

  function openAsset() {
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    const member = workspace.myMember;
    if (!member) return;
    setFormErrors({});
    setAssetDraft({ memberId: member.id, title: "", description: "", assetType: "Skill", industry: member.industry === "未分配" ? "通用" : member.industry, url: "", complianceConfirmed: false, reviewerEmail: "" });
  }

  function openAssetEdit(asset: AssetRecord) {
    if (!workspace?.authenticated) return;
    setFormErrors({});
    setAssetDraft({ id: asset.id, memberId: asset.ownerMemberId, title: asset.title, description: asset.description || "", assetType: asset.type, industry: asset.industry, url: asset.url || "", complianceConfirmed: true, reviewerEmail: asset.reviewerEmail || "" });
  }

  function copyAssetLink(asset: AssetRecord) {
    if (!asset.url) { showToast("该成果尚未提供可复制的材料链接"); return; }
    navigator.clipboard.writeText(asset.url).then(() => {
      showToast("链接已复制");
      if (asset.ownerMemberId !== workspace?.me?.memberId) {
        postWorkspace({ action: "track_asset_reuse", assetId: asset.id }).then(() => loadWorkspace()).catch(() => { /* 复用计数失败静默降级，不打扰复制体验 */ });
      }
    }).catch(() => showToast("复制失败，请重试"));
  }

  function openAdmin() {
    if (!workspace?.framework) return;
    const editable = workspace.framework.draft?.levels || workspace.framework.published.levels;
    setFrameworkLevelDraft(structuredClone(editable[0]));
    setFrameworkNote(workspace.framework.draft?.changeNote || "");
    setAdminOpen(true);
  }

  function openFeedback() {
    setAccountMenuOpen(false);
    if (!workspace?.authenticated) { window.location.href = SIGN_IN_URL; return; }
    const teamPage = teamTab === "members" ? "团队-成员概览" : teamTab === "assets" ? "团队-成果库" : "团队-团队分析";
    setFeedbackPage(activeView === "growth" ? "我的成长" : activeView === "capability" ? "能力阶梯" : activeView === "review" ? "评审中心" : teamPage);
    setFeedbackOpen(true);
  }

  function openHelp() {
    setAccountMenuOpen(false);
    setHelpOpen(true);
  }

  const myMember = workspace?.myMember;
  const myEvidence = useMemo(() => workspace?.evidences.filter(item => item.memberId === myMember?.id) || [], [myMember?.id, workspace?.evidences]);
  const selectedLevelEvidence = useMemo(() => myEvidence.filter(item => item.level === focusedLevel.level), [focusedLevel.level, myEvidence]);
  const targetEvidence = myEvidence.filter(item => item.level === Math.min((myMember?.currentLevel ?? 0) + 1, activeLevels.length || 10));
  const targetAssetEvidence = targetEvidence.filter(item => Boolean(item.nominateAsset));
  const currentLevel = myMember?.currentLevel ?? 0;
  const maxLevel = activeLevels.length || 10;
  const nextLevelNumber = Math.min(currentLevel + 1, maxLevel);
  const atTopLevel = currentLevel >= maxLevel;
  const nextLevelDef = activeLevels.find(level => level.level === nextLevelNumber) || activeLevels[0];
  const nextLevelEvidence = myEvidence.filter(item => item.level === nextLevelNumber);
  const latestFeedback = workspace?.reviews.find(review => review.memberId === myMember?.id && review.feedback)?.feedback || "提交后由主评人给出具体反馈";
  const canReview = workspace?.me?.role === "admin" || workspace?.me?.role === "reviewer";
  const isAdminRole = workspace?.me?.role === "admin";
  const adminRoleSummary = useMemo(() => {
    const users = workspace?.workspaceUsers || [];
    return [
      { key: "admin", label: "管理员", description: "体系与权限", count: users.filter(user => user.role === "admin").length },
      { key: "reviewer", label: "评审人", description: "评审与反馈", count: users.filter(user => user.role === "reviewer").length },
      { key: "member", label: "成员", description: "成长与贡献", count: users.filter(user => user.role === "member" || !user.role).length },
    ];
  }, [workspace?.workspaceUsers]);
  const roleLabel = workspace?.me?.role === "admin" ? "管理员" : workspace?.me?.role === "reviewer" ? "成员 · 评审人" : "成员";
  const canDecideSelected = Boolean(selectedReview && (workspace?.me?.role === "admin" || selectedReview.reviewerEmail === workspace?.me?.email));
  const currentStage = stageForLevel(myMember?.currentLevel ?? workspace?.metrics.median ?? 0, stageMeta);
  const nextLevelCoveredCount = nextLevelEvidence.filter(item => nextLevelDef.criteria.some(criterion => criterion.id === item.criterionKey)).length;
  const daysSinceUpdate = myMember?.updatedAt ? Math.floor((Date.parse(TODAY) - Date.parse(myMember.updatedAt.slice(0, 10))) / 86400000) : null;
  const checkinStale = daysSinceUpdate !== null && Number.isFinite(daysSinceUpdate) && daysSinceUpdate > 7;
  const hasRealFeedback = Boolean(workspace?.reviews.some(review => review.memberId === myMember?.id && review.feedback));
  const groups = useMemo(() => ["全部", ...Array.from(new Set((workspace?.members || []).map(member => member.groupName)))], [workspace?.members]);
  const analysisGroups = useMemo(() => ["全部团队", ...groups.filter(group => group !== "全部")], [groups]);
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
    const matchesStatus = assetStatusFilter === "全部" || asset.reviewStatus === assetStatusFilter;
    const matchesMine = !assetMineOnly || asset.ownerMemberId === workspace?.me?.memberId;
    return matchesType && matchesStatus && matchesMine && `${asset.title}${asset.description || ""}${asset.industry}${asset.ownerName}`.toLowerCase().includes(assetQuery.toLowerCase());
  }), [assetQuery, assetType, assetStatusFilter, assetMineOnly, workspace?.assets, workspace?.me?.memberId]);
  const pendingReviewCount = useMemo(() => (workspace?.reviews || []).filter(review => review.reviewerEmail === workspace?.me?.email && ["已提交", "评审中", "待补证"].includes(review.state)).length, [workspace?.me?.email, workspace?.reviews]);
  const pendingAssetReviewCount = useMemo(() => {
    const me = workspace?.me;
    if (!me || (me.role !== "admin" && me.role !== "reviewer")) return 0;
    return (workspace?.assets || []).filter(asset => {
      if (asset.reviewStatus !== "待审核") return false;
      if (asset.ownerMemberId === me.memberId) return false;
      if (me.role === "admin") return true;
      return asset.reviewerEmail === me.email;
    }).length;
  }, [workspace?.assets, workspace?.me]);
  const assetReviewTasks = useMemo(() => {
    const assets = workspace?.assets || [];
    const me = workspace?.me;
    if (!me) return [];
    if (reviewScope === "mine") return assets.filter(asset => asset.ownerMemberId === me.memberId);
    if (reviewScope === "assigned") {
      if (me.role !== "admin" && me.role !== "reviewer") return [];
      return assets.filter(asset => {
        if (asset.reviewStatus !== "待审核" || asset.ownerMemberId === me.memberId) return false;
        if (me.role === "admin") return true;
        return asset.reviewerEmail === me.email;
      });
    }
    return assets;
  }, [reviewScope, workspace?.assets, workspace?.me]);
  const assetAnalytics = useMemo(() => {
    const assets = workspace?.assets || [];
    const published = assets.filter(asset => asset.reviewStatus === "已发布");
    const typeDist = ["Skill", "知识库", "评测集", "原型", "行业实践"].map(name => ({ name, count: published.filter(asset => asset.type === name).length }));
    const industryDist = ["高校", "新质", "能源", "政务", "通用"].map(name => ({ name, count: published.filter(asset => asset.industry === name).length })).filter(item => item.count > 0);
    const topReused = published.filter(asset => asset.reuseTimes > 0).toSorted((a, b) => b.reuseTimes - a.reuseTimes || b.reusePeople - a.reusePeople).slice(0, 5);
    const pendingCount = assets.filter(asset => asset.reviewStatus === "待审核").length;
    return { typeDist, industryDist, topReused, pendingCount, publishedCount: published.length, totalReuse: published.reduce((sum, asset) => sum + asset.reuseTimes, 0) };
  }, [workspace?.assets]);
  const teamAnalysis = useMemo(() => {
    const members = workspace?.members || [];
    const assets = workspace?.assets || [];
    const periodStart = new Date(`${TODAY}T00:00:00`);
    if (analysisPeriod === "quarter") periodStart.setDate(periodStart.getDate() - 89);
    const inPeriod = (value: string) => {
      if (analysisPeriod === "all") return true;
      if (analysisPeriod === "month") return value.slice(0, 7) === CURRENT_CYCLE;
      const date = new Date(value.replace(" ", "T"));
      return Number.isFinite(date.getTime()) && date >= periodStart;
    };
    const selectedMembers = members.filter(member => analysisGroup === "全部团队" || member.groupName === analysisGroup);
    const selectedMemberIds = new Set(selectedMembers.map(member => member.id));
    const selectedAssets = assets.filter(asset => selectedMemberIds.has(asset.ownerMemberId));
    const publishedAssets = selectedAssets.filter(asset => asset.reviewStatus === "已发布");
    const periodReviews = (workspace?.reviews || []).filter(review => selectedMemberIds.has(review.memberId) && inPeriod(review.submittedAt));
    const periodPromotions = (workspace?.promotionHistory || []).filter(item => selectedMemberIds.has(item.memberId) && inPeriod(item.createdAt));
    const periodReuseEvents = (workspace?.assetReuseEvents || []).filter(event => selectedAssets.some(asset => asset.id === event.assetId) && inPeriod(event.createdAt));
    const reuseByAsset = new globalThis.Map<number, number>();
    for (const event of periodReuseEvents) reuseByAsset.set(event.assetId, (reuseByAsset.get(event.assetId) || 0) + 1);
    const typeDist = ["Skill", "知识库", "评测集", "原型", "行业实践"].map(name => ({ name, count: publishedAssets.filter(asset => asset.type === name).length }));
    const topReused = publishedAssets
      .map(asset => ({ asset, periodReuse: reuseByAsset.get(asset.id) || 0 }))
      .filter(item => item.periodReuse > 0)
      .toSorted((a, b) => b.periodReuse - a.periodReuse || b.asset.reuseTimes - a.asset.reuseTimes)
      .slice(0, 5);
    const levelDistribution = Array.from({ length: 10 }, (_, index) => selectedMembers.filter(member => member.currentLevel === index + 1).length);
    const reviewStates = ["已提交", "评审中", "待补证"].map(state => ({ state, count: periodReviews.filter(review => review.state === state).length }));
    const groupRows = groups.filter(group => group !== "全部").map(name => {
      const groupMembers = members.filter(member => member.groupName === name);
      const groupMemberIds = new Set(groupMembers.map(member => member.id));
      const groupAssets = assets.filter(asset => groupMemberIds.has(asset.ownerMemberId));
      const groupPublished = groupAssets.filter(asset => asset.reviewStatus === "已发布");
      const groupEvents = (workspace?.assetReuseEvents || []).filter(event => groupAssets.some(asset => asset.id === event.assetId) && inPeriod(event.createdAt));
      const groupReviews = (workspace?.reviews || []).filter(review => groupMemberIds.has(review.memberId) && inPeriod(review.submittedAt) && ["已提交", "评审中", "待补证"].includes(review.state));
      return {
        name,
        count: groupMembers.length,
        avgLevel: groupMembers.length ? (groupMembers.reduce((sum, member) => sum + member.currentLevel, 0) / groupMembers.length).toFixed(1) : "0.0",
        l3Rate: groupMembers.length ? Math.round(groupMembers.filter(member => member.currentLevel >= 3).length / groupMembers.length * 100) : 0,
        pendingPromotion: groupReviews.length,
        publishedAssets: groupPublished.length,
        newAssets: groupAssets.filter(asset => inPeriod(asset.createdAt)).length,
        reuseTimes: groupEvents.length,
        pendingAssets: groupAssets.filter(asset => asset.reviewStatus === "待审核").length,
      };
    });
    const averageLevel = selectedMembers.length ? Number((selectedMembers.reduce((sum, member) => sum + member.currentLevel, 0) / selectedMembers.length).toFixed(1)) : 0;
    const l3Rate = selectedMembers.length ? Math.round(selectedMembers.filter(member => member.currentLevel >= 3).length / selectedMembers.length * 100) : 0;
    const l6Rate = selectedMembers.length ? Math.round(selectedMembers.filter(member => member.currentLevel >= 6).length / selectedMembers.length * 100) : 0;
    return {
      memberCount: selectedMembers.length,
      averageLevel,
      l3Rate,
      l6Rate,
      levelDistribution,
      reviewStates,
      periodPromotions,
      groupRows,
      publishedAssets,
      newAssetCount: selectedAssets.filter(asset => inPeriod(asset.createdAt)).length,
      periodReuseCount: periodReuseEvents.length,
      pendingAssetCount: selectedAssets.filter(asset => asset.reviewStatus === "待审核").length,
      typeDist,
      topReused,
    };
  }, [analysisGroup, analysisPeriod, groups, workspace?.assetReuseEvents, workspace?.assets, workspace?.members, workspace?.promotionHistory, workspace?.reviews]);
  const analysisPeriodLabel = analysisPeriod === "month" ? "本月" : analysisPeriod === "quarter" ? "近 90 天" : "全部时间";
  const selectedAsset = useMemo(() => workspace?.assets.find(asset => asset.id === selectedAssetId) || null, [selectedAssetId, workspace?.assets]);
  const editingAsset = assetDraft?.id ? workspace?.assets.find(item => item.id === assetDraft.id) || null : null;
  const visibleReviews = useMemo(() => {
    const reviews = workspace?.reviews || [];
    let filtered: Review[];
    if (reviewScope === "assigned") filtered = reviews.filter(review => review.reviewerEmail === workspace?.me?.email);
    else if (reviewScope === "mine") filtered = reviews.filter(review => review.memberId === workspace?.me?.memberId);
    else filtered = reviews;
    return filtered.toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }, [reviewScope, workspace?.me, workspace?.reviews]);

  const reviewTasks = useMemo<ReviewTask[]>(() => {
    const tasks: ReviewTask[] = [];
    if (reviewTypeFilter !== "asset") for (const review of visibleReviews) tasks.push({ kind: "promotion", review });
    if (reviewTypeFilter !== "promotion") for (const asset of assetReviewTasks) tasks.push({ kind: "asset", asset });
    return tasks.toSorted((a, b) => {
      const ta = a.kind === "promotion" ? a.review.submittedAt : a.asset.updatedAt;
      const tb = b.kind === "promotion" ? b.review.submittedAt : b.asset.updatedAt;
      return ta.localeCompare(tb);
    });
  }, [reviewTypeFilter, visibleReviews, assetReviewTasks]);

  function copyUncheckedList() {
    const names = (workspace?.members || []).filter(member => !member.checkedInThisMonth).map(member => member.name);
    if (!names.length) { showToast("本月所有成员都已更新进展"); return; }
    navigator.clipboard.writeText(`本月尚未更新成长进展（${names.length} 人）：${names.join("、")}`)
      .then(() => showToast(`已复制 ${names.length} 位未更新成员名单`))
      .catch(() => showToast("复制失败，请重试"));
  }

  const navItems = [
    { id: "growth" as const, label: "我的成长", icon: Target },
    { id: "capability" as const, label: "能力阶梯", icon: Map },
    { id: "review" as const, label: "评审中心", icon: ClipboardCheck },
    { id: "team" as const, label: "团队", icon: Users },
  ];

  return <main className="control-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); window.requestAnimationFrame(() => { const mainContent = document.getElementById("main-content"); mainContent?.focus(); mainContent?.scrollIntoView({ block: "start" }); }); }}>跳到主要内容</a>
    <header className="control-header">
      <button className="brand-button" type="button" onClick={() => setActiveView("growth")} aria-label="回到千问计划首页">
        <Image className="brand-lockup" src={qwenworkLogos.light.src} alt={qwenworkLogos.light.alt} width={975} height={256} priority />
        <span className="brand-context">千问计划</span>
      </button>
      <button className="mobile-menu" type="button" aria-label={mobileNavOpen ? "关闭导航" : "打开导航"} aria-controls="primary-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(open => !open)}><Menu size={20} /></button>
      <nav id="primary-navigation" className={`control-nav ${mobileNavOpen ? "is-open" : ""}`} aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeView === id ? "active" : ""} aria-current={activeView === id ? "page" : undefined} onClick={() => { setActiveView(id); setMobileNavOpen(false); }}><Icon size={20} /><span>{label}</span>{id === "review" && pendingReviewCount + pendingAssetReviewCount > 0 ? <span className="nav-badge">{pendingReviewCount + pendingAssetReviewCount}</span> : null}</button>)}
      </nav>
      <div className="account-area">
        {workspace?.authenticated ? <div className="account-menu-anchor" ref={accountMenuRef}>
          <button className={`account-chip${accountMenuOpen ? " is-open" : ""}`} type="button" onClick={() => setAccountMenuOpen(open => !open)} aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-label="账号菜单">
            <span>{initials(workspace.me?.displayName || "千")}</span>
            <span><b>{workspace.me?.displayName}</b><small>{roleLabel}</small></span>
            <ChevronDown className="account-chip-caret" size={15} />
          </button>
          {accountMenuOpen ? createPortal(<div ref={accountMenuPopRef} className="account-menu" role="menu" aria-label="账号菜单">
            <div className="account-menu-profile">
              <span className="member-avatar">{initials(workspace.me?.displayName || "千")}</span>
              <span><b>{workspace.me?.displayName}</b>{workspace.me?.email ? <small>{workspace.me.email}</small> : null}<em className="account-menu-role">{roleLabel}</em></span>
            </div>
            <div className="account-menu-divider" />
            <button className="account-menu-item" type="button" role="menuitem" onClick={openFeedback}><MessageSquareWarning size={16} /><span>问题反馈</span></button>
            <button className="account-menu-item" type="button" role="menuitem" onClick={openHelp}><CircleHelp size={16} /><span>使用帮助</span></button>
            {workspace.me?.role === "admin" ? <button className="account-menu-item" type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); openAdmin(); }}><Settings2 size={16} /><span>管理设置</span></button> : null}
            <div className="account-menu-divider" />
            <button className="account-menu-item danger" type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); handleSignOut(); }}><LogOut size={16} /><span>退出登录</span></button>
          </div>, document.body) : null}
        </div> : <a className="header-action" href={SIGN_IN_URL}>登录后更新</a>}
      </div>
    </header>

    <section id="main-content" className="control-workspace" tabIndex={-1}>
      {loading && !workspace ? <div className="loading-screen" role="status" aria-live="polite"><span aria-hidden="true" /><p>正在整理成长数据…</p></div> : null}
      {loadError && !workspace ? <div className="error-card" role="alert"><p>加载失败：{loadError}</p><button className="btn btn-secondary" type="button" onClick={() => { setLoadError(null); setLoading(true); loadWorkspace().finally(() => setLoading(false)); }}>重试</button></div> : null}

      {activeView === "growth" && workspace ? <section className="workspace-view growth-view">
        <div className="page-heading compact-heading">
          <div><h1>我的成长 <span>专注下一次升级</span></h1><p className="heading-summary">{myMember ? `当前 L${myMember.currentLevel} · ${atTopLevel ? `已登顶 L${maxLevel}` : `下一级 L${nextLevelNumber}`} · ${myMember.progressStatus}` : `团队中位 L${workspace.metrics.median} · 从真实工作结果开始`}</p></div>
          <span className="cycle-indicator">{CURRENT_CYCLE} 周期 <ChevronDown size={16} /></span>
        </div>

        <div className="growth-command-layout">
          <section className="growth-hero-panel">
            <div className="growth-hero-top"><span>{myMember ? "当前认证" : "团队中位层级"}</span><div className="growth-hero-top-actions"><em>{CURRENT_CYCLE} 周期 · {currentStage.label}</em>{workspace.authenticated && myMember ? <button className={`hero-cta${checkinStale ? " is-stale" : ""}`} onClick={openCheckin}><PenLine size={14} />更新进展</button> : null}</div></div>
            <div className="growth-level-lockup"><div className="current-level-mark"><strong>L{myMember?.currentLevel ?? workspace.metrics.median}</strong>{myMember && !atTopLevel ? <em>距离 L{nextLevelNumber} 还差 {Math.max(0, nextLevelDef.criteria.length - nextLevelCoveredCount)} 项证据</em> : null}</div><div><small>{myMember ? "下一级" : "体系起点"}</small><b>{myMember ? `L${nextLevelNumber} · ${nextLevelDef.title} · ${nextLevelCoveredCount}/${nextLevelDef.criteria.length}已覆盖` : `L1 · ${activeLevels[0].title} · 登录后开始逐层爬坡`}</b><span>{!myMember ? "从真实工作结果开始" : atTopLevel ? "已抵达体系最高层级" : myMember.reviewStatus === "已通过" ? "已晋级，请更新进展设定新一级计划" : nextLevelDef.definition}</span>{myMember && !atTopLevel && myMember.reviewStatus !== "已通过" ? <em className="hero-target-date">计划 {formatDate(myMember.targetDate)} 前完成</em> : null}</div></div>
            <div className="growth-progress" aria-label="成长进度">
              {activeLevels.map(level => {
                const isTargetLevel = myMember && !atTopLevel && level.level === nextLevelNumber;
                return <button key={level.level} className={`${myMember && myMember.currentLevel >= level.level ? "reached" : ""} ${isTargetLevel ? "target" : ""} ${level.level === nextLevelNumber ? "next" : ""}`} onClick={() => { setFocusedLevelNumber(level.level); setActiveView("capability"); }} aria-label={isTargetLevel ? `查看 L${level.level} ${level.title}要求详情` : `查看 L${level.level} ${level.title}`}><i /><span>L{level.level}</span>{isTargetLevel ? <em className="progress-target-hint"><CircleHelp size={12} />查看要求</em> : null}</button>;
              })}
            </div>
            <div className="growth-hero-footer"><span><small>证据</small><b>{myMember ? `${nextLevelCoveredCount} / ${nextLevelDef.criteria.length}` : `${workspace.metrics.evidenceCompletion}%`}</b></span><span><small>评审状态</small><b>{myMember?.reviewStatus || `${workspace.metrics.pendingReviews} 项进行中`}</b></span>{myMember?.targetDate ? <span><small>目标完成时间</small><b>{myMember.targetDate}</b></span> : null}<span className="footer-actions"><button className="text-link" onClick={() => { setFocusedLevelNumber(nextLevelNumber); setActiveView("capability"); }}>查看目标标准 <ChevronRight size={16} /></button></span></div>
          </section>

          <aside className="next-action-card">
            <div className="panel-heading"><div><h2>下一步行动</h2></div><span className={myMember?.overdueTasks ? "risk-dot" : "ok-dot"} /></div>
            <h3>提交第 {Math.min(nextLevelCoveredCount + 1, nextLevelDef.criteria.length)} 项证据</h3>
            <p>选择符合 L{nextLevelNumber} 要求的项目或任务证据并提交，开启评审。</p>
            <div className="action-meta"><span><Clock3 size={16} />{formatDate(myMember?.targetDate || "2026-09-30")}</span><span><Gauge size={16} />{myMember?.progressStatus || "进行中"}</span></div>
            <div className="mini-progress"><span><small>L{nextLevelNumber} 证据覆盖</small><b>{nextLevelCoveredCount}/{nextLevelDef.criteria.length}</b></span><i><em style={{ width: `${nextLevelDef.criteria.length ? Math.round(nextLevelCoveredCount / nextLevelDef.criteria.length * 100) : 0}%` }} /></i></div>
            {workspace.authenticated ? <button className={`primary-action full${myEvidence.length === 0 ? ' pulse-animation' : ''}`} onClick={() => openEvidence()}>提交证据 <Plus size={16} /></button> : null}
          </aside>
          <section className="target-criteria-card">
            <div className="panel-heading"><div><h2>L{nextLevelNumber} 证据清单（{nextLevelCoveredCount}/{nextLevelDef.criteria.length}）</h2><p>达成后即可选择主评人提交</p></div><b>{nextLevelCoveredCount}/{nextLevelDef.criteria.length}</b></div>
            {myMember?.gap ? <div className="gap-callout"><small>当前差距</small><p>{myMember.gap}</p></div> : null}
            <div className="evidence-table-heading" aria-hidden="true"><span>证据要求</span><span>状态</span><span>关联任务/项目</span><span>提交时间</span><span>评审状态</span><span>操作</span></div>
            <div className="criteria-checklist">{nextLevelDef.criteria.map((criterion, index) => { const evidence = nextLevelEvidence.find(item => item.criterionKey === criterion.id); return <button key={criterion.id} onClick={() => { if (evidence) { openEvidenceEdit(evidence); } else { openEvidence(myMember, nextLevelNumber, criterion.id); } }}><span className={`criterion-number${evidence ? " done" : ""}`}>{evidence ? <Check size={16} /> : index + 1}</span><span className="criterion-copy"><b>{criterion.label}</b><small>{evidence?.outcome || criterion.evidenceHint}</small></span><span className="evidence-cell evidence-status">{evidence ? "已提交" : "未提交"}</span><span className="evidence-cell evidence-project">{evidence?.title || "—"}</span><span className="evidence-cell evidence-date">{evidence ? formatDate(evidence.createdAt) : "—"}</span><span className="evidence-cell evidence-review">{evidence?.status || "—"}</span><span className="evidence-cell evidence-action">{evidence ? "查看" : "去提交"}</span></button>; })}</div>
            {(() => { const activeReview = workspace.reviews.find(review => review.memberId === myMember?.id && ["已提交", "评审中", "待补证"].includes(review.state)); if (activeReview || myMember?.pendingReviewId) { return <button type="button" className="checklist-ready is-pending-review" onClick={() => { setReviewScope("mine"); setActiveView("review"); }}><Clock3 size={16} /> 晋级申请进行中 · {activeReview?.state || myMember?.reviewStatus} <ChevronRight size={16} /></button>; } const coveredCriteria = nextLevelDef.criteria.filter(c => nextLevelEvidence.some(e => e.criterionKey === c.id)); const total = nextLevelDef.criteria.length; const covered = coveredCriteria.length; if (covered >= total && total > 0) { return <button type="button" className="checklist-ready" onClick={() => { setReviewerEmail(""); setSubmitSuccess(false); setFormErrors({}); setReviewSubmitOpen(true); }}><CheckCircle size={16} /> 可提交晋级申请 <ArrowRight size={16} /></button>; } return <div className="checklist-pending" role="status"><span><Target size={16} aria-hidden="true" />还需 <b>{total - covered}</b> 条证据覆盖通关标准</span><small>逐条提交即可解锁晋级申请</small></div>; })()}
          </section>
          <aside className="feedback-card"><div className="feedback-card-head"><div><h2>近期待评审反馈</h2></div><button className="text-link" type="button" onClick={() => setActiveView("review")}>查看全部</button></div><div className="feedback-entry"><div><b>{hasRealFeedback ? `L${currentLevel} 评审反馈` : `L${currentLevel}→L${nextLevelNumber}：待补充证据`}</b><em>{myMember?.reviewStatus || "待补证"}</em></div><span><b>评审意见</b><small>{hasRealFeedback ? latestFeedback : "补齐关键实验数据与结论说明后，即可提交晋级申请。"}</small></span><button className="text-link" type="button" onClick={() => setActiveView("review")}>去补充证据 <ArrowRight size={15} /></button></div><div className="feedback-growth"><small>成长进度</small><span><b>L{currentLevel}</b><em>目标 L{nextLevelNumber}</em></span><i><em style={{ width: `${nextLevelDef.criteria.length ? Math.round(nextLevelCoveredCount / nextLevelDef.criteria.length * 100) : 0}%` }} /></i><p>距离目标完成：{myMember?.targetDate ? Math.max(0, Math.ceil((new Date(myMember.targetDate).getTime() - new Date(TODAY).getTime()) / 86400000)) : 0} 天</p></div></aside>
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
        <div className="page-heading"><div><h1>评审中心</h1><p className="heading-summary">{CURRENT_CYCLE} 周期 · {myMember?.pendingReviewId ? `进行中（${myMember.reviewStatus}）` : `${reviewTasks.length} 条记录`}</p></div></div>
        <div className="review-scope-tabs" role="tablist">
          <button className={reviewScope === "mine" ? "active" : ""} onClick={() => setReviewScope("mine")}>我的申请</button>
          {canReview ? <button className={reviewScope === "assigned" ? "active" : ""} onClick={() => setReviewScope("assigned")}>我的待评 <em>{pendingReviewCount + pendingAssetReviewCount}</em></button> : null}
          {workspace.me?.role === "admin" ? <button className={reviewScope === "all" ? "active" : ""} onClick={() => setReviewScope("all")}>全部评审</button> : null}
        </div>
        <div className="review-type-filter segmented-filter" role="tablist" aria-label="评审任务类型">
          {([{ id: "all", label: "全部" }, { id: "promotion", label: "晋级评审" }, { id: "asset", label: "成果发布" }] as const).map(item => <button key={item.id} type="button" className={reviewTypeFilter === item.id ? "active" : ""} onClick={() => setReviewTypeFilter(item.id)}>{item.label}</button>)}
        </div>
        <section className="review-board">
          <div className="review-board-head"><span>申请人与目标</span><span>材料/类型</span><span>状态</span><span>主评人</span><span>时间</span><span /></div>
          <div className="review-board-body">{reviewTasks.map(task => task.kind === "promotion" ? <button className="review-row" key={`review-${task.review.id}`} onClick={() => { setSelectedReview(task.review); setReviewFeedback(task.review.feedback || ""); setReviewDecision(task.review.state === "待补证" ? "待补证" : "已通过"); }}><span className="person-cell"><i className="member-avatar">{initials(task.review.memberName)}</i><span><b>{task.review.memberName}</b><small>晋级 · L{task.review.fromLevel} → L{task.review.targetLevel}</small></span></span><span><b>{task.review.evidenceCount}</b><small>条证据</small></span><span><em className={`state-label ${toneClass(task.review.state)}`} aria-label={`评审状态：${task.review.state}`}>{task.review.state}</em></span><span>{task.review.reviewerName}</span><span>{formatDate(task.review.submittedAt)}{reviewStaleDays(task.review) > 3 ? <em className="stale-label">滞留 {reviewStaleDays(task.review)} 天</em> : null}</span><ChevronRight size={16} /></button> : <button className="review-row" key={`asset-${task.asset.id}`} onClick={() => setSelectedAssetId(task.asset.id)}><span className="person-cell"><i className="member-avatar">{initials(task.asset.ownerName)}</i><span><b>{task.asset.title}</b><small>{task.asset.ownerName} · 成果发布</small></span></span><span><b>{task.asset.type}</b><small>{task.asset.industry}</small></span><span><em className={`state-label ${toneClass(task.asset.reviewStatus)}`} aria-label={`审核状态：${task.asset.reviewStatus}`}>{task.asset.reviewStatus}</em></span><span>{task.asset.reviewerName || "未指派"}</span><span>{formatDate(task.asset.updatedAt)}{assetStaleDays(task.asset) > 3 ? <em className="stale-label">滞留 {assetStaleDays(task.asset)} 天</em> : null}</span><ChevronRight size={16} /></button>)}{!reviewTasks.length ? <EmptyState icon={<ClipboardCheck size={20} />} title={workspace.authenticated ? "这里还没有记录" : "登录后查看评审记录"} copy={reviewScope === "assigned" ? "暂无待评任务，已完成的评审可在「我的申请」或「全部评审」中查看。" : reviewTypeFilter === "asset" ? "提交团队成果后，发布申请会出现在这里。" : "添加下一级证据后，即可发起第一次晋级申请。"} action={!workspace.authenticated ? <a className="primary-action" href={SIGN_IN_URL}>登录查看</a> : undefined} visual="evidence" /> : null}</div>
        </section>
        <div className="review-principles"><span><ShieldCheck size={20} /><b>认证层级不可自改</b></span><span><Clock3 size={20} /><b>建议 3 天内完成</b></span><span><UserRoundCheck size={20} /><b>一位主评人负责到底</b></span></div>
      </section> : null}

      {activeView === "team" && workspace ? <section className="workspace-view team-view">
        <div className="page-heading"><div><h1>团队</h1></div><div className="heading-metrics"><span><b>{workspace.metrics.updatedThisMonth}/{workspace.metrics.memberCount}</b><small>本月已更新</small></span><span><b>{workspace.metrics.atRisk}</b><small>需关注</small></span><span><b>{workspace.assets.filter(item => item.reviewStatus === "已发布").length}</b><small>成果</small></span></div></div>
        <div className="section-tabs">{workspace.monthlyReport ? <button className={teamTab === "report" ? "active" : ""} onClick={() => setTeamTab("report")}><Gauge size={20} />团队分析</button> : null}<button className={teamTab === "members" ? "active" : ""} onClick={() => setTeamTab("members")}><Users size={20} />成员概览</button><button className={teamTab === "assets" ? "active" : ""} onClick={() => setTeamTab("assets")}><Library size={20} />成果库</button></div>
        {teamTab === "members" ? <>
          <div className="team-toolbar"><label className="search-field"><Search size={20} /><input value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="搜索成员、岗位或任务" /></label><div className="segmented-filter">{groups.map(item => <button key={item} className={teamGroup === item ? "active" : ""} onClick={() => setTeamGroup(item)}>{item}</button>)}</div>{workspace.me?.role === "admin" ? <button className="secondary-action" onClick={copyUncheckedList}>复制未更新名单</button> : null}</div>
          <div className="team-filters">{['全部', '未更新', '需关注'].map(filter => (<button key={filter} className={`btn btn-text ${teamFilter === filter ? 'active' : ''}`} onClick={() => { setTeamFilter(filter); setTeamPageSize(20); }}>{filter}</button>))}{teamLevelFilter !== null ? <button className="btn btn-text active" onClick={() => setTeamLevelFilter(null)}>层级 L{teamLevelFilter} ×</button> : null}</div>
          <section className="team-table-panel"><div className="team-table-head team-table-5col"><span>成员</span><span>层级</span><span>成果</span><span>状态</span><span>操作</span></div><div className="team-table-body">{displayedMembers.map(member => <button className="team-row team-row-5col" key={member.id} onClick={() => setSelectedMember(member)}><span className="person-cell"><i className={`member-avatar industry-${member.industry}`}>{initials(member.name)}</i><span><b>{member.name}</b><small>{member.role} · {member.groupName}</small></span></span><span className="level-triplet"><b>L{member.currentLevel}</b><em className="arrow">→</em><em>L{Math.min(member.currentLevel + 1, activeLevels.length || 10)}</em></span><span className="member-asset-count"><b>{member.publishedAssetCount}</b><small>项已发布</small></span><span>{!member.checkedInThisMonth ? <em className="risk-label">本月未更新</em> : member.overdueTasks ? <em className="risk-label">逾期 {member.overdueTasks}</em> : <em className={`state-label ${toneClass(member.progressStatus)}`} aria-label={`推进状态：${member.progressStatus}`}>{member.progressStatus}</em>}</span><ChevronRight size={16} /></button>)}{!displayedMembers.length ? <EmptyState icon={<Users size={20} />} title="没有符合条件的成员" copy="调整搜索或小组筛选后重试。" /> : null}</div></section>
          {teamPageSize < filteredTeamMembers.length && (<button className="btn btn-text" onClick={() => setTeamPageSize(prev => prev + 20)}>加载更多（还有 {filteredTeamMembers.length - teamPageSize} 人）</button>)}
        </> : teamTab === "assets" ? <>
          <div className="asset-library-heading">
            <div><h2>团队成果库</h2><p>本人申请发布，指定主评人审核后才会进入团队复用。</p></div>
            <div className="asset-library-heading-actions">
              {canReview && pendingAssetReviewCount > 0 ? <button className="secondary-action" onClick={() => { setReviewScope("assigned"); setReviewTypeFilter("asset"); setActiveView("review"); }}>我的待评 {pendingAssetReviewCount} 项 <ChevronRight size={16} /></button> : null}
              <button className="primary-action" onClick={openAsset}>申请发布成果 <Plus size={16} /></button>
            </div>
          </div>
          <div className="asset-library-metrics" aria-label="成果库概览"><span><b>{assetAnalytics.publishedCount}</b><small>已发布成果</small></span><span><b>{assetAnalytics.pendingCount}</b><small>待发布评审</small></span><span><b>{assetAnalytics.totalReuse}</b><small>链接复制次数</small></span></div>
          <div className="asset-toolbar"><label className="search-field"><Search size={20} /><input value={assetQuery} onChange={event => setAssetQuery(event.target.value)} placeholder="搜索成果、行业或作者" /></label><div className="segmented-filter">{["全部", "Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <button key={item} className={assetType === item ? "active" : ""} onClick={() => setAssetType(item)}>{item}</button>)}</div></div>
          <div className="asset-subbar"><div className="segmented-filter">{["全部", "已发布", "待审核", "待补充", "已撤回"].map(item => <button key={item} type="button" className={assetStatusFilter === item ? "active" : ""} onClick={() => setAssetStatusFilter(item)}>{item}</button>)}</div><label className="mine-toggle"><input type="checkbox" checked={assetMineOnly} onChange={event => setAssetMineOnly(event.target.checked)} /><span>只看我的</span></label></div>
          <section className="asset-library-panel">
            <div className="asset-table-head"><span>成果</span><span>复用</span><span>发布状态</span><span className="asset-action-head">操作</span></div>
            <div className="asset-list">{filteredAssets.map(asset => <AssetRow key={asset.id} asset={asset} onOpen={() => setSelectedAssetId(asset.id)} onCopyLink={() => copyAssetLink(asset)} />)}{!filteredAssets.length ? <EmptyState icon={<Library size={20} />} title="没有符合条件的成果" copy="调整搜索、状态或类型筛选后重试。" visual="evidence" /> : null}</div>
          </section>
        </> : workspace.monthlyReport ? <section className="team-analysis">
          <div className="analysis-controls">
            <div className="analysis-lens-tabs" role="tablist" aria-label="团队分析主题">
              <button type="button" role="tab" aria-selected={analysisLens === "growth"} className={analysisLens === "growth" ? "active" : ""} onClick={() => setAnalysisLens("growth")}>层级与晋级</button>
              <button type="button" role="tab" aria-selected={analysisLens === "assets"} className={analysisLens === "assets" ? "active" : ""} onClick={() => setAnalysisLens("assets")}>成果</button>
            </div>
            <div className="team-analysis-filters" aria-label="团队分析筛选">
              <label><small>时间范围</small><select value={analysisPeriod} onChange={event => setAnalysisPeriod(event.target.value as AnalysisPeriod)}><option value="month">本月</option><option value="quarter">近 90 天</option><option value="all">全部时间</option></select></label>
              <label><small>团队范围</small><select value={analysisGroup} onChange={event => setAnalysisGroup(event.target.value)}>{analysisGroups.map(group => <option key={group}>{group}</option>)}</select></label>
            </div>
          </div>
          {analysisLens === "growth" ? <>
            <section className="analysis-kpi-strip" aria-label="层级与晋级概览">
              <span><Users size={20} /><small>团队成员</small><b>{teamAnalysis.memberCount}</b></span>
              <span><Target size={20} /><small>平均层级</small><b>L{teamAnalysis.averageLevel}</b></span>
              <span><BadgeCheck size={20} /><small>L3+ 覆盖率</small><b>{teamAnalysis.l3Rate}%</b></span>
              <span><ArrowRight size={20} /><small>{analysisPeriodLabel}晋级</small><b>{teamAnalysis.periodPromotions.length}</b></span>
            </section>
            <div className="analysis-primary-grid">
              <section className="analysis-panel">
                <div className="panel-heading"><div><h3>当前层级分布</h3><p>{analysisGroup === "全部团队" ? "团队当前能力结构" : `${analysisGroup}当前能力结构`} · L6+ 骨干 {teamAnalysis.l6Rate}%</p></div></div>
                <div className="level-distribution-list">{teamAnalysis.levelDistribution.map((count, index) => { const max = Math.max(...teamAnalysis.levelDistribution, 1); return <button key={index} type="button" onClick={() => { setTeamLevelFilter(index + 1); setTeamGroup(analysisGroup === "全部团队" ? "全部" : analysisGroup); setTeamTab("members"); setTeamPageSize(20); }} aria-label={`查看 L${index + 1} 成员，共 ${count} 人`}><b>{count}</b><i><em style={{ height: `${count ? Math.round(count / max * 100) : 0}%` }} /></i><span>L{index + 1}</span></button>; })}</div>
              </section>
              <section className="analysis-panel promotion-progress-panel">
                <div className="panel-heading"><div><h3>晋级进程</h3><p>{analysisPeriodLabel}内提交的晋级申请</p></div><ClipboardCheck size={20} /></div>
                <div className="promotion-state-list">{teamAnalysis.reviewStates.map(item => <button key={item.state} type="button" onClick={() => { setReviewScope(workspace.me?.role === "admin" ? "all" : canReview ? "assigned" : "mine"); setReviewTypeFilter("promotion"); setActiveView("review"); }}><span className={`pulse-dot ${toneClass(item.state)}`} /><small>{item.state}</small><b>{item.count}</b></button>)}</div>
                <div className="promotion-outcome"><BadgeCheck size={22} /><div><small>{analysisPeriodLabel}通过晋级</small><b>{teamAnalysis.periodPromotions.length ? `${teamAnalysis.periodPromotions.length} 人完成晋级` : `${analysisPeriodLabel}暂无晋级`}</b></div></div>
              </section>
            </div>
            <section className="analysis-table-panel">
              <div className="analysis-table-title"><div><h3>团队对比</h3><p>团队范围用于聚焦上方分析；下表保留横向比较。</p></div></div>
              <div className="analysis-table-head growth-table"><span>团队</span><span>人数</span><span>平均层级</span><span>L3+ 覆盖</span><span>{analysisPeriodLabel}晋级待办</span></div>
              <div>{teamAnalysis.groupRows.map(group => <button type="button" key={group.name} className={`analysis-table-row growth-table${analysisGroup === group.name ? " is-active" : ""}`} onClick={() => setAnalysisGroup(group.name)}><span><b>{group.name}</b><small>{analysisGroup === group.name ? "当前已聚焦" : "查看该团队"}</small></span><span>{group.count}</span><span>L{group.avgLevel}</span><span>{group.l3Rate}%</span><span>{group.pendingPromotion}</span></button>)}</div>
            </section>
          </> : <>
            <section className="analysis-kpi-strip" aria-label="成果概览">
              <span><Library size={20} /><small>已发布成果</small><b>{teamAnalysis.publishedAssets.length}</b></span>
              <span><Plus size={20} /><small>{analysisPeriodLabel}新增</small><b>{teamAnalysis.newAssetCount}</b></span>
              <span><Copy size={20} /><small>{analysisPeriodLabel}复用</small><b>{teamAnalysis.periodReuseCount}</b></span>
              <span><Clock3 size={20} /><small>待发布评审</small><b>{teamAnalysis.pendingAssetCount}</b></span>
            </section>
            <div className="analysis-primary-grid">
              <section className="analysis-panel">
                <div className="panel-heading"><div><h3>成果结构</h3><p>已发布成果按类型分布 · 点击查看成果库</p></div></div>
                <div className="asset-type-bars analysis-type-bars">{teamAnalysis.typeDist.map(item => { const max = Math.max(...teamAnalysis.typeDist.map(entry => entry.count), 1); return <button key={item.name} type="button" className="asset-type-bar" onClick={() => { setAssetType(item.name); setAssetStatusFilter("已发布"); setTeamTab("assets"); }}><span>{item.name}</span><i><em style={{ width: `${Math.round(item.count / max * 100)}%` }} /></i><b>{item.count}</b></button>; })}</div>
              </section>
              <section className="analysis-panel reuse-performance-panel">
                <div className="panel-heading"><div><h3>复用表现</h3><p>{analysisPeriodLabel}内的链接复制记录</p></div><Copy size={20} /></div>
                <div className="analysis-reuse-list">{teamAnalysis.topReused.length ? teamAnalysis.topReused.map(({ asset, periodReuse }, index) => <button type="button" key={asset.id} onClick={() => setSelectedAssetId(asset.id)}><span className={index < 3 ? "ranked" : ""}>{index + 1}</span><div><b>{asset.title}</b><small>{asset.type} · {asset.ownerName}</small></div><em>{asset.reusePeople} 人 · {periodReuse} 次</em></button>) : <div className="analysis-empty"><PackageCheck size={24} /><p>{analysisPeriodLabel}暂无复用记录</p><small>成员复制已发布成果链接后，会在这里汇总。</small></div>}</div>
              </section>
            </div>
            <section className="analysis-table-panel">
              <div className="analysis-table-title"><div><h3>团队成果贡献</h3><p>发布总量看沉淀，新增与复用看本期活跃度。</p></div><button type="button" className="text-link" onClick={() => setTeamTab("assets")}>前往成果库 <ChevronRight size={16} /></button></div>
              <div className="analysis-table-head asset-contribution-table"><span>团队</span><span>发布成果</span><span>{analysisPeriodLabel}新增</span><span>{analysisPeriodLabel}复用</span><span>待发布评审</span></div>
              <div>{teamAnalysis.groupRows.map(group => <button type="button" key={group.name} className={`analysis-table-row asset-contribution-table${analysisGroup === group.name ? " is-active" : ""}`} onClick={() => setAnalysisGroup(group.name)}><span><b>{group.name}</b><small>{analysisGroup === group.name ? "当前已聚焦" : "查看该团队"}</small></span><span>{group.publishedAssets}</span><span>{group.newAssets}</span><span>{group.reuseTimes}</span><span>{group.pendingAssets}</span></button>)}</div>
            </section>
          </>}
        </section> : <EmptyState icon={<Gauge size={20} />} title="团队分析数据生成中" copy="登录后即可查看团队层级、晋级与成果分析。" />}
      </section> : null}
    </section>

    {onboardingDraft ? <DialogFrame title="欢迎加入千问计划" onClose={() => setOnboardingDraft(null)} size="wide"><div className="dialog-form">
      <div className="dialog-heading"><span>WELCOME · STEP {onboardingDraft.step}/2</span><h2>{onboardingDraft.step === 1 ? "先告诉我们你在哪里" : "写下你的下一步行动"}</h2></div>
      <div className="onboarding-steps" aria-hidden="true">{[1, 2].map(step => <span key={step} className={onboardingDraft.step >= step ? "active" : ""} />)}</div>
      {onboardingDraft.step === 1 ? <div className="form-grid"><label><FieldLabel text="所属小组" required /><input value={onboardingDraft.groupName} onChange={event => { setOnboardingDraft({ ...onboardingDraft, groupName: event.target.value }); setFormErrors(prev => { const { onboardingGroupName, ...rest } = prev; return rest; }); }} onBlur={event => { if (!event.target.value.trim()) setFormErrors(prev => ({ ...prev, onboardingGroupName: "此字段为必填" })); }} placeholder="例如：能源组" aria-invalid={!!formErrors.onboardingGroupName} aria-describedby={formErrors.onboardingGroupName ? "onboarding-group-name-error" : undefined} />{formErrors.onboardingGroupName ? <span id="onboarding-group-name-error" className="field-error">{formErrors.onboardingGroupName}</span> : null}</label><label>主要行业<select value={onboardingDraft.industry} onChange={event => setOnboardingDraft({ ...onboardingDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div> : null}
      {onboardingDraft.step === 2 ? <><label><FieldLabel text="下一步行动" required /><input value={onboardingDraft.nextTask} onChange={event => { setOnboardingDraft({ ...onboardingDraft, nextTask: event.target.value }); setFormErrors(prev => { const { onboardingNextTask, ...rest } = prev; return rest; }); }} onBlur={event => { if (!event.target.value.trim()) setFormErrors(prev => ({ ...prev, onboardingNextTask: "此字段为必填" })); }} placeholder="例如：用 AI 完成一次客户拜访前的情报汇总" aria-invalid={!!formErrors.onboardingNextTask} aria-describedby={formErrors.onboardingNextTask ? "onboarding-next-task-error" : undefined} />{formErrors.onboardingNextTask ? <span id="onboarding-next-task-error" className="field-error">{formErrors.onboardingNextTask}</span> : null}</label><label><FieldLabel text="下一级计划完成日期" required /><input type="date" min={TODAY} value={onboardingDraft.targetDate} aria-invalid={!!formErrors.onboardingDate} aria-describedby={formErrors.onboardingDate ? "onboarding-date-error" : undefined} onChange={event => { setOnboardingDraft({ ...onboardingDraft, targetDate: event.target.value }); setFormErrors(prev => { const { onboardingDate, ...rest } = prev; return rest; }); }} />{formErrors.onboardingDate ? <span id="onboarding-date-error" className="field-error">{formErrors.onboardingDate}</span> : null}</label></> : null}
      <div className="form-actions">
        <button type="button" className="text-link" onClick={skipOnboarding}>稍后完成</button>
        {onboardingDraft.step > 1 ? <button type="button" className="secondary-action" onClick={() => setOnboardingDraft({ ...onboardingDraft, step: onboardingDraft.step - 1 })}>上一步</button> : null}
        {onboardingDraft.step < 2 ? <button type="button" className="primary-action" disabled={!onboardingDraft.groupName.trim()} onClick={() => setOnboardingDraft({ ...onboardingDraft, step: onboardingDraft.step + 1 })}>下一步 <ArrowRight size={16} /></button> : <button type="button" className="primary-action" disabled={busy || !onboardingDraft.nextTask.trim()} onClick={async () => { if (onboardingDraft.targetDate && onboardingDraft.targetDate < TODAY) { setFormErrors(prev => ({ ...prev, onboardingDate: "完成日期不能早于今天" })); return; } const ok = await mutate({ action: "complete_onboarding", groupName: onboardingDraft.groupName, industry: onboardingDraft.industry, targetDate: onboardingDraft.targetDate, nextTask: onboardingDraft.nextTask }, "欢迎加入千问计划，成长档案已建立"); if (ok) { const memberId = workspace?.myMember?.id; if (memberId != null) { try { window.localStorage.removeItem(`qw_onboarding_skip_${memberId}`); } catch { /* 忽略 */ } } setOnboardingDraft(null); openEvidence(workspace?.myMember, nextLevelNumber); } }}>{busy ? "保存中…" : "完成引导"}</button>}
      </div>
    </div></DialogFrame> : null}

    {checkinDraft ? <DialogFrame title="更新成长进展" onClose={() => setCheckinDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); if (checkinDraft.targetDate && checkinDraft.targetDate < TODAY) { setFormErrors(prev => ({ ...prev, checkinDate: "完成日期不能早于今天" })); return; } const ok = await mutate({ action: "update_checkin", ...checkinDraft }, "进展已更新"); if (ok) setCheckinDraft(null); }}>
      <div className="dialog-heading"><span>PERSONAL CHECK-IN</span><h2>更新成长进展</h2></div>
      <div className="certified-banner"><BadgeCheck size={20} /><span><small>当前认证层级</small><b>L{workspace?.members.find(item => item.id === checkinDraft.memberId)?.currentLevel ?? 0} · 下一级 L{nextLevelNumber} · 逐层爬坡</b></span></div>
      <div className="form-section-label">本周打卡<small>建议每周更新一次 · 上次更新 {formatDate(workspace?.members.find(item => item.id === checkinDraft.memberId)?.updatedAt || "")}</small></div>
      <div className="form-grid"><label><FieldLabel text="推进状态" required /><select value={checkinDraft.progressStatus} onChange={event => setCheckinDraft({ ...checkinDraft, progressStatus: event.target.value })}>{["正常", "进行中", "有风险", "阻塞"].map(status => <option key={status}>{status}</option>)}</select></label><label><FieldLabel text="下一级计划完成日期" required /><input type="date" min={TODAY} value={checkinDraft.targetDate} aria-invalid={!!formErrors.checkinDate} aria-describedby={formErrors.checkinDate ? "checkin-date-error" : undefined} onChange={event => { setCheckinDraft({ ...checkinDraft, targetDate: event.target.value }); setFormErrors(prev => { const { checkinDate, ...rest } = prev; return rest; }); }} />{formErrors.checkinDate ? <span id="checkin-date-error" className="field-error">{formErrors.checkinDate}</span> : null}</label></div>
      <label>下一步任务<input value={checkinDraft.nextTask} onChange={event => setCheckinDraft({ ...checkinDraft, nextTask: event.target.value })} placeholder="当前最重要的一件事" /></label>
      <details className="evidence-more"><summary>目标与计划（当前差距 · 本月行动计划）</summary>
      <label>当前差距<textarea rows={3} value={checkinDraft.gap} onChange={event => setCheckinDraft({ ...checkinDraft, gap: event.target.value })} placeholder="对照下一级标准，描述还缺少什么" /></label>
      <label>本月行动计划<textarea rows={3} value={checkinDraft.plan} onChange={event => setCheckinDraft({ ...checkinDraft, plan: event.target.value })} placeholder="写清楚具体动作、截止时间与业务场景" /></label>
      </details>
      <div className="form-actions"><button type="button" className="secondary-action" onClick={() => setCheckinDraft(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存更新"}</button></div>
    </form></DialogFrame> : null}

    {evidenceDraft ? <DialogFrame title={evidenceDraft.id ? "编辑晋级证据" : "添加晋级证据"} onClose={() => setEvidenceDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = evidenceDraft.id ? await mutate({ action: "update_evidence", evidenceId: evidenceDraft.id, level: evidenceDraft.level, criterionKey: evidenceDraft.criterionKey, title: evidenceDraft.title, kind: evidenceDraft.kind, url: evidenceDraft.url, outcome: evidenceDraft.outcome, nominateAsset: evidenceDraft.nominateAsset, assetType: evidenceDraft.assetType }, "证据已更新，重新进入待核验") : await mutate({ action: "add_evidence", ...evidenceDraft }, evidenceDraft.nominateAsset ? "证据已添加；晋级通过后将自动发布到成果库" : "证据已添加，等待评审核验"); if (ok) setEvidenceDraft(null); }}>
      <div className="dialog-heading"><span>晋级证据</span><h2>{evidenceDraft.id ? "编辑" : "添加"} L{evidenceDraft.level} 晋级证据</h2></div>
      {evidenceDraft.level !== nextLevelNumber && <div className="level-hint">当前填写的是 L{evidenceDraft.level} 证据，你的下一级是 L{nextLevelNumber}</div>}
      <div className="form-grid"><label>证据层级<select value={evidenceDraft.level} onChange={event => { const level = Number(event.target.value); const definition = activeLevels.find(item => item.level === level)!; setEvidenceDraft({ ...evidenceDraft, level, criterionKey: definition.criteria[0]?.id || "" }); }}>{activeLevels.map(level => <option key={level.level} value={level.level}>L{level.level} · {level.title}</option>)}</select></label></div>
      <label><FieldLabel text="关联通关标准" required /><select value={evidenceDraft.criterionKey} onChange={event => setEvidenceDraft({ ...evidenceDraft, criterionKey: event.target.value })}>{activeLevels.find(item => item.level === evidenceDraft.level)?.criteria.map(criterion => <option key={criterion.id} value={criterion.id}>{criterion.label}</option>)}</select></label>
      <label><FieldLabel text="证据标题" required /><input required value={evidenceDraft.title} onChange={event => setEvidenceDraft({ ...evidenceDraft, title: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({...prev, title: '此字段为必填'})); } else { setFormErrors(prev => {const {title, ...rest} = prev; return rest;}); } }} placeholder="例如：MES 测试环境集成 POC 复盘" aria-describedby={formErrors.title ? "title-error" : undefined} aria-invalid={!!formErrors.title} /><small className="form-helper">写清楚项目、场景和交付物，便于评审快速判断。</small>{formErrors.title && <span id="title-error" className="field-error">{formErrors.title}</span>}</label>
      <label><FieldLabel text="业务结果" required /><textarea required rows={4} value={evidenceDraft.outcome} onChange={event => setEvidenceDraft({ ...evidenceDraft, outcome: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({...prev, outcome: '此字段为必填'})); } else { setFormErrors(prev => {const {outcome, ...rest} = prev; return rest;}); } }} placeholder={(evidenceDraft.level || nextLevelNumber) <= 3 ? "说明提效效果，如：节省了多少时间/减少了多少错误" : (evidenceDraft.level || nextLevelNumber) <= 6 ? "说明客户价值，如：帮助客户解决了什么问题" : "说明行业影响，如：推动了什么标准/影响了多少组织"} aria-describedby={formErrors.outcome ? "outcome-error" : undefined} aria-invalid={!!formErrors.outcome} /><small className="form-helper">优先写可验证的客户价值、数据或明确结论。</small>{formErrors.outcome && <span id="outcome-error" className="field-error">{formErrors.outcome}</span>}</label>
      <div className="form-grid evidence-material-fields">
        <label>证据类型<select value={evidenceDraft.kind} onChange={event => setEvidenceDraft({ ...evidenceDraft, kind: event.target.value })}>{["链接", "报告", "仓库", "演示", "使用记录", "客户反馈"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>材料链接<input type="url" value={evidenceDraft.url} onChange={event => setEvidenceDraft({ ...evidenceDraft, url: event.target.value })} placeholder="https://…（可选）" /></label>
      </div>
      <section className={`evidence-sync-option${evidenceDraft.nominateAsset ? " is-selected" : ""}`}>
        <label className="evidence-sync-toggle"><input type="checkbox" checked={evidenceDraft.nominateAsset} onChange={event => setEvidenceDraft({ ...evidenceDraft, nominateAsset: event.target.checked })} /><Library size={20} /><span><b>晋级通过后同步到成果库</b><small>本条证据会随对应层级的晋级申请一并核验；申请通过后自动发布，无需单独提交成果评审。</small></span></label>
        {evidenceDraft.nominateAsset ? <label className="evidence-asset-type"><FieldLabel text="成果类型" required /><select value={evidenceDraft.assetType} onChange={event => setEvidenceDraft({ ...evidenceDraft, assetType: event.target.value })}>{["Skill", "知识库", "评测集", "原型", "行业实践"].map(type => <option key={type}>{type}</option>)}</select><small>成果名称沿用证据标题，说明沿用业务结果，材料链接同步为成果链接。</small></label> : null}
      </section>
      {submitError && <div className="field-error">提交失败，请重试</div>}
      <div className="form-actions">{!busy && (!evidenceDraft.title?.trim() || !evidenceDraft.outcome?.trim()) ? <small className="evidence-submit-hint">完成“证据标题”和“业务结果”后即可提交</small> : null}{evidenceDraft.id ? <button type="button" className="danger-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "delete_evidence", evidenceId: evidenceDraft.id }, "证据已删除"); if (ok) setEvidenceDraft(null); }}>删除证据</button> : null}<button type="button" className="secondary-action" onClick={() => setEvidenceDraft(null)}>取消</button><button className="primary-action" disabled={busy || !evidenceDraft.title?.trim() || !evidenceDraft.outcome?.trim()}>{busy ? "保存中…" : evidenceDraft.id ? "保存修改" : "添加证据"}</button></div>
    </form></DialogFrame> : null}

    {reviewSubmitOpen && myMember ? <DialogFrame title="提交晋级申请" onClose={() => { setReviewSubmitOpen(false); setSubmitSuccess(false); }} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const ok = await mutate({ action: "submit_review", memberId: myMember.id, reviewerEmail }, ""); if (ok) { setSubmitSuccess(true); setTimeout(() => { setReviewSubmitOpen(false); setSubmitSuccess(false); showToast("晋级申请已提交给主评人"); }, 2500); } }}>{submitSuccess ? <div className="submit-success"><Image className="success-visual" src={brand3dAssets.unlock.src} width={1254} height={1254} alt="" aria-hidden="true" /><h3>已提交，等待评审</h3><p>主评人将在 3 个工作日内开始评审</p></div> : <><div className="dialog-heading"><span>PROMOTION REVIEW</span><h2>确认申请材料并选择主评人</h2></div><div className="review-detail-summary"><span><small>申请路径</small><b>L{myMember.currentLevel} → L{nextLevelNumber}</b></span><span><small>下一级计划完成日期</small><b>{formatDate(myMember.targetDate)}</b></span><span><small>下一级证据</small><b>{targetEvidence.length} 条</b></span></div><p className="dialog-hint">目标级别由系统按逐级爬坡规则自动锁定为下一级</p><ReviewMaterialPanel levelDef={activeLevels.find(level => level.level === nextLevelNumber)} evidences={targetEvidence} />{targetAssetEvidence.length ? <div className="auto-publish-notice"><Library size={20} /><span><b>{targetAssetEvidence.length} 条证据将自动同步成果库</b><small>若本次晋级申请通过，这些证据会直接发布为团队成果，不产生单独的成果评审任务。</small></span></div> : null}{!targetEvidence.length ? <div className="readonly-notice"><CircleAlert size={20} /><span>至少添加 1 条 L{nextLevelNumber} 证据后才能提交评审。</span></div> : null}<div className="form-section-label"><FieldLabel text="选择主评人" required /><small>评审人只处理分配给自己的申请</small></div><div className="reviewer-options">{workspace?.reviewers.filter(reviewer => reviewer.memberId !== myMember.id).map(reviewer => <label key={reviewer.email} className={reviewerEmail === reviewer.email ? "selected" : ""}><input type="radio" name="reviewer" value={reviewer.email} checked={reviewerEmail === reviewer.email} onChange={() => setReviewerEmail(reviewer.email)} /><span className="member-avatar">{initials(reviewer.displayName)}</span><span><b>{reviewer.displayName}</b><small>{reviewer.groupName} · {reviewer.role === "admin" ? "管理员" : "评审人"}</small></span><em>{reviewer.pendingCount} 项待评</em></label>)}</div>{!workspace?.reviewers.some(reviewer => reviewer.memberId !== myMember.id) ? <div className="readonly-notice"><CircleAlert size={20} /><span>目前没有可选主评人，请联系管理员先为一位成员开启评审权限。</span></div> : null}<div className="form-actions"><button type="button" className="secondary-action" onClick={() => setReviewSubmitOpen(false)}>取消</button><button className="primary-action" disabled={busy || !reviewerEmail || !targetEvidence.length}>{busy ? "提交中…" : "确认提交"}</button></div></>}</form></DialogFrame> : null}

    {selectedReview ? <DialogFrame title={`${selectedReview.memberName} 的晋级评审`} onClose={() => setSelectedReview(null)} size="wide"><div className="dialog-form"><div className="dialog-heading"><span>REVIEW DECISION</span><h2>{selectedReview.memberName} · L{selectedReview.fromLevel} → L{selectedReview.targetLevel}</h2></div><div className="review-detail-summary"><span><small>当前状态</small><b>{selectedReview.state}</b></span><span><small>主评人</small><b>{selectedReview.reviewerName}</b></span><span><small>提交时间</small><b>{formatDate(selectedReview.submittedAt)}</b></span></div><p className="dialog-hint">目标级别由系统按逐级爬坡规则自动锁定为下一级</p>{selectedReview.state === "已通过" ? (selectedReview.memberId === workspace?.me?.memberId ? <div className="promotion-note"><BadgeCheck size={20} /><span>你已晋级至 L{Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，去『我的成长』更新下一级进展</span><button type="button" className="text-link" onClick={() => { setSelectedReview(null); setActiveView("growth"); }}>前往更新 <ChevronRight size={16} /></button></div> : <div className="promotion-note"><BadgeCheck size={20} /><span>成员已晋级至 L{Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，请提醒其更新下一级进展</span></div>) : null}<ReviewMaterialPanel levelDef={activeLevels.find(level => level.level === selectedReview.targetLevel)} evidences={workspace?.evidences.filter(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel) || []} />{selectedReview.state === "待补证" && (() => { const reviewLevelDef = activeLevels.find(l => l.level === selectedReview.targetLevel); const reviewEvidences = workspace?.evidences.filter(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel) || []; const missingCriteria = reviewLevelDef?.criteria.filter(c => !reviewEvidences.some(e => e.criterionKey === c.id)) || []; return missingCriteria.length > 0 ? <div className="missing-criteria"><p>需补充以下标准的证据：</p><ul>{missingCriteria.map(c => <li key={c.id}><span>{c.label}</span>{selectedReview.memberId === workspace?.me?.memberId ? <button className="text-link" onClick={() => { setSelectedReview(null); openEvidence(myMember, selectedReview.targetLevel, c.id); }}>直接补充该证据 →</button> : null}</li>)}</ul></div> : null; })()}{selectedReview.feedback ? <div className="feedback-box"><UserRoundCheck size={20} /><div><small>已有反馈</small><p>{selectedReview.feedback}</p></div></div> : null}{selectedReview.memberId === workspace?.me?.memberId && ["已提交", "评审中", "待补证"].includes(selectedReview.state) ? (() => { const feedbackBaseline = selectedReview.reviewedAt || selectedReview.submittedAt; const hasFreshEvidence = (workspace?.evidences || []).some(item => item.memberId === selectedReview.memberId && item.level === selectedReview.targetLevel && item.createdAt > feedbackBaseline); return <>{selectedReview.state === "待补证" && !hasFreshEvidence ? <div className="readonly-notice"><CircleAlert size={20} /><span>反馈后暂无新增证据，请先补充新证据后再重新提交。</span></div> : null}<div className="form-actions owner-actions">{selectedReview.state === "待补证" ? <button className="primary-action" disabled={busy || !hasFreshEvidence} onClick={async () => { const ok = await mutate({ action: "resubmit_review", reviewId: selectedReview.id }, "已重新提交给主评人"); if (ok) setSelectedReview(null); }}>{busy ? "提交中…" : "补证完成，重新提交"}</button> : null}<button className="danger-action" disabled={busy} onClick={async () => { const ok = await mutate({ action: "withdraw_review", reviewId: selectedReview.id }, "申请已撤回，可修改后重新提交"); if (ok) setSelectedReview(null); }}>撤回申请</button></div></>; })() : null}{canDecideSelected ? <><label><FieldLabel text="评审结论" required /><select value={reviewDecision} onChange={event => { setReviewDecision(event.target.value); if (event.target.value === "已通过") setFormErrors(prev => { const { reviewFeedback: cleared, ...rest } = prev; return rest; }); }}>{["已通过", "待补证", "未通过"].map(item => <option key={item}>{item}</option>)}</select></label><label><FieldLabel text="评审反馈" required={reviewDecision !== "已通过"} /><textarea rows={5} value={reviewFeedback} onChange={event => { setReviewFeedback(event.target.value); setFormErrors(prev => { const { reviewFeedback: cleared, ...rest } = prev; return rest; }); }} onBlur={event => { if ((reviewDecision === "待补证" || reviewDecision === "未通过") && !event.target.value.trim()) setFormErrors(prev => ({ ...prev, reviewFeedback: "此字段为必填" })); }} placeholder={reviewDecision === '已通过' ? '简要说明通过理由（可选）' : reviewDecision === '待补证' ? '请指出缺少哪些证据/标准未覆盖（必填）' : reviewDecision === '未通过' ? '请说明原因和改进建议（必填）' : '请填写评审意见'} aria-invalid={!!formErrors.reviewFeedback} aria-describedby={formErrors.reviewFeedback ? "review-feedback-error" : undefined} />{formErrors.reviewFeedback ? <span id="review-feedback-error" className="field-error">{formErrors.reviewFeedback}</span> : null}</label><div className="form-actions"><button className="secondary-action" onClick={() => setSelectedReview(null)}>稍后处理</button><button className="primary-action" disabled={busy || ((reviewDecision === '待补证' || reviewDecision === '未通过') && !reviewFeedback?.trim())} onClick={async () => { const ok = await mutate({ action: "review_decision", reviewId: selectedReview.id, decision: reviewDecision, feedback: reviewFeedback }, reviewDecision === "已通过" ? `评审已通过，成员已晋级至 L${Math.min(selectedReview.targetLevel, selectedReview.fromLevel + 1)}，请提醒其更新下一级进展` : `评审已更新为“${reviewDecision}”`); if (ok) setSelectedReview(null); }}>{busy ? "处理中…" : "确认评审结论"}</button></div></> : <div className="readonly-notice"><LockKeyhole size={20} /><span>该申请由 {selectedReview.reviewerName} 主评，你可以查看进度与反馈。</span></div>}</div></DialogFrame> : null}

    {selectedMember ? <DialogFrame title={`${selectedMember.name} 的成长档案`} onClose={() => setSelectedMember(null)} size="drawer"><div className="member-profile"><div className="profile-hero"><span className={`member-avatar large industry-${selectedMember.industry}`}>{initials(selectedMember.name)}</span><div><h2>{selectedMember.name}</h2><p>{selectedMember.role} · {selectedMember.groupName}</p></div></div><div className="profile-levels"><span><small>认证</small><b>L{selectedMember.currentLevel}</b></span><span><small>下一级</small><b>L{Math.min(selectedMember.currentLevel + 1, activeLevels.length || 10)}</b></span></div><section><h3>当前差距</h3><p>{selectedMember.gap || "待补充"}</p></section><section><h3>本月计划</h3><p>{selectedMember.plan || "待补充"}</p></section><section><h3>下一步任务</h3><p>{selectedMember.nextTask || "待补充"}</p></section><div className="profile-facts"><span><FileCheck2 size={20} />{selectedMember.evidenceCount} 条证据</span><span><Library size={20} />{selectedMember.publishedAssetCount} 项成果</span><span><History size={20} />更新于 {formatDate(selectedMember.updatedAt)}</span><span><ClipboardCheck size={20} />{selectedMember.reviewStatus}</span></div></div></DialogFrame> : null}

    {assetDraft ? <DialogFrame title={assetDraft.id ? "更新并重新申请发布" : "申请发布成果"} onClose={() => setAssetDraft(null)} size="wide"><form className="dialog-form" onSubmit={async (event: FormEvent) => { event.preventDefault(); const url = assetDraft.url.trim(); if (url && !/^https?:\/\//.test(url)) { setFormErrors(prev => ({ ...prev, assetUrl: "链接必须以 http(s):// 开头" })); return; } const payload = { title: assetDraft.title, description: assetDraft.description, assetType: assetDraft.assetType, industry: assetDraft.industry, url: assetDraft.url, complianceConfirmed: assetDraft.complianceConfirmed, reviewerEmail: assetDraft.reviewerEmail }; const ok = assetDraft.id ? await mutate({ action: "update_asset", assetId: assetDraft.id, ...payload }, "成果已重新提交给主评人") : await mutate({ action: "create_asset", memberId: assetDraft.memberId, ...payload }, "成果已提交审核，主评人将收到通知"); if (ok) setAssetDraft(null); }}><div className="dialog-heading"><span>ASSET PUBLISHING</span><h2>{assetDraft.id ? "更新成果并重新申请发布" : "申请发布团队成果"}</h2></div>{assetDraft.id ? <div className="readonly-notice"><CircleAlert size={20} /><span>更新内容会作为一次新的发布申请，需由主评人再次审核后才会替换线上成果。</span></div> : null}<div className="form-section-label"><FieldLabel text="基本信息" required /><small>名称体现业务价值，描述写清适用场景</small></div><label><FieldLabel text="成果名称" required /><input required value={assetDraft.title} onChange={event => setAssetDraft({ ...assetDraft, title: event.target.value })} onBlur={e => { if (!e.target.value.trim()) { setFormErrors(prev => ({ ...prev, assetTitle: '此字段为必填' })); } else { setFormErrors(prev => { const { assetTitle, ...rest } = prev; return rest; }); } }} placeholder="使用业务价值清晰的名称" aria-describedby={formErrors.assetTitle ? "asset-title-error" : undefined} aria-invalid={!!formErrors.assetTitle} />{formErrors.assetTitle && <span id="asset-title-error" className="field-error">{formErrors.assetTitle}</span>}</label><div className="form-grid"><label><FieldLabel text="成果类型" required /><select value={assetDraft.assetType} onChange={event => setAssetDraft({ ...assetDraft, assetType: event.target.value })}>{["Skill", "知识库", "评测集", "原型", "行业实践"].map(item => <option key={item}>{item}</option>)}</select></label><label><FieldLabel text="所属行业" required /><select value={assetDraft.industry} onChange={event => setAssetDraft({ ...assetDraft, industry: event.target.value })}>{["高校", "新质", "能源", "政务", "通用"].map(item => <option key={item}>{item}</option>)}</select></label></div><label><FieldLabel text="成果描述（可选）" /><textarea rows={3} maxLength={500} value={assetDraft.description} onChange={event => setAssetDraft({ ...assetDraft, description: event.target.value })} placeholder="写清业务价值与适用场景：解决什么问题、适合哪些行业与任务复用" /><small className="char-count">{assetDraft.description.length}/500</small></label><div className="form-section-label"><FieldLabel text="材料链接" /><small>仓库、文档或演示地址（可选）</small></div><label><input type="url" value={assetDraft.url} onChange={event => { setAssetDraft({ ...assetDraft, url: event.target.value }); setFormErrors(prev => { const { assetUrl, ...rest } = prev; return rest; }); }} onBlur={e => { const value = e.target.value.trim(); if (value && !/^https?:\/\//.test(value)) { setFormErrors(prev => ({ ...prev, assetUrl: "链接必须以 http(s):// 开头" })); } else { setFormErrors(prev => { const { assetUrl, ...rest } = prev; return rest; }); } }} placeholder="https://…（可选）" aria-describedby={formErrors.assetUrl ? "asset-url-error" : undefined} aria-invalid={!!formErrors.assetUrl} />{formErrors.assetUrl && <span id="asset-url-error" className="field-error">{formErrors.assetUrl}</span>}</label><div className="form-section-label"><FieldLabel text="选择主评人" required /><small>仅这位主评人会在评审中心收到发布任务</small></div><div className="reviewer-options">{workspace?.reviewers.filter(reviewer => reviewer.memberId !== assetDraft.memberId).map(reviewer => <label key={reviewer.email} className={assetDraft.reviewerEmail === reviewer.email ? "selected" : ""}><input type="radio" name="assetReviewer" value={reviewer.email} checked={assetDraft.reviewerEmail === reviewer.email} onChange={() => setAssetDraft({ ...assetDraft, reviewerEmail: reviewer.email })} /><span className="member-avatar">{initials(reviewer.displayName)}</span><span><b>{reviewer.displayName}</b><small>{reviewer.groupName} · {reviewer.role === "admin" ? "管理员" : "评审人"}</small></span><em>{reviewer.pendingCount} 项待评</em></label>)}</div>{!workspace?.reviewers.some(reviewer => reviewer.memberId !== assetDraft.memberId) ? <div className="readonly-notice"><CircleAlert size={20} /><span>目前没有可选主评人，请联系管理员先为一位成员开启评审权限。</span></div> : null}<div className="form-section-label"><FieldLabel text="合规自查" required /></div><label className="compliance-check"><input type="checkbox" checked={assetDraft.complianceConfirmed} onChange={event => setAssetDraft({ ...assetDraft, complianceConfirmed: event.target.checked })} /><span><b>我已完成合规自查</b><small>客户与人名已匿名化、真实数据已替换、密钥与内网地址已剥离。</small></span></label><div className="form-actions"><button type="button" className="secondary-action" onClick={() => setAssetDraft(null)}>取消</button><button className="primary-action" disabled={busy || !assetDraft.title.trim() || !assetDraft.complianceConfirmed || !!formErrors.assetUrl || !assetDraft.reviewerEmail}>{busy ? (assetDraft.id ? "提交中…" : "申请中…") : assetDraft.id ? "更新并重新申请" : "提交发布申请"}</button></div></form></DialogFrame> : null}

    {adminOpen && workspace?.me?.role === "admin" ? <DialogFrame title="管理设置" onClose={() => setAdminOpen(false)} size="drawer"><div className="admin-settings"><div className="admin-heading"><span>管理与权限</span><h2>管理设置</h2></div><div className="admin-tabs"><button className={adminTab === "framework" ? "active" : ""} onClick={() => setAdminTab("framework")}>十级体系</button><button className={adminTab === "access" ? "active" : ""} onClick={() => setAdminTab("access")}>成员与评审人</button><button className={adminTab === "feedback" ? "active" : ""} onClick={() => setAdminTab("feedback")}>问题反馈</button></div>{adminTab === "framework" ? <div className="framework-admin"><div className="framework-status"><span><small>线上版本</small><b>{workspace.framework.published.versionName} · 已发布</b></span><span><small>编辑版本</small><b>{workspace.framework.draft?.versionName || "保存后自动创建草稿"}</b></span></div><div className="level-admin-picker">{(workspace.framework.draft?.levels || workspace.framework.published.levels).map(level => <button key={level.level} className={frameworkLevelDraft?.level === level.level ? "active" : ""} onClick={() => setFrameworkLevelDraft(structuredClone(level))}>L{level.level}<span>{level.title}</span></button>)}</div>{frameworkLevelDraft ? <form className="admin-level-form" onSubmit={async event => { event.preventDefault(); const criteria = frameworkLevelDraft.criteria.map(item => ({ ...item, label: item.label.trim(), evidenceHint: item.evidenceHint.trim() || "提交可核验材料" })).filter(item => item.label); const sanitized = { ...frameworkLevelDraft, criteria }; const ok = await mutate({ action: "save_framework_level", frameworkLevel: sanitized, changeNote: frameworkNote }, `L${frameworkLevelDraft.level} 草稿已保存`); if (ok) setFrameworkLevelDraft(sanitized); }}><div className="form-grid"><label><FieldLabel text="层级名称" required /><input value={frameworkLevelDraft.title} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, title: event.target.value })} /></label><label>能力角色<input value={frameworkLevelDraft.role} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, role: event.target.value })} /></label></div><label>所属阶段<select value={frameworkLevelDraft.stage} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, stage: event.target.value })}>{stageMeta.map(stage => <option key={stage.label}>{stage.label}</option>)}</select></label><label>能力定义<textarea rows={4} value={frameworkLevelDraft.definition} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, definition: event.target.value })} /></label><label><FieldLabel text="认证标准" required /><textarea rows={3} value={frameworkLevelDraft.standard} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, standard: event.target.value })} /></label><label>核心能力（用顿号分隔）<textarea rows={3} value={frameworkLevelDraft.abilities.join("、")} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, abilities: event.target.value.split(/[、，,\n]/).map(item => item.trim()).filter(Boolean) })} /></label><div className="criteria-editor"><div className="form-section-label"><FieldLabel text="通关标准" required /><small>每条包含标准与证据提示，保存时自动序列化</small></div>{frameworkLevelDraft.criteria.map((criterion, index) => <div className="criteria-editor-row" key={criterion.id}><input value={criterion.label} placeholder="标准" aria-label={`第 ${index + 1} 条标准`} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><input value={criterion.evidenceHint} placeholder="证据提示" aria-label={`第 ${index + 1} 条证据提示`} onChange={event => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.map((item, i) => i === index ? { ...item, evidenceHint: event.target.value } : item) })} /><button type="button" className="icon-button criteria-remove" aria-label={`删除第 ${index + 1} 条标准`} onClick={() => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: frameworkLevelDraft.criteria.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}<button type="button" className="secondary-action criteria-add" onClick={() => setFrameworkLevelDraft({ ...frameworkLevelDraft, criteria: [...frameworkLevelDraft.criteria, { id: nextCriterionId(frameworkLevelDraft), label: "", evidenceHint: "" }] })}><Plus size={16} /> 添加标准</button></div><label>版本说明<input value={frameworkNote} onChange={event => setFrameworkNote(event.target.value)} placeholder="说明本次为什么调整" /></label><div className="form-actions sticky-actions"><button className="secondary-action" type="button" disabled={busy || !workspace.framework.draft} onClick={async () => { const ok = await mutate({ action: "publish_framework", changeNote: frameworkNote }, "新版十级体系已发布"); if (ok) setAdminOpen(false); }}>发布新版</button><button className="primary-action" disabled={busy}>{busy ? "保存中…" : "保存草稿"}</button></div></form> : null}</div> : adminTab === "access" ? <div className="access-admin"><section className="role-summary" aria-label="成员角色分布">{adminRoleSummary.map(item => <span key={item.key}><small>{item.label}</small><b>{item.count}</b><em>{item.description}</em></span>)}</section><div className="admin-note"><ShieldCheck size={20} /><p>评审人也是普通成员，只多一个“处理分配给自己的评审”权限；管理员建议保留 1–2 位。</p></div><NewUserForm busy={busy} onCreate={fields => mutate({ action: "create_user", ...fields }, `${fields.displayName} 的账号已创建`)} /><section className="managed-user-list" aria-label="成员权限列表">{workspace.workspaceUsers.map(user => <ManagedUserRow key={`${user.email}:${user.role}:${user.groupName}`} user={user} busy={busy} isSelf={user.email === workspace.me?.email} onSave={(role, groupName) => mutate({ action: "update_user_access", email: user.email, role, groupName }, `${user.displayName} 的权限已更新`)} />)}</section></div> : <AdminFeedbackPanel showToast={showToast} />}</div></DialogFrame> : null}

    {levelGuide ? <DialogFrame title={`L${levelGuide.level} ${levelGuide.title}完整指南`} onClose={() => setLevelGuide(null)} size="drawer"><div className="level-guide"><div className="guide-hero" style={{ "--stage": stageForLevel(levelGuide.level, stageMeta).color } as CSSProperties}><span>{levelGuide.stage}</span><strong>L{levelGuide.level}</strong><h2>{levelGuide.title}</h2><p>{levelGuide.role}</p></div><section><p className="guide-definition">{levelGuide.definition}</p><div className="standard-callout"><small>认证标准</small><b>{levelGuide.standard}</b></div></section><section><h3>通关标准与证据示例</h3>{levelGuide.criteria.map((criterion, index) => <div className="guide-criterion" key={criterion.id}><span>{index + 1}</span><div><b>{criterion.label}</b><small>{criterion.evidenceHint}</small></div></div>)}</section><section><h3>业务实践</h3><ul>{levelGuide.practices.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul></section><section><h3>自我提升路径</h3><p>{levelGuide.path}</p></section>{levelGuide.resources.length ? <section><h3>学习资源</h3>{levelGuide.resources.map(resource => <a className="resource-link" key={resource.label} href={resource.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />{resource.label}<ChevronRight size={16} /></a>)}</section> : null}</div></DialogFrame> : null}

    {selectedAsset ? <AssetDetailDialog asset={selectedAsset} me={workspace?.me ?? null} busy={busy} onClose={() => setSelectedAssetId(null)} onEdit={() => { const asset = selectedAsset; setSelectedAssetId(null); openAssetEdit(asset); }} onWithdraw={async () => { const ok = await mutate({ action: "withdraw_asset", assetId: selectedAsset.id }, selectedAsset.reviewStatus === "已发布" ? "成果已下架" : "成果已撤回，可修改后重新提交"); if (ok) setSelectedAssetId(null); return ok; }} onResubmit={async () => { const ok = await mutate({ action: "resubmit_asset", assetId: selectedAsset.id }, "成果已重新提交审核，主评人将收到通知"); if (ok) setSelectedAssetId(null); return ok; }} onReview={async (decision, feedback) => { const ok = await mutate({ action: "review_asset", assetId: selectedAsset.id, decision, feedback }, decision === "已发布" ? "成果已发布到团队成果库" : "成果已退回，提交人将收到通知"); if (ok) setSelectedAssetId(null); return ok; }} onCopyLink={() => copyAssetLink(selectedAsset)} /> : null}

    {selectedAnchor ? <DialogFrame title={`${selectedAnchor.name}行业实战锚点`} onClose={() => setSelectedAnchor(null)} size="drawer"><div className="anchor-detail"><div className="anchor-hero"><span>{selectedAnchor.version}</span><h2>{selectedAnchor.name}</h2><p>{selectedAnchor.owner} · 每季度更新</p></div><p className="anchor-intro">每一个锚点任务都关联真实项目。完成后可整理为晋级证据；适合团队复用的内容可另行申请发布成果。</p>{selectedAnchor.items.map((item, index) => <div className="anchor-task" key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>L{item.level} · {item.title}</b><small>{item.template}</small></div><button onClick={() => { setSelectedAnchor(null); setFocusedLevelNumber(item.level); setActiveView("capability"); }} aria-label={`查看 L${item.level} 标准`}><ChevronRight size={16} /></button></div>)}<div className="compliance-rule"><FolderKanban size={20} /><div><b>成果关系</b><p>证据证明个人达标；审核发布后的成果沉淀组织复用，并反馈 L6+ 的能力认证。</p></div></div></div></DialogFrame> : null}

    {feedbackOpen && workspace?.authenticated ? <FeedbackDialog defaultPage={feedbackPage} isAdmin={workspace.me?.role === "admin"} onClose={() => setFeedbackOpen(false)} showToast={showToast} /> : null}

    {helpOpen ? <HelpCenterDialog role={workspace?.me?.role === "admin" ? "admin" : workspace?.me?.role === "reviewer" ? "reviewer" : "member"} onClose={() => setHelpOpen(false)} onFeedback={() => { setHelpOpen(false); openFeedback(); }} /> : null}

    {toast ? <div className="toast" role="status" aria-live="polite" aria-atomic="true">{toast}</div> : null}
  </main>;
}

function FeedbackDialog({ defaultPage, isAdmin, onClose, showToast }: { defaultPage: string; isAdmin: boolean; onClose: () => void; showToast: (message: string) => void }) {
  const [tab, setTab] = useState<"submit" | "mine">("submit");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageName, setPageName] = useState(defaultPage);
  const [screenshot, setScreenshot] = useState("");
  const [shotError, setShotError] = useState<string | null>(null);
  const [processingShot, setProcessingShot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [mine, setMine] = useState<FeedbackRecord[] | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [shots, setShots] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageOptions = FEEDBACK_PAGE_OPTIONS.filter(page => page !== "管理设置" || isAdmin);

  useEffect(() => {
    if (tab !== "mine") return;
    let cancelled = false;
    postWorkspace<{ feedbacks: FeedbackRecord[] }>({ action: "list_feedbacks", scope: "mine" })
      .then(data => { if (!cancelled) { setMine(data.feedbacks); setMineError(null); } })
      .catch(error => { if (!cancelled) setMineError(error instanceof Error ? error.message : "读取反馈失败"); });
    return () => { cancelled = true; };
  }, [tab]);

  async function acceptImage(file: File | null) {
    if (!file) return;
    if (!FEEDBACK_IMAGE_TYPES.includes(file.type)) { setShotError("仅支持 PNG / JPG / WebP 图片"); return; }
    setShotError(null);
    setProcessingShot(true);
    try { setScreenshot(await compressScreenshot(file)); }
    catch (error) { setShotError(error instanceof Error ? error.message : "图片处理失败"); }
    finally { setProcessingShot(false); }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (tab !== "submit" || submitted) return;
    const item = Array.from(event.clipboardData.items).find(entry => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    acceptImage(item.getAsFile());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await postWorkspace({ action: "submit_feedback", title: title.trim(), description: description.trim(), pageName, screenshot });
      setSubmitted(true);
      setMine(null);
      showToast("反馈已提交，感谢你的建议");
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "提交失败，请重试"); }
    finally { setSubmitting(false); }
  }

  function resetForm() {
    setTitle(""); setDescription(""); setScreenshot(""); setShotError(null); setSubmitError(null); setSubmitted(false);
  }

  async function toggleDetail(item: FeedbackRecord) {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next && item.hasScreenshot && !shots[item.id]) {
      try {
        const data = await postWorkspace<{ feedback: { screenshot: string } }>({ action: "get_feedback", feedbackId: item.id });
        setShots(prev => ({ ...prev, [item.id]: data.feedback.screenshot }));
      } catch { /* 截图加载失败不阻断详情展示 */ }
    }
  }

  return <DialogFrame title="问题反馈" onClose={onClose} size="wide"><div className="dialog-form" onPaste={onPaste}>
    <div className="dialog-heading"><span>FEEDBACK</span><h2>问题反馈</h2></div>
    <div className="feedback-tabs" role="tablist"><button className={tab === "submit" ? "active" : ""} onClick={() => setTab("submit")}>提交反馈</button><button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>我的反馈</button></div>
    {tab === "submit" ? (submitted ? <div className="submit-success">
      <CheckCircle size={48} className="success-icon" />
      <h3>已收到反馈</h3>
      <p>管理员会尽快处理，可在「我的反馈」中查看进展</p>
      <div className="form-actions"><button type="button" className="secondary-action" onClick={resetForm}>再提交一条</button><button type="button" className="primary-action" onClick={onClose}>关闭</button></div>
    </div> : <form className="feedback-form" onSubmit={submit}>
      <label><FieldLabel text="问题标题" required /><input maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="一句话描述遇到的问题或建议" /><span className="char-counter">{title.length}/100</span></label>
      <label><FieldLabel text="问题描述" required /><textarea rows={5} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder={"背景：在什么场景下遇到的\n预期行为：你期望发生什么\n实际行为：实际发生了什么"} /><span className="char-counter">{description.length}/2000</span></label>
      <label><FieldLabel text="所属页面" required /><select value={pageName} onChange={event => setPageName(event.target.value)}>{pageOptions.map(page => <option key={page}>{page}</option>)}</select></label>
      <div className="feedback-upload-block">
        <FieldLabel text="截图（可选）" />
        {screenshot ? <div className="feedback-shot-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- Base64 预览图，next/image 不适用 */}
          <img src={screenshot} alt="截图预览" />
          <button type="button" className="icon-button" aria-label="移除截图" onClick={() => setScreenshot("")}><X size={16} /></button>
        </div> : <button type="button" className="feedback-upload" disabled={processingShot} onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /><b>{processingShot ? "图片压缩中…" : "点击上传，或直接在弹窗内粘贴截图"}</b><small>支持 PNG / JPG / WebP，自动压缩后随反馈提交</small></button>}
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { acceptImage(event.target.files?.[0] || null); event.target.value = ""; }} />
        {shotError ? <span className="field-error">{shotError}</span> : null}
      </div>
      {submitError ? <span className="field-error">{submitError}</span> : null}
      <div className="form-actions"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button className="primary-action" disabled={submitting || processingShot || !title.trim() || !description.trim()}>{submitting ? "提交中…" : "提交反馈"}</button></div>
    </form>) : <div className="feedback-list">
      {mineError ? <div className="field-error">{mineError}</div> : null}
      {mine === null && !mineError ? <p className="dialog-hint">正在加载我的反馈…</p> : null}
      {mine?.length === 0 ? <EmptyState icon={<MessageSquareWarning size={20} />} title="还没有提交过反馈" copy="遇到问题或有建议时，欢迎在「提交反馈」中告诉我们。" /> : null}
      {mine?.map(item => <div className="feedback-item" key={item.id}>
        <button type="button" className="feedback-item-head" aria-expanded={expandedId === item.id} onClick={() => toggleDetail(item)}>
          <span className="feedback-item-title"><b>{item.title}</b>{item.adminResponse ? <em className="feedback-reply-badge">有回复</em> : null}</span>
          <span className="feedback-item-meta"><em className={`state-label ${FEEDBACK_STATUS_META[item.status]?.tone || "tone-neutral"}`} aria-label={`处理状态：${FEEDBACK_STATUS_META[item.status]?.label || item.status}`}>{FEEDBACK_STATUS_META[item.status]?.label || item.status}</em><small>{item.pageName} · {formatDate(item.createdAt)}</small></span>
          <ChevronDown size={16} className={expandedId === item.id ? "is-open" : ""} />
        </button>
        {expandedId === item.id ? <div className="feedback-detail">
          <p className="feedback-desc">{item.description}</p>
          {item.hasScreenshot ? <div className="feedback-screenshot">{shots[item.id] ? <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Base64 截图，next/image 不适用 */}
            <img src={shots[item.id]} alt={`${item.title} 截图`} />
          </> : <small>截图加载中…</small>}</div> : null}
          {item.adminResponse ? <div className="feedback-box"><UserRoundCheck size={20} /><div><small>管理员回复{item.resolvedAt ? ` · ${formatDate(item.resolvedAt)}` : ""}</small><p>{item.adminResponse}</p></div></div> : null}
        </div> : null}
      </div>)}
    </div>}
  </div></DialogFrame>;
}

function HelpCenterDialog({ role, onClose, onFeedback }: { role: HelpRole; onClose: () => void; onFeedback: () => void }) {
  const chapters = useMemo(() => helpChaptersForRole(role), [role]);
  const [activeId, setActiveId] = useState(chapters[0]?.id || "");
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const roleName = role === "admin" ? "管理员" : role === "reviewer" ? "评审人" : "成员";
  useEffect(() => {
    function focusHelpSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusHelpSearch);
    return () => window.removeEventListener("keydown", focusHelpSearch);
  }, []);
  const groupedChapters = useMemo(() => {
    const groups: { category: string; items: HelpChapter[] }[] = [];
    for (const chapter of chapters) {
      const group = groups.find(item => item.category === chapter.category);
      if (group) group.items.push(chapter);
      else groups.push({ category: chapter.category, items: [chapter] });
    }
    return groups;
  }, [chapters]);
  const quickLinks = useMemo(() => {
    const links = [
      { id: "qs-intro", label: "了解成长闭环", copy: "从进展、证据到晋级评审" },
      { id: "growth-evidence", label: "准备一条证据", copy: "把真实工作结果对应到通关标准" },
      { id: "growth-submit", label: "发起晋级申请", copy: "覆盖完成后选择主评人送审" },
      role === "admin"
        ? { id: "admin-access", label: "管理成员权限", copy: "维护角色、小组与新账号" }
        : role === "reviewer"
          ? { id: "review-reviewer", label: "处理待评任务", copy: "核验材料并给出结论" }
          : { id: "review-member", label: "跟踪我的申请", copy: "查看状态、补证或撤回" },
    ];
    return links.filter(link => chapters.some(chapter => chapter.id === link.id));
  }, [chapters, role]);
  const keyword = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!keyword) return [];
    return chapters.flatMap(chapter => {
      const hitLine = helpChapterLines(chapter).find(line => line.toLowerCase().includes(keyword));
      if (!hitLine) return [];
      const at = Math.max(0, hitLine.toLowerCase().indexOf(keyword) - 14);
      return [{ chapter, snippet: `${at > 0 ? "…" : ""}${hitLine.slice(at, at + 64)}${at + 64 < hitLine.length ? "…" : ""}` }];
    });
  }, [chapters, keyword]);
  const activeChapter = chapters.find(chapter => chapter.id === activeId) || chapters[0];
  const activeIndex = Math.max(0, chapters.findIndex(chapter => chapter.id === activeChapter?.id));
  if (!activeChapter) return null;

  return <DialogFrame title="使用帮助" onClose={onClose} size="drawer"><div className="help-center">
    <header className="help-hero">
      <span className="help-eyebrow"><CircleHelp size={14} /> 帮助中心</span>
      <div><h2>把下一步做清楚</h2><p>围绕当前版本的成长、评审与团队协作流程整理；内容会按你的权限自动筛选。</p></div>
      <span className="help-role-chip">当前身份 · {roleName}</span>
    </header>
    <section className="help-quick-start" aria-label="常用操作">
      <div className="help-quick-heading"><span>常用路径</span><small>建议按实际任务开始</small></div>
      <div className="help-quick-grid">
        {quickLinks.map((link, index) => <button key={link.id} type="button" onClick={() => setActiveId(link.id)}>
          <span>{String(index + 1).padStart(2, "0")}</span><div><b>{link.label}</b><small>{link.copy}</small></div><ChevronRight size={15} />
        </button>)}
      </div>
    </section>
    <label className="search-field help-search"><Search size={18} /><input ref={searchInputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索：证据、晋级、待补证、成果库…" aria-label="搜索帮助文档" /><kbd>⌘ K</kbd></label>
    {keyword ? <div className="help-search-results">
      <div className="help-search-summary">找到 {searchResults.length} 篇相关指南</div>
      {searchResults.map(({ chapter, snippet }) => <button key={chapter.id} type="button" onClick={() => { setActiveId(chapter.id); setQuery(""); }}><span>{chapter.category}</span><b>{chapter.title}</b><small>{snippet}</small><ChevronRight size={16} /></button>)}
      {!searchResults.length ? <EmptyState icon={<CircleHelp size={20} />} title="没有找到相关内容" copy="换个关键词试试，或在目录中浏览全部章节。" /> : null}
    </div> : <div className="help-body">
      <nav className="help-toc" aria-label="帮助目录">
        <div className="help-toc-heading"><span>全部指南</span><small>{chapters.length} 篇</small></div>
        {groupedChapters.map(group => <div className="help-toc-group" key={group.category}>
          <small>{group.category}</small>
          {group.items.map(chapter => <button key={chapter.id} type="button" className={activeChapter.id === chapter.id ? "active" : ""} onClick={() => setActiveId(chapter.id)}>{chapter.title}</button>)}
        </div>)}
      </nav>
      <article className="help-article" key={activeChapter.id}>
        <header className="help-article-head">
          <div><span className="help-article-category">{activeChapter.category}</span><h3>{activeChapter.title}</h3></div>
          <em>{String(activeIndex + 1).padStart(2, "0")}<small>/{String(chapters.length).padStart(2, "0")}</small></em>
          <p className="help-article-summary">{activeChapter.summary}</p>
        </header>
        <div className="help-article-content">
          {activeChapter.sections.map((section, index) => <section key={`${activeChapter.id}-${index}`}>
            <span className="help-section-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>{section.heading ? <h4>{section.heading}</h4> : null}
              {section.paragraphs?.map(paragraph => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
              {section.steps ? <ol>{section.steps.map(step => <li key={step.slice(0, 24)}>{step}</li>)}</ol> : null}
            </div>
          </section>)}
        </div>
        <button className="help-feedback-link" type="button" onClick={onFeedback}><MessageSquareWarning size={16} /> 仍有疑问？提交问题反馈 <ArrowRight size={15} /></button>
      </article>
    </div>}
  </div></DialogFrame>;
}

function AdminFeedbackPanel({ showToast }: { showToast: (message: string) => void }) {
  const [items, setItems] = useState<FeedbackRecord[] | null>(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [shots, setShots] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const payload: Record<string, unknown> = { action: "list_feedbacks", scope: "all" };
      if (statusFilter) payload.status = statusFilter;
      if (pageFilter) payload.pageName = pageFilter;
      if (keyword.trim()) payload.keyword = keyword.trim();
      const data = await postWorkspace<{ feedbacks: FeedbackRecord[]; stats: FeedbackStats }>(payload);
      setItems(data.feedbacks);
      setStats(data.stats);
      setLoadError(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "读取反馈失败"); }
  }, [statusFilter, pageFilter, keyword]);

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggleDetail(item: FeedbackRecord) {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next && item.hasScreenshot && !shots[item.id]) {
      try {
        const data = await postWorkspace<{ feedback: { screenshot: string } }>({ action: "get_feedback", feedbackId: item.id });
        setShots(prev => ({ ...prev, [item.id]: data.feedback.screenshot }));
      } catch { /* 截图加载失败不阻断详情展示 */ }
    }
  }

  return <div className="feedback-admin">
    {stats ? <div className="feedback-stats"><span><b>{stats.total}</b><small>总数</small></span><span><b>{stats.open}</b><small>待处理</small></span><span><b>{stats.inProgress}</b><small>处理中</small></span><span><b>{stats.resolved}</b><small>已解决</small></span></div> : null}
    <div className="feedback-filters">
      <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="按状态筛选"><option value="">全部状态</option>{Object.entries(FEEDBACK_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
      <select value={pageFilter} onChange={event => setPageFilter(event.target.value)} aria-label="按页面筛选"><option value="">全部页面</option>{FEEDBACK_PAGE_OPTIONS.map(page => <option key={page}>{page}</option>)}</select>
      <label className="search-field"><Search size={20} /><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索标题、描述或提交人" /></label>
    </div>
    {loadError ? <div className="field-error">{loadError}</div> : null}
    {items === null && !loadError ? <p className="dialog-hint">正在加载反馈…</p> : null}
    {items?.length === 0 ? <EmptyState icon={<MessageSquareWarning size={20} />} title="没有符合条件的反馈" copy="调整状态、页面或关键词筛选后重试。" /> : null}
    <div className="feedback-list">{items?.map(item => <div className="feedback-item" key={item.id}>
      <button type="button" className="feedback-item-head" aria-expanded={expandedId === item.id} onClick={() => toggleDetail(item)}>
        <span className="feedback-item-title"><b>{item.title}</b>{item.adminResponse ? <em className="feedback-reply-badge">已回复</em> : null}<small>{item.createdByEmail} · {item.pageName}</small></span>
        <span className="feedback-item-meta"><em className={`state-label ${FEEDBACK_STATUS_META[item.status]?.tone || "tone-neutral"}`} aria-label={`处理状态：${FEEDBACK_STATUS_META[item.status]?.label || item.status}`}>{FEEDBACK_STATUS_META[item.status]?.label || item.status}</em><small>{formatDate(item.createdAt)}</small></span>
        <ChevronDown size={16} className={expandedId === item.id ? "is-open" : ""} />
      </button>
      {expandedId === item.id ? <FeedbackAdminDetail key={item.id} item={item} screenshot={item.hasScreenshot ? shots[item.id] || null : ""} onSaved={load} showToast={showToast} /> : null}
    </div>)}</div>
  </div>;
}

function FeedbackAdminDetail({ item, screenshot, onSaved, showToast }: { item: FeedbackRecord; screenshot: string | null; onSaved: () => Promise<void>; showToast: (message: string) => void }) {
  const [status, setStatus] = useState(item.status);
  const [response, setResponse] = useState(item.adminResponse);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if ((status === "resolved" || status === "closed") && !response.trim()) {
      setSaveError("请填写处理说明后再标记为已解决/已关闭");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await postWorkspace({ action: "update_feedback", feedbackId: item.id, status, adminResponse: response.trim() });
      showToast("反馈处理结果已保存");
      await onSaved();
    } catch (error) { setSaveError(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }

  return <div className="feedback-detail">
    <p className="feedback-desc">{item.description}</p>
    {item.hasScreenshot ? <div className="feedback-screenshot">{screenshot ? <>
      {/* eslint-disable-next-line @next/next/no-img-element -- Base64 截图，next/image 不适用 */}
      <img src={screenshot} alt={`${item.title} 截图`} />
    </> : <small>截图加载中…</small>}</div> : null}
    <div className="feedback-admin-form">
      <label><FieldLabel text="处理状态" required /><select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(FEEDBACK_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
      <label>管理员回复<textarea rows={3} value={response} onChange={event => setResponse(event.target.value)} placeholder="处理说明或答复，提交人可在「我的反馈」中看到" /></label>
      {saveError ? <span className="field-error">{saveError}</span> : null}
      <div className="form-actions"><button type="button" className="primary-action" disabled={saving || (status === item.status && response.trim() === item.adminResponse)} onClick={save}>{saving ? "保存中…" : "保存处理结果"}</button></div>
    </div>
  </div>;
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

function AssetRow({ asset, onOpen, onCopyLink }: { asset: AssetRecord; onOpen: () => void; onCopyLink: () => void }) {
  const published = asset.reviewStatus === "已发布";
  return <article className="asset-row is-clickable" role="button" tabIndex={0} onClick={onOpen} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <div className="asset-icon">{asset.type === "Skill" ? <Sparkles size={20} /> : asset.type === "知识库" ? <BookOpen size={20} /> : asset.type === "评测集" ? <PackageCheck size={20} /> : <FolderKanban size={20} />}</div>
    <div className="asset-copy"><div><h3>{asset.title}</h3><span>{asset.type} · {asset.industry}</span></div><p>{asset.ownerName} · 主评人 {asset.reviewerName} · 更新于 {formatDate(asset.updatedAt)}</p></div>
    <div className="asset-reuse"><b>{asset.reusePeople}</b><small>人 · {asset.reuseTimes} 次</small></div>
    <div className="asset-states"><em className={`state-label ${toneClass(asset.reviewStatus)}`} aria-label={`审核状态：${asset.reviewStatus}`}>{asset.reviewStatus}</em><small><ShieldCheck size={15} />{asset.complianceStatus}</small></div>
    <div className="asset-review-actions">{published && asset.url ? <button type="button" onClick={event => { event.stopPropagation(); onCopyLink(); }}><Copy size={14} />复制链接</button> : <span>查看详情</span>}<ChevronRight size={16} /></div>
  </article>;
}

function AssetDetailDialog({ asset, me, busy, onClose, onEdit, onWithdraw, onResubmit, onReview, onCopyLink }: { asset: AssetRecord; me: WorkspacePayload["me"]; busy: boolean; onClose: () => void; onEdit: () => void; onWithdraw: () => Promise<boolean>; onResubmit: () => Promise<boolean>; onReview: (decision: string, feedback?: string) => Promise<boolean>; onCopyLink: () => void }) {
  const [returnReason, setReturnReason] = useState<string | null>(null);
  const isOwner = asset.ownerMemberId === me?.memberId;
  const isAdminRole = me?.role === "admin";
  const isReviewerRole = isAdminRole || me?.role === "reviewer";
  const pending = asset.reviewStatus === "待审核";
  const published = asset.reviewStatus === "已发布";
  const returned = ["待补充", "已撤回"].includes(asset.reviewStatus);
  const canDecide = pending && isReviewerRole && !isOwner && (isAdminRole || asset.reviewerEmail === me?.email);
  const staleDays = assetStaleDays(asset);
  return <DialogFrame title={`成果详情 · ${asset.title}`} onClose={onClose} size="wide"><div className="asset-detail">
    <div className="asset-detail-hero">
      <span className="asset-icon">{asset.type === "Skill" ? <Sparkles size={22} /> : asset.type === "知识库" ? <BookOpen size={22} /> : asset.type === "评测集" ? <PackageCheck size={22} /> : <FolderKanban size={22} />}</span>
      <div className="asset-detail-title">
        <span>{asset.type} · {asset.industry}</span>
        <h2>{asset.title}</h2>
        <div className="asset-detail-states"><em className={`state-label ${toneClass(asset.reviewStatus)}`} aria-label={`审核状态：${asset.reviewStatus}`}>{asset.reviewStatus}</em><small><ShieldCheck size={16} />{asset.complianceStatus}</small>{staleDays > 3 ? <em className="stale-label">滞留 {staleDays} 天</em> : null}</div>
      </div>
    </div>
    <div className="asset-detail-grid">
      <section className="asset-detail-main">
        <div className="asset-metadata-grid"><span><small>作者</small><b>{asset.ownerName}</b></span><span><small>所属行业</small><b>{asset.industry}</b></span><span><small>主评人</small><b>{asset.reviewerName}</b></span><span><small>最近更新</small><b>{formatDate(asset.updatedAt)}</b></span></div>
        <section className="asset-detail-section"><h3>成果说明</h3><p>{asset.description || "暂未填写成果说明。建议补充业务场景、可复用边界和预期价值。"}</p></section>
        <section className="asset-detail-section"><h3>材料链接</h3>{asset.url ? <div className="asset-link-card"><div className="asset-link-url"><b>{asset.url}</b><small>已发布后，非作者复制此链接会计入复用统计。</small></div><div className="asset-link-actions"><a href={asset.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />打开</a>{published ? <button type="button" onClick={onCopyLink}><Copy size={15} />复制链接</button> : null}</div></div> : <div className="asset-empty-link">尚未提供材料链接</div>}</section>
        {published ? <section className="asset-detail-section"><h3>复用数据</h3><div className="asset-reuse-panel"><span><b>{asset.reusePeople}</b><small>位复用人</small></span><span><b>{asset.reuseTimes}</b><small>次链接复制</small></span><p>{asset.reuseMemberNames ? `最近复用：${asset.reuseMemberNames}` : "暂无复用记录；团队成员复制链接后会在此累计。"}</p></div></section> : null}
        {(isOwner || (published && isAdminRole)) ? <div className="asset-detail-actions">
          {isOwner ? <button type="button" className="secondary-action" disabled={busy} onClick={onEdit}><PenLine size={15} />更新成果</button> : null}
          {pending && isOwner ? <button type="button" className="secondary-action" disabled={busy} onClick={onWithdraw}>撤回申请</button> : null}
          {returned && isOwner ? <button type="button" className="primary-action" disabled={busy} onClick={onResubmit}>重新提交评审</button> : null}
          {published && isAdminRole ? <button type="button" className="secondary-action" disabled={busy} onClick={onWithdraw}>下架成果</button> : null}
        </div> : null}
      </section>
      <aside className="asset-review-panel">
        <div className="asset-review-panel-head"><div><span>发布评审</span><h3>{pending ? "等待主评人处理" : published ? "已完成发布" : returned ? "等待补充后重新提交" : "发布申请已撤回"}</h3></div><ClipboardCheck size={20} /></div>
        <div className="asset-reviewer-card"><span className="member-avatar">{initials(asset.reviewerName)}</span><span><small>主评人</small><b>{asset.reviewerName}</b></span></div>
        {asset.reviewStatus === "待补充" && asset.reviewFeedback ? <div className="feedback-box"><UserRoundCheck size={20} /><div><small>退回原因</small><p>{asset.reviewFeedback}</p></div></div> : null}
        {canDecide ? <div className="asset-review-form">
          <div className="form-section-label"><FieldLabel text="评审结论" required /><small>通过后即刻发布到团队成果库</small></div>
          {returnReason === null ? <div className="form-actions asset-review-form-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setReturnReason("")}>退回补充</button><button type="button" className="primary-action" disabled={busy} onClick={() => onReview("已发布")}>通过并发布</button></div> : <>
            <textarea rows={5} value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="说明需补充的材料、边界或合规信息" aria-label="退回原因" />
            <div className="form-actions asset-review-form-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setReturnReason(null)}>取消</button><button type="button" className="primary-action" disabled={busy || !returnReason.trim()} onClick={async () => { const ok = await onReview("待补充", returnReason.trim()); if (ok) setReturnReason(null); }}>确认退回</button></div>
          </>}
        </div> : <div className="asset-review-readonly"><LockKeyhole size={18} /><p>{published ? "该成果已通过发布评审，可供团队复用。" : pending ? `本次发布申请已指派给 ${asset.reviewerName}。` : returned ? "作者补充后可再次提交给同一位主评人。" : "作者可更新成果后再次发起发布申请。"}</p></div>}
      </aside>
    </div>
  </div></DialogFrame>;
}
