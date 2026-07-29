export type Criterion = {
  id: string;
  label: string;
  evidenceHint: string;
};

export type LevelDefinition = {
  level: number;
  title: string;
  role: string;
  stage: string;
  definition: string;
  standard: string;
  abilities: string[];
  criteria: Criterion[];
  practices: string[];
  path: string;
  badges?: string[];
  resources: { label: string; url: string }[];
};

export type IndustryAnchor = {
  name: string;
  owner: string;
  version: string;
  items: { level: number; title: string; template: string }[];
};

export type StageMeta = {
  label: string;
  range: string;
  color: string;
  copy: string;
};

export type WorkspaceMember = {
  id: number;
  name: string;
  role: string;
  industry: string;
  groupName: string;
  currentLevel: number;
  selfLevel?: number;
  targetLevel: number;
  targetDate: string;
  progressStatus: string;
  reviewStatus: string;
  gap: string;
  plan: string;
  nextTask: string;
  updatedAt: string;
  evidenceCount: number;
  publishedAssetCount: number;
  pendingReviewId: number | null;
  overdueTasks: number;
  checkedInThisMonth: boolean;
};

export type Evidence = {
  id: number;
  memberId: number;
  memberName: string;
  level: number;
  criterionKey: string;
  title: string;
  kind: string;
  url: string;
  outcome: string;
  status: string;
  nominateAsset: number;
  assetType: string;
  createdAt: string;
};

export type Review = {
  id: number;
  memberId: number;
  memberName: string;
  fromLevel: number;
  targetLevel: number;
  state: string;
  cycle: string;
  reviewerName: string;
  reviewerEmail: string;
  frameworkVersionId: number;
  feedback: string;
  evidenceCount: number;
  submittedAt: string;
  reviewedAt: string;
};

export type AssetRecord = {
  id: number;
  title: string;
  description: string;
  type: string;
  industry: string;
  ownerName: string;
  ownerMemberId: number;
  sourceEvidenceId: number;
  reviewStatus: string;
  reviewFeedback: string;
  complianceStatus: string;
  reviewerEmail: string;
  reviewerName: string;
  reusePeople: number;
  reuseClients: number;
  reuseTimes: number;
  reuseMemberNames: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type AssetReuseEvent = {
  assetId: number;
  memberId: number;
  createdAt: string;
};

export type PromotionHistoryItem = {
  memberId: number;
  fromLevel: number;
  toLevel: number;
  createdAt: string;
};

export type WorkspaceUser = {
  displayName: string;
  email: string;
  role: "member" | "reviewer" | "admin";
  memberId: number;
};

export type ReviewerOption = {
  email: string;
  displayName: string;
  role: "reviewer" | "admin";
  memberId: number;
  groupName: string;
  industry: string;
  pendingCount: number;
};

export type ManagedWorkspaceUser = WorkspaceUser & {
  groupName: string;
  industry: string;
};

export type FrameworkVersion = {
  id: number;
  versionName: string;
  status: string;
  changeNote: string;
  publishedAt: string;
  updatedAt: string;
  levels: LevelDefinition[];
};

export type MonthlyReport = {
  cycle: string;
  promotions: { id: number; memberName: string; fromLevel: number; toLevel: number; createdAt: string }[];
  newEvidenceCount: number;
  newAssetCount: number;
  publishedAssetCount: number;
  updatedThisMonth: number;
  memberCount: number;
  participationRate: number;
};

export type WorkspacePayload = {
  authenticated: boolean;
  me: WorkspaceUser | null;
  members: WorkspaceMember[];
  myMember: WorkspaceMember | null;
  evidences: Evidence[];
  reviews: Review[];
  assets: AssetRecord[];
  assetReuseEvents: AssetReuseEvent[];
  promotionHistory: PromotionHistoryItem[];
  reviewers: ReviewerOption[];
  workspaceUsers: ManagedWorkspaceUser[];
  levels: LevelDefinition[];
  framework: {
    published: FrameworkVersion;
    draft: FrameworkVersion | null;
  };
  monthlyReport: MonthlyReport | null;
  metrics: {
    memberCount: number;
    average: number;
    median: number;
    l3Rate: number;
    l6Rate: number;
    atRisk: number;
    overdue: number;
    pendingReviews: number;
    updatedThisMonth: number;
    evidenceCompletion: number;
    distribution: number[];
    reviewReady: number;
  };
};
