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
  $$(".nav-item", nav).forEach(b => b.onclick = () => { navigate("#/" + b.dataset.route); $("#sidebar").classList.remove("open"); });
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
    <div class="dash-hello">좋은 하루예요, Sophia 👋</div>
    <div class="dash-sub">오늘은 <b>${fullToday()}</b> · 기록이 쌓일수록 판단이 선명해집니다.</div>
    <div class="stats">
      <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">전체 기록</div></div>
      <div class="stat"><div class="stat-n">${weekCount}</div><div class="stat-l">이번 주 기록</div></div>
      <div class="stat"><div class="stat-n flame">${streak}<span style="font-size:15px">일 🔥</span></div><div class="stat-l">연속 기록</div></div>
    </div>

    <div class="dash-h watch-h">이번 주 주목 종목 · 섹터 <span class="dash-h-note">주력 섹터 · 딥리서치용</span></div>
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
function scheduleSave() { $("#saveState").textContent = "저장 중…"; clearTimeout(saveTimer); saveTimer = setTimeout(()=>commit(false), 600); }

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
  return { entries, deleted: del };
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
    const changed = JSON.stringify(state.entries) !== JSON.stringify(merged.entries);
    state.entries = merged.entries; state.deleted = merged.deleted; save();
    const payload = { version:1, exportedAt:new Date().toISOString(), entries:state.entries, deleted:state.deleted };
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

/* ---------- 초기화 ---------- */
function init() {
  applyTheme();
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
  $("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k") { e.preventDefault(); openSearch(); }
    if (e.key==="Escape") {
      if ($("#linkModal").classList.contains("show")) $("#linkModal").classList.remove("show");
      else if ($("#searchModal").classList.contains("show")) $("#searchModal").classList.remove("show");
      else if ($("#backupModal").classList.contains("show")) $("#backupModal").classList.remove("show");
      else if ($("#editor").classList.contains("show")) closeEditor(false);
    }
  });
  $$(".modal-overlay").forEach(m => m.addEventListener("click", e => { if (e.target===m) m.classList.remove("show"); }));

  // 동기화 트리거: 시작 시, 창 포커스/탭 복귀, 60초마다
  if (syncOn()) { setSyncStatus("syncing","동기화 중…"); syncNow(false); }
  window.addEventListener("focus", () => { if (syncOn() && !$("#editor").classList.contains("show")) syncNow(false); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && syncOn() && !$("#editor").classList.contains("show")) syncNow(false); });
  setInterval(() => { if (syncOn() && !$("#editor").classList.contains("show") && !document.hidden) syncNow(false); }, 60000);
}
document.addEventListener("DOMContentLoaded", init);
