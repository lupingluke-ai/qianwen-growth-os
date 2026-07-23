#!/usr/bin/env bash
# 千问计划 · Vercel + Neon 部署脚本（对应迁移方案阶段五）
#
# 前置条件：已执行 `vercel login`
# 用法：
#   bash scripts/deploy.sh            # 交互式：link -> 检查环境变量 -> 迁移+seed -> Preview -> 询问后上生产
#   bash scripts/deploy.sh --prod     # 直接生产发布（仍会先跑迁移检查）
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$1"; exit 1; }

command -v vercel >/dev/null || fail "未找到 vercel CLI，请先执行: npm install -g vercel"

step "检查登录态"
vercel whoami >/dev/null 2>&1 || fail "尚未登录，请先执行: vercel login"
echo "已登录: $(vercel whoami 2>/dev/null)"

step "关联 Vercel 项目（vercel link）"
if [ ! -f .vercel/project.json ]; then
  vercel link --yes
else
  echo "已关联，跳过"
fi

step "检查 DATABASE_URL（Neon 集成）"
if ! vercel env ls production 2>/dev/null | grep -q "DATABASE_URL"; then
  cat <<'EOF'
✖ 生产环境缺少 DATABASE_URL。请先安装 Neon 集成（二选一）：
  a) 控制台：https://vercel.com/marketplace/neon → Install → 关联本项目（自动注入 DATABASE_URL）
  b) CLI：   vercel integration add neon
完成后重新运行本脚本。
EOF
  exit 1
fi
echo "DATABASE_URL 已配置"

step "检查 AUTH_SECRET"
if ! vercel env ls production 2>/dev/null | grep -q "AUTH_SECRET"; then
  echo "生产环境缺少 AUTH_SECRET，自动生成并写入..."
  SECRET=$(openssl rand -base64 32)
  vercel env add AUTH_SECRET production --value "$SECRET" --yes
  # 同步写入 preview 环境
  vercel env add AUTH_SECRET preview "" --value "$SECRET" --yes 2>/dev/null || true
else
  echo "AUTH_SECRET 已配置"
fi

step "拉取生产环境变量并应用数据库迁移"
vercel env pull .env.vercel.production --environment=production --yes
set -a; . ./.env.vercel.production; set +a
[ -n "${DATABASE_URL:-}" ] || fail "拉取到的环境变量中没有 DATABASE_URL"
# drizzle-kit 使用 neon-serverless (WebSocket) 驱动，需要 ws 包
npm ls ws >/dev/null 2>&1 || npm install --save-dev ws
npm run db:migrate

step "初始化种子数据（幂等，已有数据自动跳过）"
npm run db:seed

if [ "${1:-}" = "--prod" ]; then
  step "生产发布"
  vercel deploy --prod --yes
else
  step "Preview 部署（冒烟通过后执行: bash scripts/deploy.sh --prod）"
  vercel deploy --yes
fi

step "完成"
