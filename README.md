# 千问计划 · AI 能力成长系统

面向约 30 人团队的轻量 AI 能力管理应用。围绕十级能力体系，将个人成长、证据沉淀、晋级评审、团队成果和体系治理连接成一个可持续运行的闭环。

[在线体验](https://qianwen-growth-os.luping-luke.chatgpt.site)

## 核心能力

- **我的成长**：聚焦当前认证、下一目标、本周行动、通关清单与评审反馈。
- **能力阶梯**：以十级阶梯呈现能力层级，支持下钻查看认证标准、实践和学习资源。
- **评审中心**：申请人自主选择主评人；评审人只处理分配给自己的晋级申请。
- **团队与成果库**：按一层小组管理成员，优秀成长证据可推荐并沉淀为团队成果。
- **体系管理**：管理员可维护十级标准草稿、发布新版本，并保留历史认证所使用的体系版本。

## 轻量角色模型

- 成员
- 成员 · 评审人
- 管理员（建议 1–2 位）

不引入复杂组织树、联合评审、申诉流和多级管理员，适合小团队快速落地。

## 技术栈

- React 19 + Next.js 16
- vinext + Cloudflare Workers
- Cloudflare D1 + Drizzle ORM
- Sign in with ChatGPT
- OpenAI Sites 托管

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run lint
npm test
npm run build
npm run db:generate
```

## 数据与权限

- 匿名访问者可查看公开、匿名化的团队概览。
- 登录成员只能维护自己的成长记录与材料。
- 评审人可查看团队信息，但只能处理分配给自己的评审。
- 管理员负责体系版本、成员权限、小组和团队成果审核。
- D1 迁移位于 `drizzle/`，运行时也会兼容升级已有数据库。

## 项目结构

```text
app/                 页面、组件、API 与工作区逻辑
db/                  Drizzle 数据模型
drizzle/             D1 数据库迁移
tests/               产品结构与权限边界测试
worker/              Cloudflare Worker 入口
.openai/hosting.json Sites 托管绑定
```

## 设计原则

产品采用克制的苹果科技风：中性画布、白色内容表面、深色重点区域和清晰的信息层级。完整视觉验证记录见 [`design-qa.md`](./design-qa.md)。
