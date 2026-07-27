"use client";

import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleDingTalkLogin() {
    setBusy(true);
    setError("");
    // 直接跳转到自定义钉钉 OAuth 路由
    window.location.href = "/api/auth/dingtalk";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await signIn("credentials", { redirect: false, email, password });
      if (result?.error) {
        throw new Error(result.error === "rate_limited" ? "失败次数过多，请 10 分钟后再试" : "邮箱或密码不正确");
      }
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("return_to") || "/";
      window.location.href = returnTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  function fillAccount(acctEmail: string) {
    setEmail(acctEmail);
    setShowPasswordForm(true);
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">千</span>
          <div>
            <h1>千问计划</h1>
            <p>AI 能力成长系统</p>
          </div>
        </div>

        {/* 钉钉扫码登录 - 主操作 */}
        <button
          type="button"
          className="primary-action full dingtalk-btn"
          onClick={handleDingTalkLogin}
          disabled={busy}
        >
          <svg width="20" height="20" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm227 385.3c-1 1.7-2.1 3.5-3.2 5.2-11.1 17.5-27.5 39.9-49.2 67.2l-0.4 0.5c-2 2.5-4 5.1-6.1 7.7-13.4 16.7-16.5 26.3-16.1 36.6 0.5 13.5 8.4 25.8 20 36.3 0.2 0.2 0.4 0.3 0.6 0.5 11.7 10 24.2 19.6 37.3 29.7 6.5 5 13.2 10.2 19.9 15.5 27.4 21.7 48.5 44.5 52.7 74.2 5.2 37-12.4 71.1-48 86.5-19.1 8.3-39.7 11.3-60.6 11.3H405.4c-4 0-5.8-2-5.8-5.8v-0.3c0.4-4.8 1.4-9.5 3.1-14 3.7-10 10.5-18.4 18.7-25.6 10.7-9.5 23.1-16.7 36-23.2 3.3-1.7 6.7-3.3 10-5l1.4-0.7c15.6-7.8 31.8-15.9 45.2-27.7 11.5-10.1 20-23 20.8-39.3 0.6-12.2-4.1-23.3-12-32.4-7.5-8.7-17.5-15-28.2-19.4-3.1-1.3-6.3-2.4-9.6-3.4-7.4-2.3-15.2-3.7-25.1-3.2-10.5 0.5-20.4 3.1-29.2 7.5l-0.3 0.2c-10.5 5.2-18.6 11.6-25.2 17.8-4.7 4.4-10.7 6.9-17 7-6.3 0.1-12.3-2.4-17.1-6.7-4.6-4.1-7.8-9.9-8.3-16.4-0.3-4.8 1.1-9.5 3.8-13.3 2.4-3.4 5.7-6.2 9.8-8.3 8.7-4.5 17.9-7.7 27.4-9.8l0.5-0.1 3.4-0.7c9.1-1.9 18.4-3.3 27.8-4.2 4-0.4 8-0.7 12.1-0.9l1.3-0.1c4.2-0.2 8.5-0.2 12.8-0.1h1.5l1.5 0.1c10.7 0.4 21.2 1.7 31.5 3.8 8.9 1.8 17.7 4.2 26.2 7.2l0.7 0.2c4.4 1.5 8.7 3.3 12.9 5.2-12.6-31.5-36.7-58-67.2-74.5-1-0.5-2-1.1-3.1-1.6-12.8-6.4-26.7-10.8-41.3-12.8l-0.5-0.1c-5-0.7-10.1-1.1-15.2-1.3-2-0.1-4.1-0.1-6.1-0.1-42.8 0-81.6 17.3-109.8 45.3l-1.3 1.3h-0.1l-2.4 2.5c-3.8 4.1-7.5 8.4-10.9 12.9-14.8 19.2-25.4 41.7-30.3 66.1-0.8 4.1-4.4 7-8.5 6.9h-0.4c-4.6-0.3-8.1-4.2-7.8-8.8 0-0.3 0.1-0.7 0.1-1 1.3-8 3.1-15.9 5.4-23.7 15.7-53.2 49.9-97 93.4-126 7.6-5 15.5-9.6 23.8-13.7 7.4-3.7 15.1-7 23-9.8 13-4.7 26.6-8.1 40.6-10.1 10.2-1.4 20.6-2.2 31.1-2.2h3.1c10.4 0.1 20.7 0.9 30.8 2.3 10.9 1.5 21.5 3.7 31.9 6.7 27.3 7.8 52.6 20.6 74.6 37.8 3.7 2.9 7.3 5.9 10.8 9 16.2 14.3 30.1 31.1 41.2 49.8z"/>
          </svg>
          {busy ? "跳转中…" : "使用钉钉登录"}
        </button>

        {/* 账号密码登录入口 */}
        {!showPasswordForm && (
          <button
            type="button"
            className="login-toggle-link"
            onClick={() => setShowPasswordForm(true)}
          >
            账号密码登录 →
          </button>
        )}

        {/* 密码登录表单 */}
        {showPasswordForm && (
          <>
            <div className="login-divider">
              <span>密码登录</span>
            </div>
            <form className="login-form" onSubmit={handleSubmit}>
              <label>
                <span>邮箱</span>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                  placeholder="例如 linxiao@qianwen"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                  placeholder="输入密码"
                  autoComplete="current-password"
                  required
                />
              </label>
              {error ? <p className="login-error">{error}</p> : null}
              <button type="submit" className="primary-action full" disabled={busy}>
                {busy ? "登录中…" : "登录"}
              </button>
            </form>

            <div className="login-hint">
              <LockKeyhole size={14} />
              <p>演示账号（点击填充邮箱，密码见部署时 seed 脚本输出）：</p>
            </div>
            <div className="login-accounts">
              {[
                { email: "linxiao@qianwen", label: "林晓 · 管理员" },
                { email: "chenmo@qianwen", label: "陈墨 · 评审人" },
                { email: "zhouning@qianwen", label: "周宁 · 成员" },
              ].map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  className="login-account-btn"
                  onClick={() => fillAccount(acct.email)}
                >
                  {acct.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
