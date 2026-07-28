/**
 * 钉钉工作通知服务
 * - 使用模块级内存缓存 access_token（Vercel warm invocation 复用）
 * - unionId → userId 映射缓存
 * - 所有函数内部 try-catch，失败只 console.error 不抛出
 */

// ─── access_token 缓存 ───────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const appKey = process.env.DINGTALK_CLIENT_ID;
  const appSecret = process.env.DINGTALK_CLIENT_SECRET;
  if (!appKey || !appSecret) {
    console.error("[dingtalk] 缺少 DINGTALK_CLIENT_ID 或 DINGTALK_CLIENT_SECRET 环境变量");
    return null;
  }

  try {
    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
    if (data.errcode !== 0 || !data.access_token) {
      console.error("[dingtalk] 获取 access_token 失败:", JSON.stringify(data));
      return null;
    }
    cachedToken = data.access_token;
    // 提前 300s 刷新
    tokenExpiresAt = now + ((data.expires_in || 7200) - 300) * 1000;
    console.log("[dingtalk] 获取 access_token 成功:", `${data.access_token.slice(0, 8)}...`, "expires_in:", data.expires_in);
    return cachedToken;
  } catch (err) {
    console.error("[dingtalk] 获取 access_token 异常:", err);
    return null;
  }
}

// ─── unionId → userId 转换缓存 ──────────────────────────────────────────────
const userIdCache = new Map<string, string>();

async function getUsedIdByUnionId(unionId: string): Promise<string | null> {
  const cached = userIdCache.get(unionId);
  if (cached) return cached;

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const url = `https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unionid: unionId }),
    });
    const data = (await res.json()) as { errcode?: number; errmsg?: string; result?: { userid?: string } };
    if (data.errcode !== 0 || !data.result?.userid) {
      console.error("[dingtalk] unionId 转 userId 失败:", unionId, "钉钉返回:", JSON.stringify(data));
      return null;
    }
    const userId = data.result.userid;
    userIdCache.set(unionId, userId);
    console.log("[dingtalk] unionId 转 userId 成功:", unionId, "->", userId);
    return userId;
  } catch (err) {
    console.error("[dingtalk] unionId 转 userId 异常:", unionId, err);
    return null;
  }
}

// ─── 发送工作通知（OA 消息格式）────────────────────────────────────────────
async function sendWorkNotification(params: {
  userId: string;
  title: string;
  content: string;
  detailUrl: string;
}): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const agentId = process.env.DINGTALK_AGENT_ID;
  if (!agentId) {
    console.error("[dingtalk] 缺少 DINGTALK_AGENT_ID 环境变量");
    return false;
  }

  try {
    const url = `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`;
    const msg = {
      msgtype: "oa",
      oa: {
        head: { bgcolor: "FF4F46E5", text: "千问成长" },
        body: {
          title: params.title,
          content: params.content,
        },
        message_url: params.detailUrl,
        pc_message_url: params.detailUrl,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: Number(agentId),
        userid_list: params.userId,
        msg,
      }),
    });
    const data = (await res.json()) as { errcode?: number; errmsg?: string; task_id?: number };
    if (data.errcode !== 0) {
      console.error("[dingtalk] 发送工作通知失败:", JSON.stringify(data));
      return false;
    }
    console.log("[dingtalk] 发送工作通知成功, task_id:", data.task_id, "userId:", params.userId);
    return true;
  } catch (err) {
    console.error("[dingtalk] 发送工作通知异常:", err);
    return false;
  }
}

// ─── 高级封装：晋级申请已提交通知（发给评审人）───────────────────────────────
export async function notifyReviewSubmitted(params: {
  reviewerUnionId: string;
  memberName: string;
  fromLevel: number;
  targetLevel: number;
  detailUrl: string;
}): Promise<void> {
  try {
    const userId = await getUsedIdByUnionId(params.reviewerUnionId);
    if (!userId) return;

    await sendWorkNotification({
      userId,
      title: "新的晋级评审待处理",
      content: `${params.memberName} 提交了 L${params.fromLevel} → L${params.targetLevel} 晋级申请，请及时评审。`,
      detailUrl: params.detailUrl,
    });
  } catch (err) {
    console.error("[dingtalk] notifyReviewSubmitted 异常:", err);
  }
}

// ─── 高级封装：评审结论通知（发给申请人）──────────────────────────────────────
export async function notifyReviewDecision(params: {
  applicantUnionId: string;
  decision: string;
  fromLevel: number;
  targetLevel: number;
  feedback?: string;
  detailUrl: string;
}): Promise<void> {
  try {
    const userId = await getUsedIdByUnionId(params.applicantUnionId);
    if (!userId) return;

    const decisionText = params.decision === "已通过"
      ? `恭喜！你的 L${params.fromLevel} → L${params.targetLevel} 晋级申请已通过。`
      : params.decision === "待补证"
        ? `你的 L${params.fromLevel} → L${params.targetLevel} 晋级申请需要补充证据，请及时处理。`
        : `你的 L${params.fromLevel} → L${params.targetLevel} 晋级申请未通过。`;

    const content = params.feedback
      ? `${decisionText}\n评审反馈：${params.feedback.slice(0, 200)}`
      : decisionText;

    await sendWorkNotification({
      userId,
      title: `晋级评审结论：${params.decision}`,
      content,
      detailUrl: params.detailUrl,
    });
  } catch (err) {
    console.error("[dingtalk] notifyReviewDecision 异常:", err);
  }
}

// ─── 高级封装：新问题反馈通知（发给全部已绑定钉钉的管理员）─────────────────────
export async function notifyNewFeedback(params: {
  adminUnionIds: string[];
  title: string;
  submitterName: string;
  pageName: string;
  detailUrl: string;
}): Promise<void> {
  try {
    for (const unionId of params.adminUnionIds) {
      const userId = await getUsedIdByUnionId(unionId);
      if (!userId) continue;

      await sendWorkNotification({
        userId,
        title: "收到新问题反馈",
        content: `收到新问题反馈：${params.title}（来自 ${params.submitterName}，页面：${params.pageName}）`,
        detailUrl: params.detailUrl,
      });
    }
  } catch (err) {
    console.error("[dingtalk] notifyNewFeedback 异常:", err);
  }
}

// ─── 高级封装：反馈处理结果通知（发给提交人）──────────────────────────────────
export async function notifyFeedbackResolved(params: {
  submitterUnionId: string;
  title: string;
  adminResponse: string;
  detailUrl: string;
}): Promise<void> {
  try {
    const userId = await getUsedIdByUnionId(params.submitterUnionId);
    if (!userId) return;

    await sendWorkNotification({
      userId,
      title: "你的问题反馈已解决",
      content: `你反馈的「${params.title}」已解决。\n管理员回复：${params.adminResponse.slice(0, 200)}`,
      detailUrl: params.detailUrl,
    });
  } catch (err) {
    console.error("[dingtalk] notifyFeedbackResolved 异常:", err);
  }
}
