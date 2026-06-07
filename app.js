/* =========================================================
   리서치 데스크 — app.js
   브라우저(localStorage) 저장 · 깃헙 페이지 정적 호스팅용
   ========================================================= */

const STORE_KEY = "researchDesk.v1";

/* ---------- 섹션 정의 ---------- */
const SECTIONS = {
  news:     { num:"01", label:"뉴스",            cad:"매일", daily:true,  color:"--c-news",     meta:"출처 (선택)" },
  video:    { num:"02", label:"시황 영상 요약",   cad:"매일", daily:true,  color:"--c-video",    meta:"영상 · 채널 (선택)" },
  telegram: { num:"03", label:"텔레그램 스크리닝", cad:"매일", daily:true,  color:"--c-telegram", meta:"채널 (선택)" },
  reading:  { num:"04", label:"독서",            cad:"주1", daily:false, color:"--c-reading",  meta:"책 · 저자 (선택)" },
  report:   { num:"05", label:"리포트 · 종목분석", cad:"주1", daily:false, color:"--c-report",   meta:"종목 · 티커 (선택)" },
  sector:   { num:"06", label:"섹터 딥리서치",     cad:"주1+",daily:false, color:"--c-sector",   meta:"섹터 (선택)" },
};
const SECTION_KEYS = Object.keys(SECTIONS);
const DOW = ["일","월","화","수","목","금","토"];

/* ---------- 상태 ---------- */
let state = load();
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return { version:1, settings:{ theme:"light" }, entries:[] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast("저장 공간이 부족합니다. 큰 이미지는 피해주세요."); }
}
if (!state.deleted) state.deleted = {};   // 삭제 로그(기기 간 삭제 동기화용)

/* 동기화 설정 (토큰은 이 기기에만 저장 — 깃헙에 올라가지 않음) */
const SYNC_KEY = "researchDesk.sync";
let sync = (() => { try { const r = localStorage.getItem(SYNC_KEY); if (r) return JSON.parse(r); } catch(e){} return null; })();
function saveSync() { if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); else localStorage.removeItem(SYNC_KEY); }
const syncOn = () => !!(sync && sync.token && sync.owner && sync.repo);

/* ---------- 유틸 ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => (s||"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function prettyDate(s) {
  if (!s) return "";
  const [y,m,d] = s.split("-").map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y,m-1,d).getDay()]})`;
}
function fullToday() {
  const d = new Date();
  return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,"0")}. ${String(d.getDate()).padStart(2,"0")}  ${DOW[d.getDay()]}요일`;
}
function weekKey(s) {
  const [y,m,d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const wk = Math.ceil((((dt - ys)/86400000)+1)/7);
  return `${dt.getUTCFullYear()}-W${wk}`;
}
function plainText(html) {
  const t = document.createElement("div"); t.innerHTML = html || "";
  return (t.textContent || "").replace(/\s+/g," ").trim();
}

/* ---------- HTML 정화 (붙여넣기 서식 유지 + 위험요소 제거) ---------- */
function sanitize(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  const KILL = ["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","LINK","META","TITLE","NOSCRIPT","FORM","INPUT","BUTTON"];
  tpl.content.querySelectorAll("*").forEach(el => {
    if (KILL.includes(el.tagName)) { el.remove(); return; }
    [...el.attributes].forEach(a => {
      const n = a.name.toLowerCase();
      if (n.startsWith("on")) el.removeAttribute(a.name);
      if ((n === "href" || n === "src") && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      if (n === "class" || n === "id") el.removeAttribute(a.name);
    });
  });
  return tpl.innerHTML;
}

/* ---------- 라우팅 ---------- */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h || h === "dashboard") return { type:"dashboard" };
  if (SECTION_KEYS.includes(h)) return { type:"section", key:h };
  const [a,b] = h.split("/");
  if (a === "entry" && b) return { type:"entry", id:b };
  if (a === "date" && b)  return { type:"date", date:b };
  return { type:"dashboard" };
}
function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function openRead(id) { navigate("#/entry/" + id); }
window.addEventListener("hashchange", render);

/* ---------- 사이드바 네비 ---------- */
function buildNav(r) {
  let activeKey = "dashboard";
  if (r.type === "section") activeKey = r.key;
  else if (r.type === "entry") { const e = state.entries.find(x=>x.id===r.id); activeKey = e ? e.section : ""; }
  else if (r.type === "date") activeKey = "";

  const nav = $("#nav");
  let html = `<button class="nav-item ${activeKey==="dashboard"?"active":""}" data-route="dashboard" style="--dot:var(--gold)">
      <span class="nav-tick" style="background:var(--gold)"></span>
      <span class="nav-num">＊</span><span class="nav-label">오늘</span></button>
    <div class="nav-sep"></div>`;
  SECTION_KEYS.forEach(k => {
    const s = SECTIONS[k];
    const n = state.entries.filter(e => e.section === k).length;
    html += `<button class="nav-item ${activeKey===k?"active":""}" data-route="${k}" style="--dot:var(${s.color})">
      <span class="nav-tick"></span><span class="nav-num">${s.num}</span>
      <span class="nav-label">${s.label}</span>
      ${n ? `<span class="nav-count">${n}</span>` : `<span class="nav-cad">${s.cad}</span>`}</button>`;
  });
  nav.innerHTML = html;
  $$(".nav-item", nav).forEach(b => b.onclick = () => { navigate("#/" + b.dataset.route); closeSidebar(); });
}

/* ---------- 미니 캘린더 ---------- */
let calMonth = (() => { const d = new Date(); return { y:d.getFullYear(), m:d.getMonth() }; })();
function buildCalendar(r) {
  const cal = $("#calendar"); if (!cal) return;
  const { y, m } = calMonth;
  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m+1, 0).getDate();
  const today = todayStr();
  const selected = r.type === "date" ? r.date : null;
  const dateSet = new Set(state.entries.map(e => e.date));

  let cells = "";
  for (let i=0;i<startDow;i++) cells += `<div class="cal-day out"></div>`;
  for (let d=1; d<=days; d++) {
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cls = ["cal-day"];
    if (ds === today) cls.push("today");
    if (ds === selected) cls.push("sel");
    if (dateSet.has(ds)) cls.push("has");
    cells += `<div class="${cls.join(" ")}" data-d="${ds}">${d}</div>`;
  }
  cal.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" data-mv="-1">‹</button>
      <span class="cal-title">${y}. ${String(m+1).padStart(2,"0")}</span>
      <button class="cal-nav" data-mv="1">›</button>
    </div>
    <div class="cal-dow">${DOW.map(x=>`<span>${x}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>`;
  $$(".cal-nav", cal).forEach(b => b.onclick = () => {
    let nm = calMonth.m + (+b.dataset.mv), ny = calMonth.y;
    if (nm < 0) { nm = 11; ny--; } if (nm > 11) { nm = 0; ny++; }
    calMonth = { y:ny, m:nm }; buildCalendar(r);
  });
  $$(".cal-day", cal).forEach(c => { if (c.dataset.d) c.onclick = () => navigate("#/date/" + c.dataset.d); });
}

/* ---------- 렌더 디스패치 ---------- */
function render() {
  const r = parseRoute();
  if (r.type === "date") { const [yy,mm] = r.date.split("-").map(Number); calMonth = { y:yy, m:mm-1 }; }
  buildNav(r);
  buildCalendar(r);
  $("#mastheadDate").textContent = fullToday();
  if (r.type === "dashboard") renderDashboard();
  else if (r.type === "section") renderSection(r.key);
  else if (r.type === "entry") renderRead(r.id);
  else if (r.type === "date") renderDate(r.date);
}

/* === 대시보드 === */
function renderDashboard() {
  $("#topbarNum").textContent = "＊";
  $("#topbarNum").style.setProperty("--dot", "var(--gold)");
  $("#topbarTitle").textContent = "오늘";
  $("#topbarRight").innerHTML = "";

  const today = todayStr(), tWeek = weekKey(today);
  const total = state.entries.length;
  const weekCount = state.entries.filter(e => weekKey(e.date) === tWeek).length;
  const streak = calcStreak();

  const dailyKeys = SECTION_KEYS.filter(k => SECTIONS[k].daily);
  const weeklyKeys = SECTION_KEYS.filter(k => !SECTIONS[k].daily);
  const routineCard = (k, period) => {
    const s = SECTIONS[k];
    const done = period === "day"
      ? state.entries.some(e => e.section === k && e.date === today)
      : state.entries.some(e => e.section === k && weekKey(e.date) === tWeek);
    return `<div class="routine-card" style="--dot:var(${s.color})" data-new="${k}">
      <div class="routine-top"><span class="routine-name">${s.label}</span>
        <span class="routine-status ${done?"done":"todo"}">${done?"✓":"○"}</span></div>
      <div class="routine-meta">${s.num} · ${period==="day"?"오늘":"이번 주"} ${done?"완료":"미작성"}</div>
      <div class="routine-cta">＋ 기록하기</div></div>`;
  };

  // 이번 주 주목 종목·섹터 집계
  const watchFreq = {};
  state.entries.filter(e => weekKey(e.date) === tWeek)
    .forEach(e => (e.watch||[]).forEach(w => { watchFreq[w] = (watchFreq[w]||0)+1; }));
  const watchSorted = Object.entries(watchFreq).sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
  const watchPanel = watchSorted.length
    ? `<div class="watch-grid">${watchSorted.map(([w,c])=>
        `<button class="watch-chip" data-q="${esc(w)}">${esc(w)}${c>1?`<span class="wc-count">${c}</span>`:""}</button>`).join("")}</div>`
    : `<div class="watch-empty">이번 주 기록에 "주목 종목·섹터"를 추가하면 여기에 모여 표시됩니다. 딥리서치할 때 참고하세요.</div>`;

  const recent = [...state.entries].sort((a,b)=> (b.updated||0)-(a.updated||0)).slice(0,8);

  $("#view").innerHTML = `
    <div class="mkt-strip-wrap">
      <div class="mkt-strip-head"><span class="mkt-strip-title">실시간 지수</span>
        <button class="mkt-refresh" id="mktRefresh" title="새로고침">↻</button></div>
      <div class="mkt-strip" id="mktStrip">${mktStripSkeleton()}</div>
    </div>

    <div class="people-wrap">
      <div class="mkt-strip-head"><span class="mkt-strip-title">인물·인사이트 트래커 <span class="dash-h-note">야데니 · 트럼프 · 강세/약세 · 뉴스·Reddit·X</span></span>
        <button class="mkt-refresh" id="peopleRefresh" title="새로고침">↻</button></div>
      <div class="people-strip" id="peopleStrip">${peopleSkeleton()}</div>
    </div>

    <div class="dash-hello">좋은 하루예요, Sophia 👋</div>
    <div class="dash-sub">오늘은 <b>${fullToday()}</b> · 기록이 쌓일수록 판단이 선명해집니다.</div>
    <div class="stats">
      <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">전체 기록</div></div>
      <div class="stat"><div class="stat-n">${weekCount}</div><div class="stat-l">이번 주 기록</div></div>
      <div class="stat"><div class="stat-n flame">${streak}<span style="font-size:15px">일 🔥</span></div><div class="stat-l">연속 기록</div></div>
    </div>

    <div class="dash-h pf-h">관심종목 · 포트폴리오 <span class="dash-h-note">섹터별 시세 · 비중 · 매도검토</span>
      <button class="dash-h-btn" id="btnManageTickers">＋ 종목 관리</button></div>
    <div class="pf-panel" id="pfPanel"></div>

    <div class="dash-h news-h">실시간 헤드라인 <span class="dash-h-note">매일경제 · The Economist(번역) · 클릭 시 원문</span>
      <button class="dash-h-btn" id="btnNewsRefresh">↻ 새로고침</button></div>
    <div class="news-panel" id="newsList"><div class="news-loading">헤드라인 불러오는 중…</div></div>

    <div class="dash-h watch-h">이번 주 주목 종목 · 섹터 <span class="dash-h-note">기록에서 모은 키워드</span></div>
    <div class="watch-panel">${watchPanel}</div>

    <div class="dash-h">오늘의 루틴 · 매일</div>
    <div class="routine-grid">${dailyKeys.map(k=>routineCard(k,"day")).join("")}</div>
    <div class="dash-h">이번 주 · 주간 정리</div>
    <div class="routine-grid">${weeklyKeys.map(k=>routineCard(k,"week")).join("")}</div>

    <div class="dash-h">최근 기록</div>
    ${recent.length ? `<div class="recent">${recent.map(recentRow).join("")}</div>`
      : `<div class="empty"><div class="empty-mark">❝</div><p>아직 기록이 없어요. 위 루틴 카드를 눌러 시작해보세요.</p></div>`}
  `;

  $$(".routine-card").forEach(c => c.onclick = () => openEditor(c.dataset.new, null));
  $$(".recent-row").forEach(r => r.onclick = () => openRead(r.dataset.id));
  $$(".watch-chip").forEach(c => c.onclick = () => openSearchWith(c.dataset.q));
  $("#btnManageTickers").onclick = openTickerModal;
  $("#mktRefresh").onclick = () => { $("#mktStrip").innerHTML = mktStripSkeleton(); MKT.quotes = {}; loadIndexStrip(); loadPortfolioQuotes(); };
  const pr = $("#peopleRefresh"); if (pr) pr.onclick = () => { MKT.peopleAt = 0; $("#peopleStrip").innerHTML = peopleSkeleton(); loadPeople(); };
  $("#btnNewsRefresh").onclick = () => { MKT.newsAt = 0; $("#newsList").innerHTML = `<div class="news-loading">헤드라인 불러오는 중…</div>`; loadHeadlines(); };
  mountMarkets();
}
function recentRow(e) {
  const s = SECTIONS[e.section];
  return `<div class="recent-row" data-id="${e.id}">
    <span class="recent-dot" style="background:var(${s.color})"></span>
    <span class="recent-sec">${s.label}</span>
    <span class="recent-title">${esc(e.title) || "(제목 없음)"}</span>
    <span class="recent-date">${prettyDate(e.date)}</span></div>`;
}
function calcStreak() {
  const days = new Set(state.entries.map(e=>e.date));
  let streak = 0; const d = new Date();
  if (!days.has(todayStr())) d.setDate(d.getDate()-1);
  for (;;) {
    const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (days.has(s)) { streak++; d.setDate(d.getDate()-1); } else break;
  }
  return streak;
}

/* === 섹션 목록 === */
let listFilter = { text:"", tag:"" };
function renderSection(key) {
  const s = SECTIONS[key];
  $("#topbarNum").textContent = s.num;
  $("#topbarNum").style.setProperty("--dot", `var(${s.color})`);
  $("#topbarTitle").textContent = s.label;
  $("#topbarRight").innerHTML = `<button class="solid-btn" id="btnNew">＋ 새 기록</button>`;
  $("#btnNew").onclick = () => openEditor(key, null);
  listFilter = { text:"", tag:"" };
  drawList(key);
}
function drawList(key) {
  const s = SECTIONS[key];
  let entries = state.entries.filter(e => e.section === key)
    .sort((a,b)=> b.date.localeCompare(a.date) || (b.updated||0)-(a.updated||0));
  const allTags = [...new Set(entries.flatMap(e=>e.tags||[]))];
  if (listFilter.tag) entries = entries.filter(e => (e.tags||[]).includes(listFilter.tag));
  if (listFilter.text) {
    const q = listFilter.text.toLowerCase();
    entries = entries.filter(e => matchEntry(e,q));
  }
  const tools = `<div class="list-tools">
      <input class="filter-input" id="listFilter" placeholder="이 섹션 내 검색…" value="${esc(listFilter.text)}" />
      <div class="tag-filter">${allTags.slice(0,12).map(t=>
        `<button class="tag-pill ${listFilter.tag===t?"on":""}" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div></div>`;
  const body = entries.length
    ? `<div class="cards">${entries.map(e=>card(e,s,false)).join("")}</div>`
    : `<div class="empty"><div class="empty-mark">${s.num}</div>
         <p>${listFilter.text||listFilter.tag ? "조건에 맞는 기록이 없어요." : `아직 "${s.label}" 기록이 없습니다.`}</p>
         <button class="solid-btn" id="btnEmptyNew">＋ 첫 기록 작성</button></div>`;
  $("#view").innerHTML = tools + body;

  const fi = $("#listFilter");
  if (fi) fi.oninput = () => { listFilter.text = fi.value; const p = fi.selectionStart; drawList(key); const nf=$("#listFilter"); nf.focus(); nf.setSelectionRange(p,p); };
  $$(".tag-pill").forEach(p => p.onclick = () => { listFilter.tag = listFilter.tag===p.dataset.tag ? "" : p.dataset.tag; drawList(key); });
  $$(".entry-card").forEach(c => c.onclick = () => openRead(c.dataset.id));
  const en = $("#btnEmptyNew"); if (en) en.onclick = () => openEditor(key, null);
}
function matchEntry(e,q){
  return (e.title||"").toLowerCase().includes(q) || (e.meta||"").toLowerCase().includes(q) ||
    plainText(e.content).toLowerCase().includes(q) || plainText(e.thoughts).toLowerCase().includes(q) ||
    (e.tags||[]).join(" ").toLowerCase().includes(q) || (e.watch||[]).join(" ").toLowerCase().includes(q);
}
function card(e, s, showSec) {
  const ex = plainText(e.content) || plainText(e.thoughts);
  return `<div class="entry-card" style="--dot:var(${s.color})" data-id="${e.id}">
    <div class="entry-head">
      <span class="entry-date">${prettyDate(e.date)}</span>
      ${showSec ? `<span class="entry-meta-tag">${s.label}</span>` : ""}
      ${e.meta ? `<span class="entry-meta-tag">${esc(e.meta)}</span>` : ""}
    </div>
    <div class="entry-title">${esc(e.title)}</div>
    ${ex ? `<div class="entry-excerpt">${esc(ex.slice(0,160))}</div>` : ""}
    <div class="entry-foot">
      ${(e.watch||[]).map(w=>`<span class="entry-chip watch">◆ ${esc(w)}</span>`).join("")}
      ${(e.tags||[]).map(t=>`<span class="entry-chip">#${esc(t)}</span>`).join("")}
    </div></div>`;
}

/* === 읽기(블로그) 페이지 === */
function renderRead(id) {
  const e = state.entries.find(x=>x.id===id);
  if (!e) { location.hash = "#/dashboard"; return; }
  const s = SECTIONS[e.section];
  $("#topbarNum").textContent = s.num;
  $("#topbarNum").style.setProperty("--dot", `var(${s.color})`);
  $("#topbarTitle").textContent = s.label;
  $("#topbarRight").innerHTML = `<button class="ghost-btn" id="btnBackList">‹ 목록</button>`;
  $("#btnBackList").onclick = () => navigate("#/" + e.section);

  $("#view").innerHTML = `
    <article class="article" style="--dot:var(${s.color})">
      <div class="article-badge">${s.num} · ${s.label}</div>
      <div class="article-date">${prettyDate(e.date)}${e.meta?` · ${esc(e.meta)}`:""}</div>
      <h1 class="article-title">${esc(e.title) || "(제목 없음)"}</h1>
      ${(e.tags&&e.tags.length)?`<div class="article-tags">${e.tags.map(t=>`<span class="entry-chip">#${esc(t)}</span>`).join("")}</div>`:""}
      ${plainText(e.content)?`<div class="article-content">${e.content}</div>`:`<div class="article-empty">내용이 없습니다.</div>`}
      ${(e.watch&&e.watch.length)?`<div class="article-box watch-box">
        <div class="box-label">◆ 주목 종목 · 섹터</div>
        <div class="watch-grid">${e.watch.map(w=>`<button class="watch-chip" data-q="${esc(w)}">${esc(w)}</button>`).join("")}</div></div>`:""}
      ${plainText(e.thoughts)?`<div class="article-box thoughts-box">
        <div class="box-label">✎ 내 생각</div><div class="box-content">${e.thoughts}</div></div>`:""}
      <div class="article-actions">
        <button class="ghost-btn danger" id="btnReadDelete">삭제</button>
        <button class="solid-btn" id="btnEdit">✎ 수정</button>
      </div>
    </article>`;

  $("#btnEdit").onclick = () => openEditor(e.section, e.id);
  $("#btnReadDelete").onclick = () => {
    if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    deleteEntry(e.id);
    navigate("#/" + e.section); toast("삭제되었습니다.");
  };
  $$(".watch-chip").forEach(c => c.onclick = () => openSearchWith(c.dataset.q));
}

/* === 날짜 페이지 === */
function renderDate(ds) {
  $("#topbarNum").textContent = "▦";
  $("#topbarNum").style.setProperty("--dot", "var(--gold)");
  $("#topbarTitle").textContent = prettyDate(ds);
  $("#topbarRight").innerHTML = "";
  const list = state.entries.filter(e=>e.date===ds).sort((a,b)=>(b.updated||0)-(a.updated||0));
  $("#view").innerHTML = list.length
    ? `<div class="cards">${list.map(e=>card(e, SECTIONS[e.section], true)).join("")}</div>`
    : `<div class="empty"><div class="empty-mark">▦</div><p>${prettyDate(ds)}에 작성한 기록이 없습니다.</p></div>`;
  $$(".entry-card").forEach(c => c.onclick = () => openRead(c.dataset.id));
}

/* ---------- 에디터 ---------- */
let working = null, isNew = false, saveTimer = null;
function openEditor(section, id) {
  const s = SECTIONS[section];
  if (id) { working = state.entries.find(e=>e.id===id); isNew = false; }
  else {
    working = { id:uid(), section, date:todayStr(), title:"", meta:"", content:"", thoughts:"", watch:[], tags:[], created:Date.now(), updated:Date.now() };
    isNew = true;
  }
  if (!working.watch) working.watch = [];
  if (!working.tags) working.tags = [];
  $("#editorBadge").textContent = `${s.num} · ${s.label}`;
  $("#editorBadge").style.background = `var(${s.color})`;
  $("#editor").style.setProperty("--dot", `var(${s.color})`);
  $("#fMeta").placeholder = s.meta;
  $("#fDate").value = working.date;
  $("#fMeta").value = working.meta || "";
  $("#fTitle").value = working.title || "";
  $("#fContent").innerHTML = working.content || "";
  $("#fThoughts").innerHTML = working.thoughts || "";
  renderChips();
  syncTitlePreset();
  buildTagSuggest();
  $("#saveState").textContent = isNew ? "" : "저장됨";
  $("#overlay").classList.add("show");
  $("#editor").classList.add("show");
  $("#editor").setAttribute("aria-hidden","false");
  setTimeout(()=>$("#fTitle").focus(), 280);
}
function closeEditor(goRead) {
  commit(true);
  const w = working;
  const empty = w && !w.title && !plainText(w.content) && !plainText(w.thoughts) && !(w.tags&&w.tags.length) && !(w.watch&&w.watch.length);
  if (w && isNew && empty) { state.entries = state.entries.filter(e=>e.id!==w.id); save(); goRead = false; toast("내용이 없어 저장하지 않았습니다."); }
  $("#overlay").classList.remove("show");
  $("#editor").classList.remove("show");
  $("#editor").setAttribute("aria-hidden","true");
  working = null;
  if (goRead && w && !empty) navigate("#/entry/" + w.id);
  else render();
}
function commit(force) {
  if (!working) return;
  working.date = $("#fDate").value || todayStr();
  working.meta = $("#fMeta").value.trim();
  working.title = $("#fTitle").value.trim();
  working.content = sanitize($("#fContent").innerHTML);
  working.thoughts = sanitize($("#fThoughts").innerHTML);
  working.updated = Date.now();
  const hasAny = working.title || plainText(working.content) || plainText(working.thoughts) || working.tags.length || working.watch.length;
  const exists = state.entries.some(e=>e.id===working.id);
  if (hasAny && !exists) { state.entries.push(working); isNew = false; }
  if (exists || hasAny) save();
  if ((exists || hasAny) && syncOn()) scheduleSync();
  $("#saveState").textContent = "저장됨 ✓";
  if (!force) { clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ $("#saveState").textContent="저장됨"; }, 1500); }
}
function scheduleSave() { $("#saveState").textContent = "저장 중…"; clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ commit(false); buildTagSuggest(); syncTitlePreset(); }, 600); }

/* 칩 (태그 + 주목 종목·섹터) */
function renderChips() {
  $("#tagChips").innerHTML   = (working.tags ||[]).map((t,i)=>`<span class="chip">#${esc(t)}<x data-k="tags" data-i="${i}">✕</x></span>`).join("");
  $("#watchChips").innerHTML = (working.watch||[]).map((t,i)=>`<span class="chip chip-watch">◆ ${esc(t)}<x data-k="watch" data-i="${i}">✕</x></span>`).join("");
  $$("#tagChips x, #watchChips x").forEach(x => x.onclick = () => { working[x.dataset.k].splice(+x.dataset.i,1); renderChips(); commit(false); });
}
function attachChipInput(input, kind) {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^[#◆]\s*/,"");
      if (v && !working[kind].includes(v)) { working[kind].push(v); renderChips(); commit(false); }
      e.target.value = "";
    } else if (e.key === "Backspace" && !e.target.value && working[kind].length) {
      working[kind].pop(); renderChips(); commit(false);
    }
  });
}

/* ---------- 리치 텍스트 ---------- */
const TOOLBAR = [
  {cmd:"formatBlock", val:"<h2>", html:'<b>H1</b>', wide:true, t:"제목"},
  {cmd:"formatBlock", val:"<h3>", html:'<b>H2</b>', wide:true, t:"소제목"},
  {sep:true},
  {cmd:"bold", html:'<b>B</b>', t:"굵게"},
  {cmd:"italic", html:'<i>I</i>', t:"기울임"},
  {cmd:"underline", html:'<u>U</u>', t:"밑줄"},
  {cmd:"strikeThrough", html:'<s>S</s>', t:"취소선"},
  {sep:true},
  {cmd:"_size", val:"2", html:'<span style="font-size:11px">A</span>', t:"글씨 작게"},
  {cmd:"_size", val:"3", html:'<span style="font-size:14px">A</span>', t:"글씨 보통"},
  {cmd:"_size", val:"5", html:'<span style="font-size:18px">A</span>', t:"글씨 크게"},
  {sep:true},
  {cmd:"_hilite", val:"#fff3a3", html:'<span class="hl-ico" style="background:#fff3a3"></span>', t:"형광펜 · 노랑"},
  {cmd:"_hilite", val:"#bdeec0", html:'<span class="hl-ico" style="background:#bdeec0"></span>', t:"형광펜 · 초록"},
  {cmd:"_hilite", val:"#ffc9de", html:'<span class="hl-ico" style="background:#ffc9de"></span>', t:"형광펜 · 분홍"},
  {cmd:"_hilite", val:"#bfe3ff", html:'<span class="hl-ico" style="background:#bfe3ff"></span>', t:"형광펜 · 파랑"},
  {cmd:"_hiliteOff", html:'<span class="hl-ico hl-off"></span>', t:"형광펜 지우기"},
  {sep:true},
  {cmd:"insertUnorderedList", html:'•', t:"글머리"},
  {cmd:"insertOrderedList", html:'1.', t:"번호"},
  {cmd:"formatBlock", val:"<blockquote>", html:'❝', t:"인용"},
  {cmd:"_code", html:'&lt;/&gt;', t:"코드"},
  {sep:true},
  {cmd:"_link", html:'🔗', t:"링크"},
  {cmd:"removeFormat", html:'⌫', t:"서식 제거"},
];
function buildToolbar(el) {
  el.innerHTML = TOOLBAR.map(b => b.sep ? '<span class="rt-sep"></span>'
    : `<button class="rt-btn ${b.wide?"wide":""}" data-cmd="${b.cmd}" data-val="${b.val||""}" title="${b.t}">${b.html}</button>`).join("");
}
function initEditors() {
  $$(".rt-toolbar").forEach(tb => {
    buildToolbar(tb);
    const target = $("#" + tb.dataset.target);
    $$(".rt-btn", tb).forEach(btn => { btn.onmousedown = ev => ev.preventDefault(); btn.onclick = () => runCmd(btn.dataset.cmd, btn.dataset.val, target); });
  });
  [$("#fContent"), $("#fThoughts")].forEach(ed => {
    ed.addEventListener("input", scheduleSave);
    ed.addEventListener("paste", onPaste);
  });
  $("#fTitle").addEventListener("input", scheduleSave);
  $("#fMeta").addEventListener("input", scheduleSave);
  $("#fDate").addEventListener("change", scheduleSave);
}
function runCmd(cmd, val, ed) {
  ed.focus();
  if (cmd === "_link") { openLinkModal(ed); return; }
  if (cmd === "_code") { document.execCommand("insertHTML", false, "<code>"+ (getSel()||"코드") +"</code>"); scheduleSave(); return; }
  if (cmd === "_size") { document.execCommand("fontSize", false, val); scheduleSave(); return; }
  if (cmd === "_hilite") { if (!document.execCommand("hiliteColor", false, val)) document.execCommand("backColor", false, val); scheduleSave(); return; }
  if (cmd === "_hiliteOff") { if (!document.execCommand("hiliteColor", false, "transparent")) document.execCommand("backColor", false, "transparent"); scheduleSave(); return; }
  if (cmd === "formatBlock") document.execCommand("formatBlock", false, val);
  else document.execCommand(cmd, false, null);
  scheduleSave();
}
function getSel(){ const s=window.getSelection(); return s? s.toString() : ""; }
function onPaste(ev) {
  const html = ev.clipboardData.getData("text/html");
  const text = ev.clipboardData.getData("text/plain");
  if (html) { ev.preventDefault(); document.execCommand("insertHTML", false, sanitize(html)); scheduleSave(); }
  else if (text) { setTimeout(scheduleSave, 0); }
}

/* 링크 모달 */
let linkTargetEd = null, savedRange = null;
function openLinkModal(ed) {
  linkTargetEd = ed;
  const sel = window.getSelection();
  savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  $("#linkUrl").value = "";
  $("#linkModal").classList.add("show");
  setTimeout(()=>$("#linkUrl").focus(), 50);
}
function applyLink() {
  const url = $("#linkUrl").value.trim();
  $("#linkModal").classList.remove("show");
  if (!url || !linkTargetEd) return;
  linkTargetEd.focus();
  if (savedRange) { const s=window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  const safe = /^https?:\/\//i.test(url) ? url : "https://" + url;
  if (getSel()) document.execCommand("createLink", false, safe);
  else document.execCommand("insertHTML", false, `<a href="${esc(safe)}">${esc(safe)}</a>`);
  scheduleSave();
}

/* ---------- 검색 ---------- */
let searchSel = 0, searchHits = [];
function openSearch() {
  $("#searchModal").classList.add("show");
  $("#searchInput").value = ""; $("#searchResults").innerHTML = "";
  searchHits = []; searchSel = 0;
  setTimeout(()=>$("#searchInput").focus(), 50);
}
function openSearchWith(q) { openSearch(); $("#searchInput").value = q; runSearch(q); }
function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { $("#searchResults").innerHTML=""; searchHits=[]; return; }
  searchHits = state.entries.filter(e => matchEntry(e,q)).sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,40);
  searchSel = 0; drawSearch();
}
function drawSearch() {
  if (!searchHits.length) { $("#searchResults").innerHTML = `<div class="sr-empty">검색 결과가 없습니다.</div>`; return; }
  $("#searchResults").innerHTML = searchHits.map((e,i)=>{
    const s = SECTIONS[e.section];
    return `<div class="sr-row ${i===searchSel?"sel":""}" data-id="${e.id}">
      <span class="sr-dot" style="background:var(${s.color})"></span>
      <span class="sr-sec">${s.label}</span>
      <span class="sr-title">${esc(e.title)||"(제목 없음)"}</span>
      <span class="sr-date">${prettyDate(e.date)}</span></div>`;
  }).join("");
  $$(".sr-row").forEach(r => r.onclick = () => { $("#searchModal").classList.remove("show"); openRead(r.dataset.id); });
}

/* ---------- 삭제 (기기 간 동기화용 묘비 기록) ---------- */
function deleteEntry(id) {
  state.deleted = state.deleted || {};
  state.deleted[id] = Date.now();
  state.entries = state.entries.filter(e => e.id !== id);
  save();
  if (syncOn()) scheduleSync();
}

/* ---------- 깃헙 동기화 엔진 ---------- */
function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64decode(b64){ return decodeURIComponent(escape(atob((b64||"").replace(/\s/g,"")))); }
function ghPath(){ return sync.path.split("/").map(encodeURIComponent).join("/"); }
function httpMsg(s){ return s===401?"토큰이 올바르지 않습니다 (401)" : s===403?"권한 또는 호출 한도 오류 (403)" : s===404?"저장소·경로를 찾을 수 없습니다 (404)" : (s===409||s===422)?"동기화 충돌 — 다시 시도하세요" : "오류 "+s; }

async function ghGet() {
  const url = `https://api.github.com/repos/${sync.owner}/${sync.repo}/contents/${ghPath()}?ref=${encodeURIComponent(sync.branch)}`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${sync.token}`, Accept:"application/vnd.github+json" } });
  if (res.status === 404) return { data:null, sha:null };
  if (!res.ok) throw new Error(httpMsg(res.status));
  const j = await res.json();
  let data = null;
  try { data = JSON.parse(b64decode(j.content)); } catch(e) { data = null; }
  return { data, sha:j.sha };
}
async function ghPut(payload, sha) {
  const url = `https://api.github.com/repos/${sync.owner}/${sync.repo}/contents/${ghPath()}`;
  const body = { message:`research-desk sync ${new Date().toISOString()}`, content:b64encode(JSON.stringify(payload, null, 2)), branch:sync.branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method:"PUT", headers:{ Authorization:`Bearer ${sync.token}`, Accept:"application/vnd.github+json", "Content-Type":"application/json" }, body:JSON.stringify(body) });
  if (!res.ok) throw new Error(httpMsg(res.status));
  const j = await res.json();
  return j.content.sha;
}

/* 원격·로컬 병합 (id별 최신 우선, 삭제 묘비 반영) */
function mergeStates(remote, local) {
  const del = {};
  [ (remote&&remote.deleted)||{}, local.deleted||{} ].forEach(src =>
    Object.keys(src).forEach(id => { del[id] = Math.max(del[id]||0, src[id]); }));
  const byId = new Map();
  [].concat((remote&&remote.entries)||[], local.entries||[]).forEach(e => {
    if (!e || !e.id) return;
    const prev = byId.get(e.id);
    if (!prev || (e.updated||0) > (prev.updated||0)) byId.set(e.id, e);
  });
  const entries = [...byId.values()].filter(e => !(del[e.id] && del[e.id] >= (e.updated||0)));
  const cutoff = Date.now() - 90*864e5;            // 90일 지난 묘비 정리
  Object.keys(del).forEach(id => { if (del[id] < cutoff) delete del[id]; });
  // 관심종목 + 총자산: 더 최근에 수정된 쪽 채택 (last-write-wins)
  const rTU = (remote&&remote.tickersUpdated)||0, lTU = local.tickersUpdated||0;
  const newer = (rTU > lTU) ? (remote||{}) : local;
  const tickers = (rTU > lTU) ? ((remote&&remote.tickers)||[]) : (local.tickers||[]);
  const totalAssets = newer.totalAssets || 0;
  const tickersUpdated = Math.max(rTU, lTU);
  return { entries, deleted: del, tickers, tickersUpdated, totalAssets };
}

let syncing = false, syncQueued = false, syncTimer = null;
function hhmm(){ const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function setSyncStatus(kind, text) {
  const el = $("#syncStatus"); if (!el) return;
  el.className = "sync-status " + (kind||"");
  el.innerHTML = syncOn() ? `<span class="sync-dot"></span>${text}` : "";
  const fs = $("#syncFormState"); if (fs) { fs.className = "sync-state " + (kind||""); fs.textContent = text; }
}
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(()=>syncNow(false), 2000); }

async function syncNow(showToast) {
  if (!syncOn()) return;
  if (syncing) { syncQueued = true; return; }
  syncing = true; setSyncStatus("syncing", "동기화 중…");
  try {
    const { data:remote, sha } = await ghGet();
    const merged = mergeStates(remote, state);
    const changed = JSON.stringify(state.entries) !== JSON.stringify(merged.entries)
                 || JSON.stringify(state.tickers||[]) !== JSON.stringify(merged.tickers||[])
                 || (state.totalAssets||0) !== (merged.totalAssets||0);
    state.entries = merged.entries; state.deleted = merged.deleted;
    state.tickers = merged.tickers; state.tickersUpdated = merged.tickersUpdated; state.totalAssets = merged.totalAssets; save();
    const payload = { version:1, exportedAt:new Date().toISOString(), entries:state.entries, deleted:state.deleted, tickers:state.tickers, tickersUpdated:state.tickersUpdated, totalAssets:state.totalAssets };
    sync.sha = await ghPut(payload, sha); sync.lastAt = Date.now(); saveSync();
    setSyncStatus("ok", "동기화됨 · " + hhmm());
    if (changed && !$("#editor").classList.contains("show")) render();
    if (showToast) toast("동기화 완료");
  } catch (e) {
    setSyncStatus("err", e.message || "동기화 실패");
    if (showToast) toast("동기화 실패: " + (e.message||""));
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; setTimeout(()=>syncNow(false), 300); }
  }
}

/* ---------- 백업 ---------- */
function download(name, content, type) {
  const blob = new Blob([content], {type});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function exportJson() { download(`research-desk-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json"); toast("JSON 백업을 내려받았습니다."); }
function exportMd() {
  let md = `# 리서치 데스크 백업\n\n_내보낸 날짜: ${todayStr()}_\n`;
  SECTION_KEYS.forEach(k => {
    const list = state.entries.filter(e=>e.section===k).sort((a,b)=>b.date.localeCompare(a.date));
    if (!list.length) return;
    md += `\n\n---\n\n# ${SECTIONS[k].label}\n`;
    list.forEach(e => {
      md += `\n## ${e.title||"(제목 없음)"}\n`;
      md += `\`${e.date}\`${e.meta?` · ${e.meta}`:""}${(e.tags&&e.tags.length)?` · ${e.tags.map(t=>"#"+t).join(" ")}`:""}\n\n`;
      if (plainText(e.content)) md += htmlToMd(e.content) + "\n";
      if (e.watch&&e.watch.length) md += `\n**◆ 주목 종목·섹터:** ${e.watch.join(", ")}\n`;
      if (plainText(e.thoughts)) md += `\n> **✎ 내 생각**\n>\n` + htmlToMd(e.thoughts).split("\n").map(l=>"> "+l).join("\n") + "\n";
    });
  });
  download(`research-desk-${todayStr()}.md`, md, "text/markdown");
  toast("마크다운을 내려받았습니다.");
}
function htmlToMd(html) {
  const div = document.createElement("div"); div.innerHTML = html || "";
  function walk(node) {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g," "); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName.toLowerCase(), inner = walk(n);
      switch (t) {
        case "h1": out += `\n# ${inner.trim()}\n`; break;
        case "h2": out += `\n## ${inner.trim()}\n`; break;
        case "h3": case "h4": out += `\n### ${inner.trim()}\n`; break;
        case "strong": case "b": out += `**${inner.trim()}**`; break;
        case "em": case "i": out += `*${inner.trim()}*`; break;
        case "code": out += `\`${inner.trim()}\``; break;
        case "blockquote": out += `\n> ${inner.trim()}\n`; break;
        case "li": out += `- ${inner.trim()}\n`; break;
        case "ul": case "ol": out += `\n${inner}`; break;
        case "a": out += `[${inner.trim()}](${n.getAttribute("href")||""})`; break;
        case "br": out += `\n`; break;
        case "p": case "div": out += `\n${inner.trim()}\n`; break;
        case "img": out += `![](${n.getAttribute("src")||""})`; break;
        default: out += inner;
      }
    });
    return out;
  }
  return walk(div).replace(/\n{3,}/g,"\n\n").trim();
}
function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const incoming = Array.isArray(data) ? data : (data.entries||[]);
      if (!incoming.length) { toast("가져올 기록이 없습니다."); return; }
      const map = new Map(state.entries.map(e=>[e.id,e]));
      incoming.forEach(e => { if (e && e.id && e.section) map.set(e.id, e); });
      state.entries = [...map.values()];
      save(); $("#backupModal").classList.remove("show"); render();
      toast(`${incoming.length}개 기록을 가져왔습니다.`);
    } catch (e) { toast("올바른 JSON 백업 파일이 아닙니다."); }
  };
  r.readAsText(file);
}
function storageInfo() {
  const bytes = new Blob([localStorage.getItem(STORE_KEY)||""]).size;
  return `기록 ${state.entries.length}건 · 약 ${(bytes/1024).toFixed(1)} KB 사용 중 (브라우저 한도 약 5,000 KB)`;
}

/* ---------- 테마 ---------- */
function applyTheme() {
  const t = state.settings.theme || "light";
  document.documentElement.setAttribute("data-theme", t);
  $("#themeIco").textContent = t==="dark" ? "☀" : "◐";
  $("#themeLabel").textContent = t==="dark" ? "라이트 모드" : "다크 모드";
}
function toggleTheme() { state.settings.theme = (state.settings.theme==="dark") ? "light" : "dark"; save(); applyTheme(); }

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2400); }

/* =========================================================
   시장 데이터 · 포트폴리오 · 헤드라인 · 해시태그 추천 (추가 모듈)
   - 시세: Yahoo Finance 무료 엔드포인트 (키 불필요), CORS는 무료 프록시 경유
   - 헤드라인: Google News RSS (site:reuters / site:bloomberg) 프록시 경유
   ========================================================= */

/* 사이드바 열고/닫기 (모바일) */
function openSidebar(){ $("#sidebar").classList.add("open"); const b=$("#sidebarBackdrop"); if(b) b.classList.add("show"); }
function closeSidebar(){ $("#sidebar").classList.remove("open"); const b=$("#sidebarBackdrop"); if(b) b.classList.remove("show"); }

/* ---------- 무료 CORS 프록시 (앞에서부터 시도, 하나 죽어도 다음으로) ---------- */
const MKT_PROXIES = [
  u => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
  u => "https://thingproxy.freeboard.io/fetch/" + u,
  u => u,   // 직접 (브라우저 확장 등으로 CORS 허용된 경우)
];
async function proxyFetch(url, asJson){
  let lastErr;
  for (const build of MKT_PROXIES){
    try{
      const res = await fetch(build(url), { cache:"no-store" });
      if (!res.ok) { lastErr = new Error("HTTP "+res.status); continue; }
      return asJson ? await res.json() : await res.text();
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error("network");
}

/* ---------- Yahoo Finance 시세 ---------- */
const MKT = { quotes:{}, ttl:60000, newsCache:null, newsTtl:180000, newsAt:0, peopleCache:null, peopleAt:0 };
async function yahooQuote(symbol, range="1d", interval="5m"){
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const j = await proxyFetch(base, true);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error("no data");
  const m = r.meta || {};
  let closes = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter(x => x != null);
  const price = (m.regularMarketPrice != null) ? m.regularMarketPrice : closes[closes.length-1];
  const prev  = (m.chartPreviousClose != null) ? m.chartPreviousClose : (m.previousClose != null ? m.previousClose : closes[0]);
  if (!closes.length && price != null) closes = [prev||price, price];
  const diff = (price!=null && prev!=null) ? price - prev : 0;
  return {
    symbol, name: m.shortName || m.symbol || symbol,
    price, prev, diff, pct: prev ? diff/prev*100 : 0,
    cur: m.currency || "", spark: closes.slice(-40), t: Date.now(),
  };
}
async function getQuote(symbol){
  const c = MKT.quotes[symbol];
  if (c && c.t && (Date.now()-c.t) < MKT.ttl && c.price != null) return c;
  const q = await yahooQuote(symbol);
  MKT.quotes[symbol] = q;
  return q;
}

/* ---------- 숫자 포맷 · 스파크라인 ---------- */
function fmtPrice(v){ if (v==null||isNaN(v)) return "—"; return Number(v).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtPct(v){ if (v==null||isNaN(v)) return "—"; return (v>=0?"+":"") + v.toFixed(2) + "%"; }
function fmtDiff(v){ if (v==null||isNaN(v)) return ""; return (v>=0?"▲ ":"▼ ") + Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function sparkSVG(data, up, w=78, h=26){
  if (!data || data.length < 2) return "";
  const min=Math.min(...data), max=Math.max(...data), rng=(max-min)||1;
  const X = i => (i/(data.length-1)*w);
  const Y = v => (h-2) - (v-min)/rng*(h-4) + 2;
  const line = data.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const col = up ? "var(--up)" : "var(--down)";
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = "g"+Math.random().toString(36).slice(2,7);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
const upClass = d => d>=0 ? "up" : "down";

/* ---------- 한국어 번역 (Google Translate 무료 엔드포인트, 키 불필요) ----------
   - 번역 결과는 변하지 않으므로 localStorage에 영구 캐시 (동기화 state와는 분리)
   - 실패 시 원문(영어) 그대로 노출 */
const TR = { cache:{} };
try { TR.cache = JSON.parse(localStorage.getItem("researchDesk.trans") || "{}") || {}; } catch(e){ TR.cache = {}; }
let _trSaveT;
function trSave(){ clearTimeout(_trSaveT); _trSaveT = setTimeout(()=>{ try{ localStorage.setItem("researchDesk.trans", JSON.stringify(TR.cache)); }catch(e){} }, 700); }
async function translateKo(text){
  const key = (text||"").trim();
  if (!key) return "";
  if (/[가-힣]/.test(key)) return key;            // 이미 한국어면 그대로
  if (TR.cache[key]) return TR.cache[key];
  try{
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=" + encodeURIComponent(key);
    const j = await proxyFetch(url, true);
    const out = (j && Array.isArray(j[0])) ? j[0].map(s => s[0]).join("") : "";
    if (out){ TR.cache[key] = out; trSave(); return out; }
  }catch(e){}
  return key;   // 실패 시 원문
}

/* ---------- 섹터 자동 분류 ---------- */
const TICKER_SECTOR_KO = {
  // 반도체
  NVDA:"반도체", AMD:"반도체", AVGO:"반도체", MRVL:"반도체", TSM:"반도체", ASML:"반도체",
  MU:"반도체", INTC:"반도체", QCOM:"반도체", TXN:"반도체", ARM:"반도체", SMCI:"반도체",
  LRCX:"반도체", AMAT:"반도체", KLAC:"반도체", ON:"반도체", ADI:"반도체", NXPI:"반도체",
  COHR:"반도체", ALAB:"반도체", MPWR:"반도체",
  // 빅테크
  AAPL:"빅테크", MSFT:"빅테크", GOOGL:"빅테크", GOOG:"빅테크", AMZN:"빅테크", META:"빅테크",
  // AI·소프트웨어
  PLTR:"AI·소프트웨어", CRM:"AI·소프트웨어", ORCL:"AI·소프트웨어", ADBE:"AI·소프트웨어",
  NOW:"AI·소프트웨어", SNOW:"AI·소프트웨어", CRWD:"AI·소프트웨어", PANW:"AI·소프트웨어",
  NET:"AI·소프트웨어", DDOG:"AI·소프트웨어", MDB:"AI·소프트웨어", APP:"AI·소프트웨어",
  // 커뮤니케이션·미디어
  NFLX:"커뮤니케이션·미디어", DIS:"커뮤니케이션·미디어", SPOT:"커뮤니케이션·미디어",
  // 자동차·모빌리티
  TSLA:"자동차·모빌리티", RIVN:"자동차·모빌리티", NIO:"자동차·모빌리티", F:"자동차·모빌리티", GM:"자동차·모빌리티",
  // 금융·핀테크
  JPM:"금융", BAC:"금융", GS:"금융", MS:"금융", "BRK-B":"금융", "BRK.B":"금융",
  V:"금융", MA:"금융", PYPL:"핀테크·크립토", COIN:"핀테크·크립토", MSTR:"핀테크·크립토", HOOD:"핀테크·크립토",
  // 헬스케어·바이오
  LLY:"헬스케어·바이오", NVO:"헬스케어·바이오", UNH:"헬스케어·바이오", PFE:"헬스케어·바이오",
  MRNA:"헬스케어·바이오", JNJ:"헬스케어·바이오", ABBV:"헬스케어·바이오",
  // 에너지·원자재
  XOM:"에너지", CVX:"에너지", COP:"에너지", OXY:"에너지",
  // ETF
  SOXL:"반도체 ETF", SOXX:"반도체 ETF", SMH:"반도체 ETF", USD:"반도체 ETF",
  QQQ:"지수·ETF", TQQQ:"지수·ETF", SPY:"지수·ETF", VOO:"지수·ETF", DIA:"지수·ETF",
  IWM:"지수·ETF", VTI:"지수·ETF", SCHD:"배당 ETF", JEPI:"배당 ETF", JEPQ:"배당 ETF",
};
const ENG_SECTOR_KO = {
  "Technology":"빅테크·기술", "Communication Services":"커뮤니케이션·미디어",
  "Consumer Cyclical":"소비재(경기)", "Consumer Defensive":"소비재(필수)",
  "Financial Services":"금융", "Financial":"금융", "Healthcare":"헬스케어·바이오",
  "Energy":"에너지", "Industrials":"산업재", "Basic Materials":"원자재",
  "Real Estate":"부동산", "Utilities":"유틸리티",
};
// 즉시(동기) 추정: 사전 + 형식 기반
function guessSectorSync(sym, name){
  const u = (sym||"").toUpperCase();
  if (TICKER_SECTOR_KO[u]) return TICKER_SECTOR_KO[u];
  if (u.startsWith("^")) return "지수·ETF";
  if (/\.(KS|KQ)$/i.test(u)) return "한국주식";
  return "";   // 미정 → 비동기 보강
}
// 비동기 보강: Yahoo search 엔드포인트로 섹터 조회 후 한국어 매핑
async function resolveSectorKo(sym){
  try{
    const url = "https://query2.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(sym) + "&quotesCount=1&newsCount=0";
    const j = await proxyFetch(url, true);
    const q = j && j.quotes && j.quotes[0];
    if (q){
      const eng = q.sector || q.sectorDisp || "";
      if (eng && ENG_SECTOR_KO[eng]) return ENG_SECTOR_KO[eng];
      if (eng) return eng;
      if (q.quoteType === "ETF") return "지수·ETF";
    }
  }catch(e){}
  return "";
}
// 등록 종목 중 섹터 미정인 것들을 비동기로 채운 뒤 다시 그림
async function fillMissingSectors(){
  const pend = (state.tickers||[]).filter(t => !t.sector || t.sector === "미분류");
  if (!pend.length) return;
  let changed = false;
  await Promise.allSettled(pend.map(async t => {
    const ko = await resolveSectorKo(t.ticker);
    if (ko){ t.sector = ko; changed = true; }
    else if (!t.sector) { t.sector = "기타"; changed = true; }
  }));
  if (changed){ tickersTouched(); save(); if (typeof syncOn==="function" && syncOn()) scheduleSync(); renderPortfolio(); if ($("#tickerModal").classList.contains("show")) renderTickerRows(); }
}
const SECTOR_OPTIONS = ["반도체","반도체 ETF","빅테크·기술","AI·소프트웨어","커뮤니케이션·미디어","자동차·모빌리티","금융","핀테크·크립토","헬스케어·바이오","에너지","산업재","원자재","소비재(경기)","소비재(필수)","부동산","유틸리티","지수·ETF","배당 ETF","한국주식","기타"];

/* ---------- 메인: 지수 스트립 (다우·나스닥·러셀·VIX + 환율) ---------- */
const INDICES = [
  { sym:"^DJI",  label:"DOW" },
  { sym:"^IXIC", label:"NASDAQ" },
  { sym:"^RUT",  label:"RUSSELL 2K" },
  { sym:"^VIX",  label:"VIX" },
  { sym:"KRW=X", label:"USD/KRW", fx:true },
  { sym:"JPY=X", label:"USD/JPY", fx:true },
];
function mktStripSkeleton(){
  return INDICES.map(ix => `<div class="mkt-cell ${ix.fx?"fx":""}" data-sym="${ix.sym}">
    <div class="mkt-cell-top"><span class="mkt-label">${ix.label}</span><span class="mkt-spark"></span></div>
    <div class="mkt-price">로딩…</div>
    <div class="mkt-chg">—</div></div>`).join("");
}
async function loadIndexStrip(){
  const strip = $("#mktStrip"); if (!strip) return;
  await Promise.allSettled(INDICES.map(async ix => {
    try{
      const q = await getQuote(ix.sym);
      const cell = strip.querySelector(`.mkt-cell[data-sym="${ix.sym}"]`); if (!cell) return;
      const up = q.diff >= 0;
      cell.classList.remove("up","down"); cell.classList.add(up?"up":"down");
      cell.querySelector(".mkt-spark").innerHTML = sparkSVG(q.spark, up, 70, 22);
      cell.querySelector(".mkt-price").textContent = fmtPrice(q.price);
      cell.querySelector(".mkt-chg").innerHTML = `<span class="chg-pct">${fmtPct(q.pct)}</span><span class="chg-diff">${fmtDiff(q.diff)}</span>`;
    }catch(e){
      const cell = strip.querySelector(`.mkt-cell[data-sym="${ix.sym}"]`); if (!cell) return;
      cell.querySelector(".mkt-price").textContent = "불러오기 실패";
      cell.querySelector(".mkt-chg").textContent = "프록시 차단 가능";
    }
  }));
}

/* ---------- 비중 = 보유금액 / 기준자산 ----------
   기준자산: 총자산 입력값이 있으면 그 값, 없으면 보유금액 합계 */
function pfAmountSum(){ return (state.tickers||[]).reduce((a,t)=> a + (parseFloat(t.amount)||0), 0); }
function pfBase(){ const ta = parseFloat(state.totalAssets)||0; return ta > 0 ? ta : pfAmountSum(); }
function pfWeight(t){ const base = pfBase(); const amt = parseFloat(t.amount)||0; return base > 0 ? amt/base*100 : 0; }
function fmtMoney(v){ if(v==null||isNaN(v)||!v) return "—"; return Number(v).toLocaleString("en-US"); }

/* ---------- 메인: 관심종목 · 포트폴리오 (섹터별 + 비중 도넛 + 매도검토) ---------- */
function pfBySector(){
  const groups = {};
  (state.tickers||[]).forEach(t => { const s = t.sector || "미분류"; (groups[s] = groups[s] || []).push(t); });
  return groups;
}
const DONUT_COLORS = ["#3b6fb0","#c0563f","#3f8f63","#b08321","#7a5aa6","#2f8a8a","#a8772f","#5b8def","#d08b3f","#6fae8b"];
function donutSVG(parts){ // parts: [{label, value, color}]
  const total = parts.reduce((a,p)=>a+p.value,0);
  if (!total) return "";
  const R=52, C=2*Math.PI*R; let off=0;
  const rings = parts.map(p => {
    const frac = p.value/total, len = frac*C;
    const seg = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.color}" stroke-width="20"
      stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(-90 70 70)"><title>${esc(p.label)} ${(frac*100).toFixed(1)}%</title></circle>`;
    off += len; return seg;
  }).join("");
  return `<svg class="donut" viewBox="0 0 140 140">${rings}
    <text x="70" y="66" text-anchor="middle" class="donut-c1">${parts.length}</text>
    <text x="70" y="84" text-anchor="middle" class="donut-c2">섹터</text></svg>`;
}
function renderPortfolio(){
  const panel = $("#pfPanel"); if (!panel) return;
  const tickers = state.tickers || [];
  if (!tickers.length){
    panel.innerHTML = `<div class="pf-empty">등록된 종목이 없어요. <button class="link-btn" id="pfEmptyAdd">＋ 종목 등록</button>해서 메인에서 시세·섹터·비중을 관리하세요.</div>`;
    const b=$("#pfEmptyAdd"); if(b) b.onclick=openTickerModal;
    return;
  }
  const groups = pfBySector();
  const sectorNames = Object.keys(groups).sort();
  // 도넛: 섹터별 비중 합 (보유금액 기준 자동계산)
  const donutParts = sectorNames.map((s,i) => ({
    label:s, color:DONUT_COLORS[i%DONUT_COLORS.length],
    value: groups[s].reduce((a,t)=>a+(parseFloat(t.amount)||0),0)
  })).filter(p=>p.value>0);
  const totalW = donutParts.reduce((a,p)=>a+p.value,0);
  const base = pfBase(), amtSum = pfAmountSum();
  const cash = (parseFloat(state.totalAssets)||0) > 0 ? Math.max(0, base - amtSum) : 0;
  const investedPct = base>0 ? amtSum/base*100 : 0;

  const groupHtml = sectorNames.map((s,si) => {
    const color = DONUT_COLORS[si%DONUT_COLORS.length];
    const rows = groups[s].map(t => { const w = pfWeight(t); const amt = parseFloat(t.amount)||0; const saSym = encodeURIComponent(t.ticker.replace(/\.(KS|KQ)$/i,"").replace(/^\^/,"")); return `
      <div class="pf-row ${t.sell?"sell":""}" data-sym="${esc(t.ticker)}">
        <div class="pf-id">
          <span class="pf-tk">${esc(t.ticker)}</span>
          ${t.name?`<span class="pf-nm">${esc(t.name)}</span>`:""}
          ${t.sell?`<span class="pf-sellbadge">매도검토</span>`:""}
          <a class="pf-sa" href="https://seekingalpha.com/symbol/${saSym}" target="_blank" rel="noopener" title="Seeking Alpha에서 보기">SA↗</a>
        </div>
        <div class="pf-spark"></div>
        <div class="pf-quote"><span class="pf-price">…</span><span class="pf-chg">—</span></div>
        ${w>0?`<div class="pf-w">${w.toFixed(1)}%${amt?`<span class="pf-amt">${fmtMoney(amt)}</span>`:""}</div>`:`<div class="pf-w faint">—</div>`}
      </div>`; }).join("");
    return `<div class="pf-sector">
      <div class="pf-sector-head"><span class="pf-sector-dot" style="background:${color}"></span>${esc(s)}<span class="pf-sector-n">${groups[s].length}</span></div>
      ${rows}</div>`;
  }).join("");

  const legend = donutParts.length ? `<div class="donut-wrap">${donutSVG(donutParts)}
    <div class="donut-legend">${donutParts.map(p=>`<div class="dl-row"><span class="dl-dot" style="background:${p.color}"></span><span class="dl-label">${esc(p.label)}</span><span class="dl-val">${totalW?(p.value/totalW*100).toFixed(0):0}%</span></div>`).join("")}
      ${cash>0?`<div class="dl-row dl-cash"><span class="dl-dot" style="background:#bfc4cc"></span><span class="dl-label">현금</span><span class="dl-val">${(100-investedPct).toFixed(0)}%</span></div>`:""}</div></div>` : "";

  const summary = base>0 ? `<div class="pf-summary">
      <span>기준자산 <b>${fmtMoney(base)}</b></span>
      <span>투자 <b>${fmtMoney(amtSum)}</b> (${investedPct.toFixed(0)}%)</span>
      ${cash>0?`<span>현금 <b>${fmtMoney(cash)}</b></span>`:""}
    </div>` : "";

  panel.innerHTML = `${summary}<div class="pf-body">${legend}<div class="pf-groups">${groupHtml}</div></div>`;
  loadPortfolioQuotes();
}
async function loadPortfolioQuotes(){
  const panel = $("#pfPanel"); if (!panel) return;
  await Promise.allSettled((state.tickers||[]).map(async t => {
    const row = panel.querySelector(`.pf-row[data-sym="${CSS.escape(t.ticker)}"]`); if (!row) return;
    try{
      const q = await getQuote(t.ticker);
      const up = q.diff >= 0;
      row.querySelector(".pf-spark").innerHTML = sparkSVG(q.spark, up, 70, 24);
      row.querySelector(".pf-price").textContent = fmtPrice(q.price);
      const chg = row.querySelector(".pf-chg");
      chg.textContent = fmtPct(q.pct); chg.className = "pf-chg " + upClass(q.diff);
    }catch(e){
      const p = row.querySelector(".pf-price"); if (p) p.textContent = "—";
      const chg = row.querySelector(".pf-chg"); if (chg) chg.textContent = "실패";
    }
  }));
}

/* ---------- 종목 관리 모달 ---------- */
function tickersTouched(){ state.tickersUpdated = Date.now(); }
function openTickerModal(){
  const ta = $("#tkTotalAssets"); if (ta) ta.value = (parseFloat(state.totalAssets)||"") || "";
  renderTickerRows();
  $("#tickerModal").classList.add("show");
  fillMissingSectors();   // 섹터 미정 종목 비동기 보강
}
function setTotalAssets(v){
  state.totalAssets = parseFloat(v)||0;
  tickersTouched(); save(); if(syncOn())scheduleSync();
  renderTickerRows(); refreshDashboardMarkets();
}
function renderTickerRows(){
  const box = $("#tickerRows"); if (!box) return;
  const tickers = state.tickers || [];
  const opts = sec => SECTOR_OPTIONS.map(s=>`<option value="${esc(s)}" ${s===sec?"selected":""}>${esc(s)}</option>`).join("");
  box.innerHTML = tickers.length ? tickers.map((t,i)=>{ const w = pfWeight(t); return `
    <div class="tk-row" data-i="${i}">
      <span class="tk-c tk-c-sym">${esc(t.ticker)}</span>
      <span class="tk-c tk-c-name">${esc(t.name||"")}</span>
      <select class="tk-c tk-c-sector tk-secsel" data-sec="${i}" title="섹터 (자동분류 · 수정 가능)">${opts(t.sector||"기타")}</select>
      <span class="tk-c tk-c-w">${w>0?w.toFixed(1)+"%":"—"}</span>
      <input type="number" class="tk-c tk-c-amt tk-amt" data-amt="${i}" value="${parseFloat(t.amount)||""}" placeholder="보유금액" min="0" step="any" />
      <button class="tk-c tk-toggle ${t.sell?"on":""}" data-sell="${i}" title="매도검토 토글">${t.sell?"매도검토":"보유"}</button>
      <button class="tk-del" data-del="${i}" title="삭제">✕</button>
    </div>`; }).join("") : `<div class="tk-empty">아직 등록된 종목이 없습니다. 아래에서 티커만 넣으면 섹터는 자동 분류됩니다.</div>`;
  $$(".tk-del", box).forEach(b=>b.onclick=()=>{ state.tickers.splice(+b.dataset.del,1); tickersTouched(); save(); if(syncOn())scheduleSync(); renderTickerRows(); refreshDashboardMarkets(); });
  $$(".tk-toggle", box).forEach(b=>b.onclick=()=>{ const t=state.tickers[+b.dataset.sell]; t.sell=!t.sell; tickersTouched(); save(); if(syncOn())scheduleSync(); renderTickerRows(); refreshDashboardMarkets(); });
  $$(".tk-secsel", box).forEach(s=>s.onchange=()=>{ state.tickers[+s.dataset.sec].sector=s.value; tickersTouched(); save(); if(syncOn())scheduleSync(); renderTickerRows(); refreshDashboardMarkets(); });
  $$(".tk-amt", box).forEach(inp=>inp.onchange=()=>{ state.tickers[+inp.dataset.amt].amount=parseFloat(inp.value)||0; tickersTouched(); save(); if(syncOn())scheduleSync(); renderTickerRows(); refreshDashboardMarkets(); });
}
function addTicker(){
  const sym = $("#tkSym").value.trim().toUpperCase();
  if (!sym){ toast("티커를 입력하세요."); return; }
  if ((state.tickers||[]).some(t=>t.ticker.toUpperCase()===sym)){ toast("이미 등록된 종목입니다."); return; }
  state.tickers = state.tickers || [];
  const t = {
    id: uid(), ticker: sym,
    name: $("#tkName").value.trim(),
    sector: guessSectorSync(sym, $("#tkName").value.trim()) || "미분류",
    amount: parseFloat($("#tkAmount").value) || 0,
    sell: $("#tkSell").checked,
  };
  state.tickers.push(t);
  tickersTouched(); save(); if(syncOn())scheduleSync();
  $("#tkSym").value=""; $("#tkName").value=""; $("#tkAmount").value=""; $("#tkSell").checked=false;
  renderTickerRows(); refreshDashboardMarkets();
  if (t.sector === "미분류") resolveSectorKo(sym).then(ko=>{ if(ko){ t.sector=ko; } else { t.sector="기타"; } tickersTouched(); save(); if(syncOn())scheduleSync(); renderTickerRows(); refreshDashboardMarkets(); });
  $("#tkSym").focus();
}

/* ---------- 메인: 매일경제 · The Economist 헤드라인 ---------- */
const NEWS_FEEDS = [
  { id:"mk", name:"매일경제", color:"#d6242b", lang:"ko",
    url:"https://www.mk.co.kr/rss/40300001/" },
  { id:"economist", name:"The Economist", color:"#e3120b", lang:"en",
    url:"https://news.google.com/rss/search?q=site:economist.com%20when:7d&hl=en-US&gl=US&ceid=US:en" },
];
function parseRSS(text){
  const xml = new DOMParser().parseFromString(text, "text/xml");
  return [...xml.querySelectorAll("item")].map(it=>({
    title:(it.querySelector("title")?.textContent||"").trim(),
    link:(it.querySelector("link")?.textContent||"").trim(),
    date:it.querySelector("pubDate")?.textContent||"",
  })).filter(x=>x.title && x.link);
}
function cleanTitle(t, src){ return t.replace(new RegExp("\\s*-\\s*"+src+"\\s*$","i"),"").trim(); }
function relTime(d){
  const t = new Date(d).getTime(); if (isNaN(t)) return "";
  const min = Math.round((Date.now()-t)/60000);
  if (min < 60) return min+"분 전";
  const hr = Math.round(min/60); if (hr < 24) return hr+"시간 전";
  return Math.round(hr/24)+"일 전";
}
async function loadHeadlines(){
  const panel = $("#newsList"); if (!panel) return;
  if (MKT.newsCache && (Date.now()-MKT.newsAt) < MKT.newsTtl){ drawHeadlines(MKT.newsCache); return; }
  const results = await Promise.allSettled(NEWS_FEEDS.map(async f => {
    const text = await proxyFetch(f.url, false);
    const items = parseRSS(text).slice(0,6).map(it=>({ ...it, title: cleanTitle(it.title, f.name) }));
    if (f.lang === "en") await Promise.allSettled(items.map(async it => { it.ko = await translateKo(it.title); }));
    return { feed:f, items };
  }));
  const data = results.map((r,i)=> r.status==="fulfilled" ? r.value : { feed:NEWS_FEEDS[i], items:[], err:true });
  MKT.newsCache = data; MKT.newsAt = Date.now();
  drawHeadlines(data);
}
function drawHeadlines(data){
  const panel = $("#newsList"); if (!panel) return;
  panel.innerHTML = data.map(d => {
    const isEn = d.feed.lang === "en";
    return `
    <div class="news-col">
      <div class="news-src" style="--src:${d.feed.color}"><span class="news-src-dot"></span>${d.feed.name}${isEn?` <span class="news-src-tag">번역</span>`:""}</div>
      ${d.items.length ? d.items.map(it=>`
        <a class="news-item" href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.title)}">
          <span class="news-title">${esc(it.ko||it.title)}</span>
          ${isEn?`<span class="news-en">${esc(it.title)}</span>`:""}
          <span class="news-time">${relTime(it.date)}</span>
        </a>`).join("")
      : `<div class="news-fail">${d.err?"불러오기 실패 (프록시 차단 가능 — 새로고침 ↻)":"표시할 기사가 없습니다."}</div>`}
    </div>`;
  }).join("");
}

/* ---------- 메인: 인물·인사이트 트래커 (야데니 · 트럼프) ----------
   ⚠️ 트위터/X는 무료 API 종료 + 스크래핑 차단으로 직접 본문 수집 불가 → X 실시간 검색 링크로 연결
   ⓐ 관련 뉴스(구글뉴스 RSS, 한국어 번역) ⓑ Reddit 공개 검색(JSON) ⓒ X 실시간 검색 링크
   강세/약세 배지 = 최근 뉴스·레딧 제목의 강세/약세 키워드 자동 집계(추정) */
const PEOPLE = [
  { id:"yardeni", name:"에드 야데니", role:"Yardeni Research", color:"#2f8a8a",
    base:"장기 강세론", q:"\"Ed Yardeni\" market when:7d", x:"yardeni" },
  { id:"trump", name:"트럼프", role:"관세·경제 발언", color:"#c0563f",
    base:"", q:"Trump tariffs OR Trump economy OR Trump stock market when:3d", x:"realDonaldTrump" },
];
const BULL_WORDS = ["rally","surge","gain","record high","bullish","optimis","upbeat","jump","soar","boom","rebound","beat","strong","upgrade","outperform","melt-up","상승","강세","사상 최고","사상최고","낙관","반등","호조","급등","매수"];
const BEAR_WORDS = ["fall","drop","plunge","crash","bearish","recession","fear","sell-off","selloff","slump","tumble","downgrade","warn","weak","risk","correction","slowdown","downturn","하락","약세","폭락","경기 침체","경기침체","우려","급락","위험","조정","둔화"];
function tone(titles){
  const txt = titles.join(" ").toLowerCase();
  let b=0, r=0;
  BULL_WORDS.forEach(w=>{ if(txt.includes(w.toLowerCase())) b++; });
  BEAR_WORDS.forEach(w=>{ if(txt.includes(w.toLowerCase())) r++; });
  if (b===0 && r===0) return { k:"neutral", t:"중립" };
  if (b>r) return { k:"bull", t:"강세" };
  if (r>b) return { k:"bear", t:"약세" };
  return { k:"neutral", t:"혼조" };
}
function redditSearchUrl(q){
  // Reddit API는 브라우저에서 차단됨 → 실시간 Reddit 검색 링크로 연결
  return "https://www.reddit.com/search/?q=" + encodeURIComponent(q) + "&sort=new&t=week";
}
function peopleSkeleton(){
  return PEOPLE.map(p=>`<div class="person-card" style="--pc:${p.color}">
    <div class="person-head"><span class="person-name">${p.name}</span><span class="person-role">${p.role}</span></div>
    <div class="person-body"><div class="person-loading">불러오는 중…</div></div></div>`).join("");
}
async function loadPeople(){
  const wrap = $("#peopleStrip"); if (!wrap) return;
  if (MKT.peopleCache && (Date.now()-MKT.peopleAt) < MKT.newsTtl){ drawPeople(MKT.peopleCache); return; }
  const results = await Promise.allSettled(PEOPLE.map(async p => {
    const newsUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(p.q) + "&hl=en-US&gl=US&ceid=US:en";
    const newsText = await proxyFetch(newsUrl, false).catch(()=>null);
    const news = newsText ? parseRSS(newsText).slice(0,4).map(it=>({ ...it, title: it.title.replace(/\s*-\s*[^-]+$/,"") })) : [];
    await Promise.allSettled(news.map(async it => { it.ko = await translateKo(it.title); }));
    const redditUrl = redditSearchUrl(p.id==="yardeni" ? "Yardeni Research" : "Trump market OR Trump tariffs");
    const tn = tone(news.map(x=>x.title));
    return { person:p, news, redditUrl, tone:tn };
  }));
  const data = results.map((r,i)=> r.status==="fulfilled" ? r.value : { person:PEOPLE[i], news:[], redditUrl:"", tone:{k:"neutral",t:"—"}, err:true });
  MKT.peopleCache = data; MKT.peopleAt = Date.now();
  drawPeople(data);
}
function drawPeople(data){
  const wrap = $("#peopleStrip"); if (!wrap) return;
  wrap.innerHTML = data.map(d => {
    const p = d.person;
    const xNews = `https://x.com/search?q=${encodeURIComponent(p.id==="yardeni"?"Yardeni":"Trump market")}&f=live`;
    const xProfile = `https://x.com/${p.x}`;
    return `<div class="person-card" style="--pc:${p.color}">
      <div class="person-head">
        <span class="person-name">${p.name}</span>
        <span class="person-stance ${d.tone.k}">${d.tone.t}</span>
        ${p.base?`<span class="person-base">${p.base}</span>`:""}
        <span class="person-links">
          <a href="${xProfile}" target="_blank" rel="noopener" class="person-link">X↗</a>
          <a href="${xNews}" target="_blank" rel="noopener" class="person-link">X검색↗</a>
        </span>
      </div>
      <div class="person-body">
        <div class="person-sec-t">📰 뉴스</div>
        ${d.news.length ? d.news.map(it=>`<a class="person-item" href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.title)}">
            <span class="pi-title">${esc(it.ko||it.title)}</span><span class="pi-time">${relTime(it.date)}</span></a>`).join("")
          : `<div class="person-fail">${d.err?"불러오기 실패 (↻)":"최근 기사 없음"}</div>`}
        <div class="person-sec-t">👥 Reddit</div>
        ${d.redditUrl ? `<a class="person-item reddit-link-btn" href="${esc(d.redditUrl)}" target="_blank" rel="noopener">
            <span class="pi-title">🔗 Reddit에서 실시간 검색 보기 (로그인 후 이용)</span></a>` : `<div class="person-fail">Reddit 링크 없음</div>`}
      </div>
      <div class="person-tone-note">강세/약세는 최근 뉴스·레딧 제목 기반 자동 추정</div>
    </div>`;
  }).join("");
}

/* ---------- 대시보드에 시장 모듈 마운트 ---------- */
function refreshDashboardMarkets(force){
  if (parseRoute().type !== "dashboard") return;
  if (force){ MKT.quotes = {}; MKT.newsAt = 0; MKT.peopleAt = 0; }
  loadIndexStrip();
  renderPortfolio();
  loadHeadlines();
  loadPeople();
}
function mountMarkets(){
  loadIndexStrip();
  loadPeople();
  renderPortfolio();
  loadHeadlines();
}

/* ---------- 해시태그 자동 추천 ---------- */
const SEED_TAGS = ["반도체","AI","인공지능","빅테크","금리","연준","FOMC","환율","원달러","실적","어닝","배당","관세","인플레이션","2차전지","바이오","유가","엔비디아","브로드컴","마벨","코스피","나스닥","S&P500","ETF","경기침체","고용"];
function buildTagSuggest(){
  const box = $("#tagSuggest"); if (!box || !working) return;
  const text = (plainText($("#fContent").innerHTML)+" "+plainText($("#fThoughts").innerHTML)+" "+($("#fTitle").value||"")).toLowerCase();
  if (!text.trim()){ box.innerHTML=""; return; }
  const existing = new Set((working.tags||[]).map(t=>t.toLowerCase()));
  const pool = new Map();
  const used = {};
  state.entries.forEach(e => (e.tags||[]).forEach(t => { used[t] = (used[t]||0)+1; }));
  SEED_TAGS.forEach(t => { if (!(t in used)) used[t] = 0; });
  Object.keys(used).forEach(t => {
    if (existing.has(t.toLowerCase())) return;
    if (text.includes(t.toLowerCase())) pool.set(t, (used[t]||0)+3);
  });
  (state.tickers||[]).forEach(tk => {
    [tk.ticker, tk.name].filter(Boolean).forEach(label => {
      const l = label.toLowerCase();
      if (!existing.has(l) && text.includes(l)) pool.set(label, (pool.get(label)||0)+4);
    });
    if (tk.sector && tk.sector!=="미분류" && text.includes(tk.sector.toLowerCase()) && !existing.has(tk.sector.toLowerCase()))
      pool.set(tk.sector, (pool.get(tk.sector)||0)+2);
  });
  ((text.toUpperCase().match(/\$[A-Z]{1,6}/g))||[]).forEach(m => { const s=m.slice(1); if(!existing.has(s.toLowerCase())) pool.set(s,(pool.get(s)||0)+3); });
  const sorted = [...pool.entries()].sort((a,b)=> b[1]-a[1]).slice(0,10).map(x=>x[0]);
  box.innerHTML = sorted.length
    ? `<span class="ts-label">추천 태그</span>` + sorted.map(t=>`<button class="ts-chip" data-t="${esc(t)}">＋ #${esc(t)}</button>`).join("")
    : "";
  $$(".ts-chip", box).forEach(b => b.onclick = () => {
    const v = b.dataset.t;
    if (!working.tags.includes(v)){ working.tags.push(v); renderChips(); commit(false); }
    buildTagSuggest();
  });
}

/* ---------- 제목 프리셋 ---------- */
const TITLE_PRESETS = ["빈난새의 개장전 요것만","주말브리핑 (소몽)","월가백브리핑","빈틈없이 월가","월스트리트 나우"];
function syncTitlePreset(){
  const sel = $("#fTitlePreset"); if (!sel) return;
  const t = ($("#fTitle").value||"").trim();
  sel.value = TITLE_PRESETS.includes(t) ? t : "";
}

/* ---------- 초기화 ---------- */
function init() {
  applyTheme();
  if (!state.tickers) state.tickers = [];
  if (state.totalAssets == null) state.totalAssets = 0;
  initEditors();
  attachChipInput($("#fTagInput"), "tags");
  attachChipInput($("#fWatchInput"), "watch");
  render();

  $("#btnDone").onclick = () => closeEditor(true);
  $("#btnCloseEditor").onclick = () => closeEditor(false);
  $("#overlay").onclick = () => closeEditor(false);
  $("#btnDelete").onclick = () => {
    if (!working) return;
    if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    const sec = working.section;
    deleteEntry(working.id); working = null;
    $("#overlay").classList.remove("show"); $("#editor").classList.remove("show");
    navigate("#/" + sec); toast("삭제되었습니다.");
  };

  $("#btnSearch").onclick = openSearch;
  $("#searchInput").addEventListener("input", e => runSearch(e.target.value));
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key==="ArrowDown"){ e.preventDefault(); searchSel=Math.min(searchSel+1,searchHits.length-1); drawSearch(); }
    else if (e.key==="ArrowUp"){ e.preventDefault(); searchSel=Math.max(searchSel-1,0); drawSearch(); }
    else if (e.key==="Enter" && searchHits[searchSel]){ $("#searchModal").classList.remove("show"); openRead(searchHits[searchSel].id); }
  });

  $("#btnBackup").onclick = () => {
    $("#storageInfo").textContent = storageInfo();
    $("#syncRepo").value = sync ? `${sync.owner}/${sync.repo}` : "";
    $("#syncToken").value = sync ? (sync.token||"") : "";
    $("#syncBranch").value = sync ? sync.branch : "main";
    $("#syncPath").value = sync ? sync.path : "data/research-desk.json";
    setSyncStatus(syncOn()?"ok":"", syncOn()? (sync.lastAt?`마지막 동기화 ${new Date(sync.lastAt).toLocaleString("ko-KR")}`:"연결됨") : "연결 안 됨");
    $("#backupModal").classList.add("show");
  };
  $("#btnCloseBackup").onclick = () => $("#backupModal").classList.remove("show");
  $("#btnExportJson").onclick = exportJson;
  $("#btnExportMd").onclick = exportMd;
  $("#importFile").onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value=""; };
  $("#btnWipe").onclick = () => {
    if (!confirm("정말 모든 기록을 삭제할까요? 백업하지 않았다면 복구할 수 없습니다.")) return;
    if (!confirm("마지막 확인입니다. 전체 삭제를 진행할까요?")) return;
    state.entries = []; save(); $("#backupModal").classList.remove("show"); render(); toast("전체 데이터를 삭제했습니다.");
  };

  $("#btnApplyLink").onclick = applyLink;
  $("#btnCloseLink").onclick = () => $("#linkModal").classList.remove("show");
  $("#linkUrl").addEventListener("keydown", e => { if (e.key==="Enter") applyLink(); });

  // 동기화 설정
  $("#btnSyncConnect").onclick = () => {
    const repo = $("#syncRepo").value.trim().replace(/^https?:\/\/github\.com\//,"").replace(/\.git$/,"");
    const [owner, name] = repo.split("/");
    const token = $("#syncToken").value.trim();
    if (!owner || !name) { setSyncStatus("err", "저장소를 owner/repo 형식으로 입력하세요"); return; }
    if (!token) { setSyncStatus("err", "토큰을 입력하세요"); return; }
    sync = { owner, repo:name, token, branch:($("#syncBranch").value.trim()||"main"), path:($("#syncPath").value.trim()||"data/research-desk.json"), sha:null, lastAt:0 };
    saveSync();
    syncNow(true);
  };
  $("#btnSyncNow").onclick = () => { if (syncOn()) syncNow(true); else setSyncStatus("err","먼저 연결하세요"); };
  $("#btnSyncOff").onclick = () => {
    if (!sync) return;
    if (!confirm("이 기기에서 동기화 연결을 해제할까요? (저장된 글은 그대로 유지됩니다)")) return;
    sync = null; saveSync(); setSyncStatus("", "연결 해제됨");
    $("#syncRepo").value=""; $("#syncToken").value="";
    toast("동기화를 해제했습니다.");
  };

  $("#btnTheme").onclick = toggleTheme;
  $("#menuToggle").onclick = () => $("#sidebar").classList.contains("open") ? closeSidebar() : openSidebar();
  $("#sidebarClose").onclick = closeSidebar;
  const sbBd = $("#sidebarBackdrop"); if (sbBd) sbBd.onclick = closeSidebar;

  // 종목 관리 모달
  $("#btnAddTicker").onclick = addTicker;
  $("#btnCloseTicker").onclick = () => $("#tickerModal").classList.remove("show");
  ["tkSym","tkName","tkAmount"].forEach(id => {
    const el = $("#"+id); if (el) el.addEventListener("keydown", e => { if (e.key==="Enter") addTicker(); });
  });
  const taIn = $("#tkTotalAssets");
  if (taIn) taIn.addEventListener("change", () => setTotalAssets(taIn.value));

  // 제목 프리셋 드롭다운
  $("#fTitlePreset").onchange = e => {
    const v = e.target.value;
    if (!v) return;
    if (v === "__custom__") { $("#fTitle").value = ""; $("#fTitle").focus(); }
    else { $("#fTitle").value = v; $("#fTitle").focus(); }
    commit(false); buildTagSuggest();
  };

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k") { e.preventDefault(); openSearch(); }
    if (e.key==="Escape") {
      if ($("#linkModal").classList.contains("show")) $("#linkModal").classList.remove("show");
      else if ($("#tickerModal").classList.contains("show")) $("#tickerModal").classList.remove("show");
      else if ($("#searchModal").classList.contains("show")) $("#searchModal").classList.remove("show");
      else if ($("#backupModal").classList.contains("show")) $("#backupModal").classList.remove("show");
      else if ($("#editor").classList.contains("show")) closeEditor(false);
      else if ($("#sidebar").classList.contains("open")) closeSidebar();
    }
  });
  $$(".modal-overlay").forEach(m => m.addEventListener("click", e => { if (e.target===m) m.classList.remove("show"); }));

  // 동기화 트리거: 시작 시, 창 포커스/탭 복귀, 60초마다
  if (syncOn()) { setSyncStatus("syncing","동기화 중…"); syncNow(false); }
  window.addEventListener("focus", () => { if (syncOn() && !$("#editor").classList.contains("show")) syncNow(false); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && syncOn() && !$("#editor").classList.contains("show")) syncNow(false); });
  setInterval(() => { if (syncOn() && !$("#editor").classList.contains("show") && !document.hidden) syncNow(false); }, 60000);

  // 시세·헤드라인 자동 새로고침 (대시보드일 때, 60초마다)
  setInterval(() => { if (!document.hidden && parseRoute().type==="dashboard" && !$("#editor").classList.contains("show")) { loadIndexStrip(); loadPortfolioQuotes(); loadHeadlines(); loadPeople(); } }, 60000);
}
document.addEventListener("DOMContentLoaded", init);
