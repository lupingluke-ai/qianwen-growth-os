import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { findOrCreateDingTalkUser } from "../../../../auth";

const DINGTALK_CLIENT_ID = process.env.DINGTALK_CLIENT_ID!;
const DINGTALK_CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET!;
const AUTH_SECRET = process.env.AUTH_SECRET!;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function getBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

// GET /api/auth/dingtalk — 发起钉钉扫码登录
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  // 如果有 code 参数，说明是钉钉回调
  if (code) {
    return handleCallback(req, code);
  }

  // 否则重定向到钉钉授权页
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/dingtalk`;
  const authUrl = new URL("https://login.dingtalk.com/oauth2/auth");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", DINGTALK_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}

// 处理钉钉回调：code → token → userinfo → session
async function handleCallback(req: NextRequest, code: string) {
  const baseUrl = getBaseUrl(req);

  try {
    // 1. 用 code 换 accessToken
    const tokenBody = {
      clientId: DINGTALK_CLIENT_ID,
      clientSecret: DINGTALK_CLIENT_SECRET,
      code,
      grantType: "authorization_code",
    };
    console.log("[dingtalk] Token request body:", JSON.stringify({ ...tokenBody, clientSecret: "***" }));
    const tokenResp = await fetch("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });
    const tokenText = await tokenResp.text();
    console.log("[dingtalk] Token response status:", tokenResp.status, "body:", tokenText);
    let tokenData: any;
    try { tokenData = JSON.parse(tokenText); } catch { tokenData = {}; }
    if (!tokenData.accessToken) {
      console.error("[dingtalk] Token exchange failed:", tokenText);
      return NextResponse.redirect(`${baseUrl}/login?error=dingtalk_token_failed`);
    }

    // 2. 用 accessToken 获取用户信息
    const userResp = await fetch("https://api.dingtalk.com/v1.0/contact/users/me", {
      headers: { "x-acs-dingtalk-access-token": tokenData.accessToken },
    });
    const userInfo = await userResp.json();
    if (!userInfo.unionId) {
      console.error("[dingtalk] UserInfo fetch failed:", userInfo);
      return NextResponse.redirect(`${baseUrl}/login?error=dingtalk_userinfo_failed`);
    }

    // 3. 查找或创建本地用户
    const dbUser = await findOrCreateDingTalkUser(
      userInfo.unionId,
      userInfo.nick || "钉钉用户",
      userInfo.email || null
    );
    if (!dbUser) {
      return NextResponse.redirect(`${baseUrl}/login?error=dingtalk_user_create_failed`);
    }

    // 4. 生成 next-auth session token (JWT)
    const isSecure = baseUrl.startsWith("https");
    const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

    const token = await encode({
      token: {
        email: dbUser.email,
        name: dbUser.displayName,
        displayName: dbUser.displayName,
        role: dbUser.role,
        memberId: dbUser.memberId,
        sub: dbUser.email,
      },
      secret: AUTH_SECRET,
      maxAge: SESSION_MAX_AGE,
      salt: cookieName,
    });

    // 5. 设置 session cookie 并重定向到首页
    
    const response = NextResponse.redirect(`${baseUrl}/`);
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error("[dingtalk] OAuth flow error:", error);
    return NextResponse.redirect(`${baseUrl}/login?error=dingtalk_error`);
  }
}
