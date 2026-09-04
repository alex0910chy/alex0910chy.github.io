/* ============================================================
   Duet · 两人问答 · 主应用逻辑
   - 双数据后端：SupabaseAdapter（云端实时同步）/ LocalAdapter（本地预览）
   - 单页应用：hash 路由 + 事件委托
   ============================================================ */
"use strict";

/* ---------------- 基础工具 ---------------- */
const $ = (s) => document.querySelector(s);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}天前`;
  return fmtTime(iso);
}

function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* 头像：取名字首字母（大写） */
function initialOf(name) {
  const s = String(name || "").trim();
  return s ? s.charAt(0).toUpperCase() : "·";
}

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  $("#toast-wrap").appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; }, 1800);
  setTimeout(() => el.remove(), 2200);
}

/* ============================================================
   数据适配器：统一接口
   signIn / signOut / currentUser / onAuthChange
   fetchAll / addQuestion / updateQuestion / deleteQuestion
   saveAnswer / subscribe
   ============================================================ */

/* ---------------- 本地预览适配器 ---------------- */
class LocalAdapter {
  constructor(config) {
    this.config = config;
    this.mode = "local";
    this.listeners = [];
    this.authListeners = [];
    this.k = {
      seed: "coupleqa_seeded",
      session: "coupleqa_session",
      questions: "coupleqa_questions",
      answers: "coupleqa_answers",
    };
  }

  init() {
    if (!localStorage.getItem(this.k.seed)) {
      const now = Date.now();
      const seedQs = [
        "我们第一次见面是在哪里？当时你穿的是什么？",
        "对方最让你心动的瞬间是什么？",
        "十年后的今天，你希望我们在做什么？",
      ].map((content, i) => ({
        id: "q" + (i + 1), content, status: "待回答",
        created_by: this.config.accounts[0].email,
        created_at: new Date(now - (3 - i) * 86400000).toISOString(),
        updated_at: new Date(now - (3 - i) * 86400000).toISOString(),
      }));
      localStorage.setItem(this.k.questions, JSON.stringify(seedQs));
      localStorage.setItem(this.k.answers, JSON.stringify([]));
      localStorage.setItem(this.k.seed, "1");
    }
    // 跨标签页"实时"同步
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("coupleqa_")) this._notify();
    });
    window.addEventListener("coupleqa:localchange", () => this._notify());
  }

  _read(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
  _write(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); this._notify(); }

  _notify() { this.listeners.forEach((cb) => { try { cb(); } catch {} }); }

  profileOf(email) {
    const acc = this.config.accounts.find((a) => a.email === email);
    return {
      id: email, email,
      display_name: acc ? acc.name : email.split("@")[0],
    };
  }

  async signIn(email, password) {
    await new Promise((r) => setTimeout(r, 350)); // 模拟网络延迟
    const acc = this.config.accounts.find((a) => a.email === email);
    if (!acc) throw new Error("该邮箱不在预设账号中");
    const expected = String(acc.password || "");
    if (!expected) throw new Error("该账号未设置密码，请先在 js/config.js 中配置");
    if (String(password || "") !== expected) throw new Error("密码不正确");
    localStorage.setItem(this.k.session, email);
    const u = this.profileOf(email);
    this.authListeners.forEach((cb) => cb(u));
    return u;
  }

  async signOut() { localStorage.removeItem(this.k.session); this.authListeners.forEach((cb) => cb(null)); }

  currentUser() {
    const email = localStorage.getItem(this.k.session);
    return email ? this.profileOf(email) : null;
  }

  onAuthChange(cb) { this.authListeners.push(cb); }

  async fetchAll() {
    const questions = this._read(this.k.questions);
    const answers = this._read(this.k.answers);
    const profiles = this.config.accounts.map((a) => this.profileOf(a.email));
    return { questions, answers, profiles };
  }

  async addQuestion(content, user) {
    const qs = this._read(this.k.questions);
    const q = {
      id: uid(), content, status: "待回答",
      created_by: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    qs.unshift(q);
    this._write(this.k.questions, qs);
    return q;
  }

  async updateQuestion(id, patch) {
    const qs = this._read(this.k.questions);
    const q = qs.find((x) => x.id === id);
    if (q) Object.assign(q, patch, { updated_at: new Date().toISOString() });
    this._write(this.k.questions, qs);
  }

  async deleteQuestion(id) {
    this._write(this.k.questions, this._read(this.k.questions).filter((q) => q.id !== id));
    this._write(this.k.answers, this._read(this.k.answers).filter((a) => a.question_id !== id));
  }

  async saveAnswer(questionId, content, user) {
    const arr = this._read(this.k.answers);
    const now = new Date().toISOString();
    let a = arr.find((x) => x.question_id === questionId && x.user_id === user.id);
    if (a) { a.content = content; a.answered_at = now; }
    else { a = { id: uid(), question_id: questionId, user_id: user.id, content, answered_at: now }; arr.push(a); }
    this._write(this.k.answers, arr);
    return a;
  }

  subscribe(cb) { this.listeners.push(cb); return () => {}; }
}

/* ---------------- Supabase 云端适配器 ---------------- */
class SupabaseAdapter {
  constructor(config) {
    this.config = config;
    this.mode = "cloud";
    this.sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    this.listeners = [];
    this.authListeners = [];
    this.channel = null;
  }

  async init() {
    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") this.authListeners.forEach((cb) => cb(null));
      else if (session) this._bootstrapProfile(session.user).then((u) => {
        this.authListeners.forEach((cb) => cb(u));
      }).catch(() => {});
    });
    this.channel = this.sb.channel("couple-qa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => this._notify())
      .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, () => this._notify())
      .subscribe();
  }

  _notify() { this.listeners.forEach((cb) => { try { cb(); } catch {} }); }

  _accOf(email) {
    return this.config.accounts.find((a) => a.email === email) || null;
  }

  async _bootstrapProfile(user) {
    let { data: profiles } = await this.sb.from("profiles").select("*").eq("id", user.id);
    let p = profiles && profiles[0];
    const acc = this._accOf(user.email);
    const emailPrefix = (user.email || "").split("@")[0];
    if (!p) {
      p = {
        id: user.id, email: user.email,
        display_name: acc ? acc.name : emailPrefix,
      };
      await this.sb.from("profiles").upsert(p);
    } else if (acc && p.display_name === emailPrefix && acc.name !== emailPrefix) {
      // 名字还是注册时的默认值（邮箱前缀）→ 纠正为配置里的名字
      p = { ...p, display_name: acc.name };
      await this.sb.from("profiles").upsert(p);
    }
    return { id: user.id, email: p.email || user.email, display_name: p.display_name };
  }

  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = /invalid login credentials/i.test(error.message) ? "邮箱或密码不对"
        : /email not confirmed/i.test(error.message) ? "邮箱还没验证，去邮箱里点一下确认链接"
        : "登录失败：" + error.message;
      throw new Error(msg);
    }
    return this._bootstrapProfile(data.user);
  }

  async signOut() { await this.sb.auth.signOut(); }

  currentUser() {
    return new Promise((resolve) => {
      this.sb.auth.getSession().then(({ data }) => {
        if (!data || !data.session) return resolve(null);
        this._bootstrapProfile(data.session.user).then(resolve).catch(() => resolve(null));
      });
    });
  }

  onAuthChange(cb) { this.authListeners.push(cb); }

  async fetchAll() {
    const [qs, as, ps] = await Promise.all([
      this.sb.from("questions").select("*").order("created_at", { ascending: false }),
      this.sb.from("answers").select("*"),
      this.sb.from("profiles").select("*"),
    ]);
    if (qs.error) throw qs.error;
    if (as.error) throw as.error;
    if (ps.error) throw ps.error;
    return { questions: qs.data || [], answers: as.data || [], profiles: ps.data || [] };
  }

  async addQuestion(content, user) {
    const { data, error } = await this.sb.from("questions")
      .insert({ content, status: "待回答", created_by: user.id })
      .select().single();
    if (error) throw error;
    return data;
  }

  async updateQuestion(id, patch) {
    const { error } = await this.sb.from("questions")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  async deleteQuestion(id) {
    const { error } = await this.sb.from("questions").delete().eq("id", id);
    if (error) throw error;
  }

  async saveAnswer(questionId, content, user) {
    const { data, error } = await this.sb.from("answers")
      .upsert(
        { question_id: questionId, user_id: user.id, content, answered_at: new Date().toISOString() },
        { onConflict: "question_id,user_id" }
      ).select().single();
    if (error) throw error;
    return data;
  }

  subscribe(cb) {
    this.listeners.push(cb);
    return () => { if (this.channel) this.sb.removeChannel(this.channel); };
  }
}

/* ============================================================
   应用状态与启动
   ============================================================ */
const S = {
  adapter: null,
  me: null,
  partner: null,       // { name, email, id? }
  questions: [],
  answers: [],
  profiles: [],
  drafts: {},          // qid -> 文本草稿（内存）
  view: { page: "home", arg: null },
  filters: { questions: "全部", replies: "双方已答" },
  busy: false,
};

const DRAFT_KEY = "coupleqa_drafts";
function loadDrafts() { try { S.drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { S.drafts = {}; } }
function saveDrafts() { localStorage.setItem(DRAFT_KEY, JSON.stringify(S.drafts)); }

function otherAccountOf(me) {
  const cfg = window.APP_CONFIG;
  const other = cfg.accounts.find((a) => a.email !== me.email) || cfg.accounts[0];
  const prof = S.profiles.find((p) => p.email === other.email);
  return {
    id: prof ? prof.id : null,
    email: other.email,
    name: prof ? prof.display_name : other.name,
  };
}

function answersOf(qid) {
  const mine = S.answers.find((a) => a.question_id === qid && a.user_id === S.me.id);
  const partnerId = S.partner.id;
  const theirs = partnerId
    ? S.answers.find((a) => a.question_id === qid && a.user_id === partnerId)
    : null;
  // 云端模式下若 partner 尚未登录过，fallback：按“非我的答案”找
  const theirsAlt = theirs || S.answers.find((a) => a.question_id === qid && a.user_id !== S.me.id);
  return { mine, theirs: theirsAlt };
}

function myQueue() {
  return S.questions
    .filter((q) => q.status === "待回答" && !answersOf(q.id).mine)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function refreshData() {
  const { questions, answers, profiles } = await S.adapter.fetchAll();
  S.questions = questions;
  S.answers = answers;
  S.profiles = profiles;
  if (S.me) S.partner = otherAccountOf(S.me);
}

/* 双方都答完的题自动标记为“已回答” */
async function reconcileStatuses() {
  const flips = [];
  for (const q of S.questions) {
    if (q.status !== "已回答") {
      const { mine, theirs } = answersOf(q.id);
      if (mine && theirs) flips.push(q.id);
    }
  }
  for (const id of flips) {
    try { await S.adapter.updateQuestion(id, { status: "已回答" }); } catch {}
  }
  if (flips.length) {
    S.questions = S.questions.map((q) => (flips.includes(q.id) ? { ...q, status: "已回答" } : q));
  }
}

/* ---------------- 启动 ---------------- */
async function boot() {
  const cfg = window.APP_CONFIG;
  const hasCloud = cfg.supabaseUrl && cfg.supabaseAnonKey;
  try {
    if (hasCloud && window.supabase) {
      S.adapter = new SupabaseAdapter(cfg);
      await S.adapter.init();
    } else {
      S.adapter = new LocalAdapter(cfg);
      S.adapter.init();
    }
  } catch (e) {
    console.error(e);
  }

  loadDrafts();

  S.adapter.onAuthChange(async (user) => {
    if (user) {
      S.me = user;
      await safeRefresh();
      location.hash = "#/home";
      route();
    } else {
      S.me = null;
      route();
    }
  });

  S.adapter.subscribe(debounce(async () => {
    if (!S.me) return;
    await safeRefresh(true);
    rerenderPreservingDraft();
  }, 400));

  const me = await S.adapter.currentUser();
  if (me) { S.me = me; await safeRefresh(); }
  route();
}

async function safeRefresh(silent = false) {
  try {
    await refreshData();
    await reconcileStatuses();
  } catch (e) {
    console.error(e);
    if (!silent) toast("数据加载失败，请检查网络", "err");
  }
}

/* ============================================================
   路由与导航
   ============================================================ */
const PAGES = ["home", "questions", "answer", "replies"];
const TABS = [
  { key: "home", label: "首页" },
  { key: "questions", label: "问题" },
  { key: "answer", label: "答题" },
  { key: "replies", label: "回复" },
];

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  if (!S.me) { renderLogin(); return; }
  const p = PAGES.includes(page) ? page : "home";
  S.view = { page: p, arg: arg || null };
  const map = {
    home: renderHome, questions: renderQuestions,
    answer: renderAnswer, replies: renderReplies,
  };
  map[p]();
  window.scrollTo({ top: 0 });
}

function rerenderPreservingDraft() {
  if (S.view.page === "answer") {
    const t = $("#ans-text");
    if (t) S.drafts[currentAnswerQid()] = t.value;
  }
  route();
  if (S.view.page === "answer") {
    const t = $("#ans-text");
    if (t) { t.value = S.drafts[currentAnswerQid()] || ""; }
  }
}

function currentAnswerQid() {
  const queue = myQueue();
  if (S.view.arg) {
    if (S.questions.some((q) => q.id === S.view.arg)) return S.view.arg;
  }
  return queue.length ? queue[0].id : null;
}

function tabbarHTML() {
  const qLeft = myQueue().length;
  return `<nav class="tabbar"><div class="tabbar-inner">${TABS.map((t) => `
    <button class="tab ${S.view.page === t.key ? "active" : ""}" data-action="nav" data-page="${t.key}">
      <span class="dot ${t.key === "answer" && qLeft > 0 ? "show" : ""}"></span>
      <span>${t.label}</span>
    </button>`).join("")}
  </div></nav>`;
}

function shell(inner) {
  const modeTag = S.adapter.mode === "local"
    ? `<div class="mode-badge">演示模式 · 数据仅存于本机 · 双人同步配置见 README</div>`
    : `<div class="mode-badge">云端同步 · 数据仅双方可见</div>`;
  $("#app").innerHTML = inner + tabbarHTML();
  const badge = document.createElement("div");
  badge.innerHTML = modeTag;
  $("#app").appendChild(badge.firstElementChild);
}

function pageHeader(title, rightHTML = "") {
  return `
    <div class="topbar">
      <div class="title">${esc(title)}</div>
      <div class="topbar-right">
        ${rightHTML}
        <div class="me-chip" data-action="account-sheet" title="账号">
          <span class="avatar">${esc(initialOf(S.me.display_name))}</span>${esc(S.me.display_name)}
        </div>
      </div>
    </div>`;
}

/* ============================================================
   视图：登录
   ============================================================ */
let pickedEmail = null;

function renderLogin() {
  const cfg = window.APP_CONFIG;
  const accounts = cfg.accounts;
  if (!pickedEmail) pickedEmail = accounts[0].email;
  const picked = accounts.find((a) => a.email === pickedEmail);
  $("#app").innerHTML = `
    <div class="login-wrap">
      <div class="login-hero">
        <div class="brand">${esc(cfg.appName)}</div>
        <div class="brand-sub">${esc(cfg.tagline)}</div>
      </div>
      <div class="login-card">
        <div class="login-card-label">选择账号</div>
        ${accounts.map((a, i) => `
        <div class="identity-card ${a.email === pickedEmail ? "selected" : ""}" data-action="login-pick" data-email="${esc(a.email)}">
          <span class="avatar ${i === 1 ? "alt" : ""}">${esc(initialOf(a.name))}</span>
          <div class="who">
            <div class="name">${esc(a.name)}</div>
            <div class="mail">${esc(a.email)}</div>
          </div>
          <span class="pick-dot"></span>
        </div>`).join("")}
        <div class="login-divider"></div>
        <div class="login-pw">
          <input id="login-password" type="password" placeholder="输入 ${esc(picked ? picked.name : "")} 的密码"
                 autocomplete="current-password">
        </div>
        <div class="login-error" id="login-error"></div>
        <button class="btn btn-primary btn-block login-submit" data-action="login-submit">登录</button>
      </div>
      <div class="mode-badge">
        ${S.adapter && S.adapter.mode === "local"
          ? `演示模式 · 数据仅存储于本机浏览器<br>双人同步的配置方法见 README.md`
          : `数据云端存储 · 仅双方账号可见`}
      </div>
    </div>`;
}

async function doLogin() {
  const pw = ($("#login-password") || {}).value || "";
  const errEl = $("#login-error");
  const btn = document.querySelector('[data-action="login-submit"]');
  if (!pw) { errEl.textContent = "先输入密码"; return; }
  btn.disabled = true;
  btn.textContent = "登录中…";
  try {
    await S.adapter.signIn(pickedEmail, pw);
    toast("欢迎回来", "ok");
  } catch (e) {
    errEl.textContent = e.message || "登录失败";
    btn.disabled = false;
    btn.textContent = "登 录";
  }
}

/* ============================================================
   视图：首页
   ============================================================ */
function renderHome() {
  const hour = new Date().getHours();
  const hi = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${["日","一","二","三","四","五","六"][today.getDay()]}`;

  const total = S.questions.length;
  const queue = myQueue();
  const bothDone = S.questions.filter((q) => { const { mine, theirs } = answersOf(q.id); return mine && theirs; });

  shell(`
    ${pageHeader(window.APP_CONFIG.appName)}
    <div class="hero">
      <div class="hi">${hi}，${esc(S.me.display_name)}</div>
      <div class="date">${esc(dateStr)}</div>
    </div>

    <div class="stat-row">
      <div class="stat-cell"><b>${total}</b><span>全部问题</span></div>
      <div class="stat-cell"><b>${queue.length}</b><span>我待回答</span></div>
      <div class="stat-cell"><b>${bothDone.length}</b><span>双方完成</span></div>
    </div>

    <div class="list-card">
      <div class="quick-row ${queue.length ? "emph" : ""}" data-action="nav" data-page="answer">
        <div class="main">
          <div class="t">继续答题<span class="count"> ${queue.length ? `· ${queue.length} 题待回答` : "· 已全部完成"}</span></div>
          <div class="d">写下你的回答，保存后对方即可看到</div>
        </div>
        <span class="chev">›</span>
      </div>
      <div class="quick-row" data-action="nav" data-page="replies">
        <div class="main">
          <div class="t">查看回复</div>
          <div class="d">对照彼此的回答与时间</div>
        </div>
        <span class="chev">›</span>
      </div>
      <div class="quick-row" data-action="q-add">
        <div class="main">
          <div class="t">新建问题</div>
          <div class="d">添加一道新的问题</div>
        </div>
        <span class="chev">›</span>
      </div>
      <div class="quick-row" data-action="nav" data-page="questions">
        <div class="main">
          <div class="t">问题列表</div>
          <div class="d">管理与筛选全部问题</div>
        </div>
        <span class="chev">›</span>
      </div>
    </div>
  `);
}

/* ============================================================
   视图：问题列表
   ============================================================ */
function renderQuestions() {
  const f = S.filters.questions;
  const list = S.questions.filter((q) => {
    if (f === "全部") return true;
    return q.status === f;
  });
  const counts = {
    全部: S.questions.length,
    待回答: S.questions.filter((q) => q.status === "待回答").length,
    已回答: S.questions.filter((q) => q.status === "已回答").length,
  };

  const listHTML = list.length ? list.map((q) => {
    const { mine, theirs } = answersOf(q.id);
    return `
    <div class="q-item">
      <div class="q-head">
        <div class="q-text" data-action="reply-jump" data-qid="${esc(q.id)}">${esc(q.content)}</div>
        <div class="q-ops">
          <button class="icon-btn" data-action="q-edit" data-qid="${esc(q.id)}">编辑</button>
          <button class="icon-btn" data-action="q-delete" data-qid="${esc(q.id)}">删除</button>
        </div>
      </div>
      <div class="q-meta">
        <span class="chip ${q.status === "已回答" ? "done" : "todo"}">${q.status}</span>
        <span class="ans-badge ${mine ? "done" : ""}">${esc(S.me.display_name)} ${mine ? "已答" : "未答"}</span>
        <span class="ans-badge ${theirs ? "done" : ""}">${esc((S.partner && S.partner.name) || "对方")} ${theirs ? "已答" : "未答"}</span>
        <span class="ans-badge">${esc(authorName(q))} 创建 · ${esc(relTime(q.created_at))}</span>
      </div>
    </div>`;
  }).join("") : `
    <div class="empty">
      <div class="hint">${f === "全部" ? "暂无问题<br>点击右上角「新建问题」创建第一个问题" : "此分类下暂无问题"}</div>
    </div>`;

  shell(`
    ${pageHeader("问题列表", `<button class="btn btn-ghost btn-sm" data-action="q-add">新建问题</button>`)}
    <div class="filter-row">
      ${["全部", "待回答", "已回答"].map((x) => `
        <button class="filter-pill ${f === x ? "active" : ""}" data-action="q-filter" data-filter="${x}">
          ${x}（${counts[x]}）
        </button>`).join("")}
    </div>
    ${listHTML}
    <div style="height:20px"></div>
  `);
}

function authorName(q) {
  if (q.created_by === S.me.id) return S.me.display_name;
  if (S.partner && q.created_by === S.partner.id) return S.partner.name;
  // 本地模式 created_by 就是邮箱
  const acc = window.APP_CONFIG.accounts.find((a) => a.email === q.created_by);
  if (acc) return acc.name;
  return "对方";
}

/* ============================================================
   视图：答题
   ============================================================ */
function renderAnswer() {
  const queue = myQueue();
  let q = null;

  if (S.view.arg) {
    q = S.questions.find((x) => x.id === S.view.arg) || null;
  }
  if (!q && queue.length) {
    q = queue[0];
  }

  if (!q) {
    // 没有可答的题：答完了或没有题
    const total = S.questions.length;
    shell(`
      ${pageHeader("答题")}
      <div class="empty" style="padding-top:80px">
        <div class="hint">
          ${total === 0 ? "暂无问题<br>创建第一个问题后即可作答" : "当前没有待回答的问题<br>可创建新问题，或等待对方作答"}
        </div>
        <div style="margin-top:18px">
          <button class="btn btn-primary" data-action="q-add">新建问题</button>
        </div>
      </div>
    `);
    return;
  }

  const { mine, theirs } = answersOf(q.id);
  const isEdit = !!mine;
  const inQueue = queue.some((x) => x.id === q.id);
  const draft = S.drafts[q.id] ?? (mine ? mine.content : "");
  // 进度 = 我已回答的题数 / 全部问题数（例：3 题答完 1 道 → 1 / 3）
  const totalQ = S.questions.length;
  const answeredByMe = S.questions.filter((x) => answersOf(x.id).mine).length;
  const progress = totalQ ? `${answeredByMe} / ${totalQ}` : "";
  const barW = totalQ ? Math.round((answeredByMe / totalQ) * 100) : 100;

  shell(`
    ${pageHeader("答题")}
    ${inQueue ? `
    <div class="answer-progress">
      <div class="ptext"><span>答题进度</span><span>${progress}</span></div>
      <div class="pbar"><i style="width:${barW}%"></i></div>
    </div>` : ""}

    <div class="question-card">
      <div class="q-big">${esc(q.content)}</div>
      <div class="q-from">${esc(authorName(q))} 创建 · ${esc(relTime(q.created_at))}</div>
      ${isEdit ? `<div class="edit-note">正在编辑 ${esc(fmtTime(mine.answered_at))} 提交的回答</div>` : ""}
    </div>

    <div class="ans-input-wrap">
      <textarea id="ans-text" placeholder="写下你的答案…（草稿自动保存）">${esc(draft)}</textarea>
      <div class="save-state" id="save-state">${isEdit ? "" : "草稿保存于本机，点击下方按钮提交"}</div>
      <div class="ans-actions">
        <button class="btn btn-primary" data-action="ans-save">${isEdit ? "保存修改" : "保存并继续"}</button>
      </div>
    </div>
  `);
}

async function saveAnswerAndNext() {
  const qid = currentAnswerQid();
  if (!qid) return;
  const t = $("#ans-text");
  const content = (t ? t.value : "").trim();
  if (!content) { toast("请填写答案后再保存", "err"); return; }
  const btn = document.querySelector('[data-action="ans-save"]');
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    await S.adapter.saveAnswer(qid, content, S.me);
    delete S.drafts[qid]; saveDrafts();
    await safeRefresh(true);
    toast("已保存", "ok");
    // 找下一题
    const queue = myQueue();
    const next = queue.find((x) => x.id !== qid);
    if (next) {
      location.hash = `#/answer/${next.id}`;
    } else {
      location.hash = "#/answer";
    }
    route();
  } catch (e) {
    console.error(e);
    toast("保存失败：" + (e.message || "网络异常"), "err");
    btn.disabled = false;
    btn.textContent = "保存并继续";
  }
}

/* 云端模式：输入停顿后自动上传草稿 */
const autoCloudSave = debounce(async () => {
  if (S.adapter.mode !== "cloud") return;
  const qid = currentAnswerQid();
  const t = $("#ans-text");
  if (!qid || !t) return;
  const content = t.value.trim();
  if (!content) return;
  try {
    await S.adapter.saveAnswer(qid, content, S.me);
    const st = $("#save-state");
    if (st) { st.textContent = "已实时同步 " + new Date().toLocaleTimeString("zh-CN", { hour12: false }); st.className = "save-state cloud"; }
  } catch {}
}, 1500);

/* ============================================================
   视图：查看回复
   ============================================================ */
function renderReplies() {
  const f = S.filters.replies;

  const enriched = S.questions.map((q) => {
    const { mine, theirs } = answersOf(q.id);
    const latest = [mine && mine.answered_at, theirs && theirs.answered_at, q.created_at]
      .filter(Boolean).sort().pop();
    return { q, mine, theirs, latest, both: !!(mine && theirs) };
  }).sort((a, b) => new Date(b.latest) - new Date(a.latest));

  const list = enriched.filter((e) => {
    if (f === "全部") return true;
    if (f === "双方已答") return e.both;
    if (f === "待补答") return !e.both;
    return true;
  });

  const counts = {
    全部: enriched.length,
    双方已答: enriched.filter((e) => e.both).length,
    待补答: enriched.filter((e) => !e.both).length,
  };

  const listHTML = list.length ? list.map(({ q, mine, theirs, both }) => {
    const openCls = (S.view.arg === q.id) ? "open" : "";
    return `
    <div class="reply-item ${openCls}" data-qid="${esc(q.id)}">
      <div class="q-line" data-action="reply-toggle" data-qid="${esc(q.id)}">
        <div class="q">${esc(q.content)}</div>
        <span class="arrow">›</span>
      </div>
      <div class="reply-detail">
        <div class="reply-pair">
          <div class="ans-mini me">
            <div class="who"><span class="avatar">${esc(initialOf(S.me.display_name))}</span>${esc(S.me.display_name)}
              <span class="t">${mine ? esc(fmtTime(mine.answered_at)) : ""}</span></div>
            <div class="a">${mine ? esc(mine.content) : "尚未作答"}</div>
          </div>
          <div class="ans-mini ${theirs ? "ta" : "none"}">
            <div class="who"><span class="avatar alt">${esc(initialOf((S.partner && S.partner.name) || "对方"))}</span>${esc((S.partner && S.partner.name) || "对方")}
              <span class="t">${theirs ? esc(fmtTime(theirs.answered_at)) : ""}</span></div>
            <div class="a">${theirs ? esc(theirs.content) : "等待对方回答"}</div>
          </div>
        </div>
        <div class="match-line">
          ${!mine ? `<button class="btn btn-ghost btn-sm" data-action="ans-edit" data-qid="${esc(q.id)}">去作答</button>`
                  : (mine ? `<button class="btn btn-ghost btn-sm" data-action="ans-edit" data-qid="${esc(q.id)}">修改我的回答</button>` : "")}
        </div>
      </div>
    </div>`;
  }).join("") : `
    <div class="empty">
      <div class="hint">${S.questions.length === 0 ? "暂无问题" : "此分类下暂无内容"}</div>
    </div>`;

  shell(`
    ${pageHeader("查看回复")}
    <div class="filter-row">
      ${["全部", "双方已答", "待补答"].map((x) => `
        <button class="filter-pill ${f === x ? "active" : ""}" data-action="reply-filter" data-filter="${x}">
          ${x}（${counts[x]}）
        </button>`).join("")}
    </div>
    <div class="stats-note" style="margin:0 0 12px;text-align:left">点击问题，展开双方的回答与时间</div>
    ${listHTML}
    <div style="height:20px"></div>
  `);
}

/* ============================================================
   弹层：新增 / 编辑 / 删除 问题
   ============================================================ */
function closeModal() { const m = $("#modal-root"); if (m) m.innerHTML = ""; }

function openAddQuestionSheet(prefill = "") {
  $("#modal-root").innerHTML = `
    <div class="modal-mask" data-action="modal-close">
      <div class="sheet" data-stop="1">
        <div class="grab"></div>
        <h3>新建问题</h3>
        <textarea id="q-content" placeholder="输入问题内容">${esc(prefill)}</textarea>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-action="modal-close">取消</button>
          <button class="btn btn-primary" data-action="q-save">保存</button>
        </div>
      </div>
    </div>`;
}

/* 账号面板：当前账号信息 + 退出登录（两步确认） */
function openAccountSheet() {
  const modeText = S.adapter.mode === "local"
    ? "演示模式 · 数据仅存储于本机浏览器"
    : "云端同步 · 数据仅双方账号可见";
  const partner = S.partner || {};
  $("#modal-root").innerHTML = `
    <div class="modal-mask" data-action="modal-close">
      <div class="sheet" data-stop="1">
        <div class="grab"></div>
        <h3>账号</h3>
        <div class="account-row">
          <span class="avatar">${esc(initialOf(S.me.display_name))}</span>
          <div class="who">
            <div class="name">${esc(S.me.display_name)}</div>
            <div class="mail">${esc(S.me.email || "")}</div>
          </div>
        </div>
        <div class="account-divider"></div>
        <div class="account-row muted">
          <span class="avatar alt">${esc(initialOf(partner.name || "对方"))}</span>
          <div class="who">
            <div class="name">${esc(partner.name || "对方")}</div>
            <div class="mail">${esc(partner.email || "")}</div>
          </div>
        </div>
        <div class="mode-note">${esc(modeText)}</div>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-action="modal-close">关闭</button>
          <button class="btn btn-danger-outline" data-action="logout-confirm">退出登录</button>
        </div>
      </div>
    </div>`;
}

function openEditQuestionSheet(q) {
  $("#modal-root").innerHTML = `
    <div class="modal-mask" data-action="modal-close">
      <div class="sheet" data-stop="1">
        <div class="grab"></div>
        <h3>编辑问题</h3>
        <textarea id="q-content">${esc(q.content)}</textarea>
        <div class="field-label">状态</div>
        <select id="q-status">
          <option value="待回答" ${q.status === "待回答" ? "selected" : ""}>待回答</option>
          <option value="已回答" ${q.status === "已回答" ? "selected" : ""}>已回答</option>
        </select>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-action="modal-close">取消</button>
          <button class="btn btn-primary" data-action="q-save" data-qid="${esc(q.id)}">保存</button>
        </div>
      </div>
    </div>`;
}

function openDeleteQuestionSheet(q) {
  $("#modal-root").innerHTML = `
    <div class="modal-mask" data-action="modal-close">
      <div class="sheet" data-stop="1">
        <div class="grab"></div>
        <h3>删除问题</h3>
        <div class="q-preview">「${esc(q.content)}」</div>
        <div class="danger-note">删除后，该问题下双方已提交的回答将一并删除，且无法恢复。</div>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-action="modal-close">取消</button>
          <button class="btn btn-danger" data-action="q-delete-confirm" data-qid="${esc(q.id)}">确认删除</button>
        </div>
      </div>
    </div>`;
}

async function saveQuestionSheet(qid) {
  const content = ($("#q-content") || {}).value || "";
  const statusEl = $("#q-status");
  const btn = document.querySelector('[data-action="q-save"]');
  if (!content.trim()) { toast("问题不能为空", "err"); return; }
  btn.disabled = true;
  try {
    if (qid) {
      await S.adapter.updateQuestion(qid, { content: content.trim(), status: statusEl ? statusEl.value : undefined });
      toast("已更新", "ok");
    } else {
      await S.adapter.addQuestion(content.trim(), S.me);
      toast("问题已创建", "ok");
    }
    closeModal();
    await safeRefresh(true);
    route();
  } catch (e) {
    toast("保存失败：" + (e.message || "网络异常"), "err");
    btn.disabled = false;
  }
}

/* ============================================================
   事件委托
   ============================================================ */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const act = el.dataset.action;

  switch (act) {
    case "nav": location.hash = "#/" + el.dataset.page; route(); break;

    case "login-pick":
      pickedEmail = el.dataset.email;
      renderLogin();
      setTimeout(() => $("#login-password") && $("#login-password").focus(), 50);
      break;

    case "login-submit": doLogin(); break;

    case "account-sheet": openAccountSheet(); break;

    case "logout-confirm":
      if (el.dataset.armed === "1") {
        closeModal();
        toast("已退出登录");
        S.adapter.signOut();
      } else {
        el.dataset.armed = "1";
        el.textContent = "确认退出";
      }
      break;

    case "q-add": openAddQuestionSheet(); break;
    case "q-save": saveQuestionSheet(el.dataset.qid || null); break;

    case "q-edit": {
      const q = S.questions.find((x) => x.id === el.dataset.qid);
      if (q) openEditQuestionSheet(q);
      break;
    }
    case "q-delete": {
      const q = S.questions.find((x) => x.id === el.dataset.qid);
      if (q) openDeleteQuestionSheet(q);
      break;
    }
    case "q-delete-confirm": {
      const qid = el.dataset.qid;
      closeModal();
      S.adapter.deleteQuestion(qid).then(async () => {
        toast("已删除");
        await safeRefresh(true);
        route();
      }).catch((err) => toast("删除失败：" + err.message, "err"));
      break;
    }

    case "q-filter": S.filters.questions = el.dataset.filter; route(); break;
    case "reply-filter": S.filters.replies = el.dataset.filter; route(); break;

    case "reply-jump": {
      S.filters.replies = "全部";
      location.hash = "#/replies";
      S.view = { page: "replies", arg: el.dataset.qid };
      route();
      const item = document.querySelector(`.reply-item[data-qid="${CSS.escape(el.dataset.qid)}"]`);
      if (item) { item.classList.add("open"); setTimeout(() => item.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
      break;
    }
    case "reply-toggle": {
      const item = el.closest(".reply-item");
      if (item) item.classList.toggle("open");
      break;
    }
    case "ans-edit": {
      const qid = el.dataset.qid;
      location.hash = "#/answer/" + qid;
      S.view = { page: "answer", arg: qid };
      route();
      break;
    }

    case "ans-save": saveAnswerAndNext(); break;

    case "modal-close":
      // 点击遮罩关闭；点内容区不关闭
      if (e.target === el) closeModal();
      break;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target && e.target.id === "login-password") doLogin();
  if (e.key === "Escape") closeModal();
});

document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "ans-text") {
    const qid = currentAnswerQid();
    if (qid) { S.drafts[qid] = e.target.value; saveDrafts(); }
    autoCloudSave();
  }
});

window.addEventListener("hashchange", () => { if (S.me || location.hash !== "#/login") route(); });

/* ---------------- 启动 ---------------- */
boot();
