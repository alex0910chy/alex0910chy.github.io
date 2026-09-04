/* ============================================================
 * 应用配置 —— 部署前需要修改的唯一文件
 * ============================================================
 * 1. 本地预览：什么都不用填，直接用浏览器打开 index.html 即可
 *    （本地预览模式：数据只存在当前浏览器，双人同步不可用）
 *
 * 2. 正式使用（双人同步）：
 *    - 去 https://supabase.com 免费注册并创建项目
 *    - 在 SQL Editor 里执行 supabase-setup.sql
 *    - 把项目的 URL 和 anon key 填到下面
 *    - 详细步骤见 README.md
 * ============================================================ */

window.APP_CONFIG = {
  // ---- Supabase 云端配置（接入后开启双人实时同步）----
  // 格式示例：
  //   supabaseUrl: "https://abcdefghijk.supabase.co",
  //   supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  supabaseUrl: "https://idvwqaicfijgwxcjampg.supabase.co",
  supabaseAnonKey: "sb_publishable_i3xpOP3sHSzXtwO2tOgQvw_AZBkZ9wI",

  // ---- 两个预设账号 ----
  // email 需与 Supabase 中创建的两个用户邮箱一致
  // name 是显示用的名字，改成你们各自的名字即可
  // password 是本机演示模式的登录密码（云端模式以 Supabase 账号密码为准，
  //          在 Supabase 创建用户时建议设成一样的）
  accounts: [
    { email: "chenhongyi0910@163.com", name: "Alex",   password: "080910" },
    { email: "baobei0910@163.com",     name: "Angela", password: "150298" }
  ],

  // ---- 站点文案 ----
  appName: "Duet",
  tagline: "两人问答"
};
