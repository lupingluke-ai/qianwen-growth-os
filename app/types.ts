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
  currentLevel: number;
  selfLevel: number;
  targetLevel: number;
  targetDate: string;
  progressStatus: string;
  reviewStatus: string;
  gap: string;
  plan: string;
  nextTask: string;
  updatedAt: string;
  evidenceCount: number;
  pendingReviewId: number | null;
  overdueTasks: number;
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
  feedback: string;
  evidenceCount: number;
  submittedAt: string;
  reviewedAt: string;
};

export type AssetRecord = {
  id: number;
  title: string;
  type: string;
  industry: string;
  ownerName: string;
  reviewStatus: string;
  complianceStatus: string;
  reusePeople: number;
  reuseClients: number;
  updatedAt: string;
  url: string;
};

export type WorkspaceUser = {
  displayName: string;
  email: string;
  role: "member" | "reviewer" | "admin";
  memberId: number;
};

export type WorkspacePayload = {
  authenticated: boolean;
  me: WorkspaceUser | null;
  members: WorkspaceMember[];
  myMember: WorkspaceMember | null;
  evidences: Evidence[];
  reviews: Review[];
  assets: AssetRecord[];
  metrics: {
    memberCount: number;
    average: number;
    median: number;
    l3Rate: number;
    l6Rate: number;
    atRisk: number;
    overdue: number;
    pendingReviews: number;
    evidenceCompletion: number;
    distribution: number[];
    reviewReady: number;
  };
};
