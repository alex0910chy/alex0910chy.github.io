# Duet · 两人问答

创建问题、各自作答、查看彼此的回答。双账号登录 · 实时同步。

## 功能一览

| 模块 | 说明 |
|------|------|
| 双账号登录 | 两个预设账号，各自输入密码登录，支持不同设备同时在线 |
| 答题 | 逐题作答，「保存并继续」自动跳转；云端模式下输入停顿后自动同步 |
| 问题管理 | 列表展示双方作答状态，支持新增 / 编辑 / 删除，可标记「待回答 / 已回答」 |
| 查看回复 | 每题左右并排展示双方答案 + 各自回答时间戳 |
| 移动端适配 | 手机浏览器体验优先，桌面端同样美观 |

## 三分钟看懂架构

```
你的手机/电脑浏览器
   │  (纯静态页面，GitHub Pages 托管，免费)
   ▼
GitHub Pages  ──托管──►  index.html + css + js
   │  (HTTPS 直连)
   ▼
Supabase 免费云数据库 ── 账号体系 + 数据存储 + 实时推送(WebSocket)
```

> GitHub Pages 只能放静态文件，因此「数据库 + 实时同步」由 Supabase 免费版承担，
> 无需自己买服务器。**不配置 Supabase 也能用**——网站会以「演示模式」运行，
> 数据存在浏览器里，方便先体验界面。

## 目录结构

```
couple-qa/
├── index.html            # 入口页面
├── css/style.css         # 全部样式（正式简洁风）
├── js/
│   ├── config.js         # ⭐ 配置文件（唯一需要修改的文件）
│   ├── app.js            # 全部应用逻辑
│   └── lib/supabase.min.js  # Supabase SDK（已本地化，国内无需访问 CDN）
├── supabase-setup.sql    # 数据库一键初始化脚本
└── README.md             # 本文件
```

## 第 0 步 · 本地预览（无需任何配置）

直接双击 `index.html` 用浏览器打开即可。此模式下：
- 登录密码为 `js/config.js` 中各账号的 `password` 预设值
- 数据只存在当前浏览器，换设备/换浏览器数据不互通
- 适合先看看界面和交互

## 第 1 步 · 接入 Supabase（开启双人同步，约 5 分钟）

1. **注册**：打开 [supabase.com](https://supabase.com) → Get Started → 用邮箱注册（免费层足够两个人用）
2. **建项目**：New Project → 名字填 `duet` → 数据库密码设一个并记住 → 地区选 `Northeast Asia (Tokyo)` 或 `Singapore`（离大陆近）→ 等约 2 分钟创建完成
3. **建表**：左侧菜单 → SQL Editor → New query → 把 `supabase-setup.sql` 全部内容粘贴进去 → Run，显示 `Success`
4. **关闭公开注册**（重要，保证只有你们俩能进）：左侧 → Authentication → Providers → Email → 关闭 `Allow new users to sign up`
5. **创建你们俩的账号**：Authentication → Users → Add user → Create new user → 填邮箱 + 密码 + 勾选 `Auto Confirm User` → 重复一次创建另一个账号
6. **填配置**：项目首页 → Settings → API → 复制 `Project URL` 和 `anon public` key，打开 `js/config.js` 填入：

```js
supabaseUrl: "https://xxxxx.supabase.co",
supabaseAnonKey: "eyJhbGciOi...",
accounts: [
  { email: "你的邮箱",   name: "Alex",   password: "..." },  // 登录页第一个账号
  { email: "对方的邮箱", name: "Angela", password: "..." }   // 第二个账号
],
```

> `name` 只影响显示，改成你们各自的名字即可。邮箱必须和第 5 步创建的一致。
> `password` 仅用于本机演示模式登录；云端模式以 Supabase 里设置的账号密码为准，
> 建议创建 Supabase 用户时（第 5 步）设成一样的密码，两边体验统一。

## 第 2 步 · 部署到 GitHub Pages（免费获得公网地址）

**方式一：网页上传（最简单，不用装 Git）**
1. 注册/登录 [github.com](https://github.com)，点右上角 `+` → New repository
2. 仓库名填 `duet`，选 **Public**，点 Create repository
3. 点 `uploading an existing file` 链接，把 `couple-qa` 文件夹里的**全部文件**拖进去
   （注意：拖文件夹里的内容，不是文件夹本身；`js/lib/` 里的 supabase.min.js 也要传）
4. 点 Commit changes
5. 仓库页 → Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main`、`/ (root)` → Save
6. 等 1~2 分钟，页面顶部会出现地址：`https://你的用户名.github.io/duet/`

**方式二：Git 命令行（会持续维护代码的话用这个）**

```bash
cd couple-qa
git init
git add -A
git commit -m "Initial release of Duet"
git branch -M main
git remote add origin https://github.com/你的用户名/duet.git
git push -u origin main
```
然后在仓库 Settings → Pages 同样开启。

**之后更新网站**：改完文件 → commit → push，1~2 分钟后自动生效。

## 使用说明

- **创建问题**：「问题」页 → 新建问题
- **答题**：「答题」页逐题作答，云端模式输入停顿 1.5 秒自动同步，对方设备实时可见
- **查看**：「回复」页点任意问题，展开双方答案和时间戳
- 双方都答完的题会自动标记为「已回答」，也可以在编辑里手动改

## 隐私与安全

- 数据库启用行级安全（RLS）：**未登录的任何人读不到一个字**
- Supabase 关闭了公开注册 → 全世界只有你们两个账号能登录 → 只有你们能看
- `anon key` 本来就是设计为公开的（配合 RLS 使用），泄露也无所谓
- 注意：静态网站的前端代码是公开可查看的，`config.js` 里的演示密码任何人可见。
  正式使用请接入 Supabase（云端模式的密码存在 Supabase 服务器，不出现在前端代码里），
  并把仓库设为 Private（Private 仓库同样可以开 GitHub Pages）

## 常见问题

**Q：国内打不开 `*.github.io`？**
A：GitHub Pages 在大陆时通时断。如果打不开：① 开加速器；② 或者把仓库连接到
Vercel / Netlify / Cloudflare Pages（都免费，导入 GitHub 仓库一键部署，国内可达性更好）。
`*.supabase.co` 的接口在大陆一般可以直连，个别网络环境下也需要加速。

**Q：对方还没登录过，界面上显示的是谁？**
A：显示 `config.js` 里预设的名字，对方第一次登录后会自动建档。

**Q：密码忘了？**
A：Supabase 控制台 → Authentication → Users → 点用户 → Reset password / 直接改。
