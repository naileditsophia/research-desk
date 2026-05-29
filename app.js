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

/* ---------- 상태 ---------- */
let state = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { version:1, settings:{ theme:"light" }, entries:[] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast("저장 공간이 부족합니다. 큰 이미지는 피해주세요."); }
}

/* ---------- 유틸 ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => (s||"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
const DOW = ["일","월","화","수","목","금","토"];
function prettyDate(s) {
  if (!s) return "";
  const [y,m,d] = s.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return `${m}월 ${d}일 (${DOW[dt.getDay()]})`;
}
function fullToday() {
  const d = new Date();
  return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,"0")}. ${String(d.getDate()).padStart(2,"0")}  ${DOW[d.getDay()]}요일`;
}
function weekKey(s) {            // ISO 주차 키
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

/* ---------- HTML 정화 (붙여넣기 시 서식 유지 + 위험요소 제거) ---------- */
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
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  return SECTION_KEYS.includes(h) ? h : "dashboard";
}
window.addEventListener("hashchange", render);

/* ---------- 사이드바 / 네비 ---------- */
function buildNav() {
  const nav = $("#nav");
  const route = currentRoute();
  let html = `<button class="nav-item ${route==="dashboard"?"active":""}" data-route="dashboard" style="--dot:var(--gold)">
      <span class="nav-tick" style="background:var(--gold)"></span>
      <span class="nav-num">＊</span><span class="nav-label">오늘</span></button>
    <div class="nav-sep"></div>`;
  SECTION_KEYS.forEach(k => {
    const s = SECTIONS[k];
    const n = state.entries.filter(e => e.section === k).length;
    html += `<button class="nav-item ${route===k?"active":""}" data-route="${k}" style="--dot:var(${s.color})">
      <span class="nav-tick"></span>
      <span class="nav-num">${s.num}</span>
      <span class="nav-label">${s.label}</span>
      ${n ? `<span class="nav-count">${n}</span>` : `<span class="nav-cad">${s.cad}</span>`}
    </button>`;
  });
  nav.innerHTML = html;
  $$(".nav-item", nav).forEach(b => b.onclick = () => {
    location.hash = "#/" + b.dataset.route;
    $("#sidebar").classList.remove("open");
  });
}

/* ---------- 렌더 ---------- */
function render() {
  buildNav();
  $("#mastheadDate").textContent = fullToday();
  const route = currentRoute();
  if (route === "dashboard") renderDashboard();
  else renderSection(route);
}

/* === 대시보드 === */
function renderDashboard() {
  $("#topbarNum").textContent = "＊";
  $("#topbarNum").style.setProperty("--dot", "var(--gold)");
  $("#topbarTitle").textContent = "오늘";
  $("#topbarRight").innerHTML = "";

  const today = todayStr();
  const tWeek = weekKey(today);
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
      <div class="routine-top">
        <span class="routine-name">${s.label}</span>
        <span class="routine-status ${done?"done":"todo"}">${done?"✓":"○"}</span>
      </div>
      <div class="routine-meta">${s.num} · ${period==="day"?"오늘":"이번 주"} ${done?"완료":"미작성"}</div>
      <div class="routine-cta">＋ 기록하기</div>
    </div>`;
  };

  const recent = [...state.entries].sort((a,b)=> (b.updated||0)-(a.updated||0)).slice(0,8);

  $("#view").innerHTML = `
    <div class="dash-hello">좋은 하루예요, Sophia 👋</div>
    <div class="dash-sub">오늘은 <b>${fullToday()}</b> · 기록이 쌓일수록 판단이 선명해집니다.</div>

    <div class="stats">
      <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">전체 기록</div></div>
      <div class="stat"><div class="stat-n">${weekCount}</div><div class="stat-l">이번 주 기록</div></div>
      <div class="stat"><div class="stat-n flame">${streak}<span style="font-size:15px">일 🔥</span></div><div class="stat-l">연속 기록</div></div>
    </div>

    <div class="dash-h">오늘의 루틴 · 매일</div>
    <div class="routine-grid">${dailyKeys.map(k=>routineCard(k,"day")).join("")}</div>

    <div class="dash-h">이번 주 · 주간 정리</div>
    <div class="routine-grid">${weeklyKeys.map(k=>routineCard(k,"week")).join("")}</div>

    <div class="dash-h">최근 기록</div>
    ${recent.length ? `<div class="recent">${recent.map(recentRow).join("")}</div>`
      : `<div class="empty"><div class="empty-mark">❝</div><p>아직 기록이 없어요. 위 루틴 카드를 눌러 시작해보세요.</p></div>`}
  `;

  $$(".routine-card").forEach(c => c.onclick = () => openEditor(c.dataset.new, null));
  $$(".recent-row").forEach(r => r.onclick = () => {
    const e = state.entries.find(x=>x.id===r.dataset.id);
    if (e) openEditor(e.section, e.id);
  });
}
function recentRow(e) {
  const s = SECTIONS[e.section];
  return `<div class="recent-row" data-id="${e.id}">
    <span class="recent-dot" style="background:var(${s.color})"></span>
    <span class="recent-sec">${s.label}</span>
    <span class="recent-title">${esc(e.title) || "(제목 없음)"}</span>
    <span class="recent-date">${prettyDate(e.date)}</span>
  </div>`;
}
function calcStreak() {
  const days = new Set(state.entries.map(e=>e.date));
  let streak = 0;
  const d = new Date();
  // 오늘 기록 없으면 어제부터 카운트
  const tStr = todayStr();
  if (!days.has(tStr)) d.setDate(d.getDate()-1);
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
    entries = entries.filter(e =>
      (e.title||"").toLowerCase().includes(q) ||
      (e.meta||"").toLowerCase().includes(q) ||
      plainText(e.content).toLowerCase().includes(q) ||
      plainText(e.thoughts).toLowerCase().includes(q) ||
      (e.tags||[]).join(" ").toLowerCase().includes(q));
  }

  const tools = `<div class="list-tools">
      <input class="filter-input" id="listFilter" placeholder="이 섹션 내 검색…" value="${esc(listFilter.text)}" />
      <div class="tag-filter">${allTags.slice(0,12).map(t=>
        `<button class="tag-pill ${listFilter.tag===t?"on":""}" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div>
    </div>`;

  const body = entries.length
    ? `<div class="cards">${entries.map(e=>card(e,s)).join("")}</div>`
    : `<div class="empty"><div class="empty-mark">${s.num}</div>
         <p>${listFilter.text||listFilter.tag ? "조건에 맞는 기록이 없어요." : `아직 "${s.label}" 기록이 없습니다.`}</p>
         <button class="solid-btn" id="btnEmptyNew">＋ 첫 기록 작성</button></div>`;

  $("#view").innerHTML = tools + body;

  const fi = $("#listFilter");
  if (fi) fi.oninput = () => { listFilter.text = fi.value; const pos = fi.selectionStart; drawList(key); const nf=$("#listFilter"); nf.focus(); nf.setSelectionRange(pos,pos); };
  $$(".tag-pill").forEach(p => p.onclick = () => { listFilter.tag = listFilter.tag===p.dataset.tag ? "" : p.dataset.tag; drawList(key); });
  $$(".entry-card").forEach(c => c.onclick = () => openEditor(key, c.dataset.id));
  const en = $("#btnEmptyNew"); if (en) en.onclick = () => openEditor(key, null);
}
function card(e, s) {
  const ex = plainText(e.content) || plainText(e.thoughts);
  return `<div class="entry-card" style="--dot:var(${s.color})" data-id="${e.id}">
    <div class="entry-head">
      <span class="entry-date">${prettyDate(e.date)}</span>
      ${e.meta ? `<span class="entry-meta-tag">${esc(e.meta)}</span>` : ""}
    </div>
    <div class="entry-title">${esc(e.title)}</div>
    ${ex ? `<div class="entry-excerpt">${esc(ex.slice(0,160))}</div>` : ""}
    ${(e.tags&&e.tags.length) ? `<div class="entry-foot">${e.tags.map(t=>`<span class="entry-chip">#${esc(t)}</span>`).join("")}</div>` : ""}
  </div>`;
}

/* ---------- 에디터 ---------- */
let working = null;       // 현재 편집 중 엔트리
let isNew = false;
let saveTimer = null;

function openEditor(section, id) {
  const s = SECTIONS[section];
  if (id) { working = state.entries.find(e=>e.id===id); isNew = false; }
  else {
    working = { id:uid(), section, date:todayStr(), title:"", meta:"", content:"", thoughts:"", tags:[], created:Date.now(), updated:Date.now() };
    isNew = true;
  }
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
function closeEditor() {
  commit(true);
  // 완전히 빈 새 기록이면 폐기
  const w = working;
  if (w && isNew && !w.title && !plainText(w.content) && !plainText(w.thoughts) && !(w.tags&&w.tags.length)) {
    state.entries = state.entries.filter(e=>e.id!==w.id); save();
  }
  $("#overlay").classList.remove("show");
  $("#editor").classList.remove("show");
  $("#editor").setAttribute("aria-hidden","true");
  working = null;
  render();
}
function commit(force) {
  if (!working) return;
  working.date = $("#fDate").value || todayStr();
  working.meta = $("#fMeta").value.trim();
  working.title = $("#fTitle").value.trim();
  working.content = sanitize($("#fContent").innerHTML);
  working.thoughts = sanitize($("#fThoughts").innerHTML);
  working.updated = Date.now();
  const hasAny = working.title || plainText(working.content) || plainText(working.thoughts) || (working.tags&&working.tags.length);
  const exists = state.entries.some(e=>e.id===working.id);
  if (hasAny && !exists) { state.entries.push(working); isNew = false; }
  if (exists || hasAny) save();
  $("#saveState").textContent = "저장됨 ✓";
  if (!force) { clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ $("#saveState").textContent="저장됨"; }, 1500); }
}
function scheduleSave() {
  $("#saveState").textContent = "저장 중…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>commit(false), 600);
}

/* 태그 */
function renderChips() {
  $("#tagChips").innerHTML = (working.tags||[]).map((t,i)=>
    `<span class="chip">#${esc(t)}<x data-i="${i}">✕</x></span>`).join("");
  $$("#tagChips x").forEach(x => x.onclick = () => { working.tags.splice(+x.dataset.i,1); renderChips(); commit(false); });
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
let activeEditor = null;
function initEditors() {
  $$(".rt-toolbar").forEach(tb => {
    buildToolbar(tb);
    const target = $("#" + tb.dataset.target);
    $$(".rt-btn", tb).forEach(btn => {
      btn.onmousedown = ev => ev.preventDefault();   // 포커스 유지
      btn.onclick = () => runCmd(btn.dataset.cmd, btn.dataset.val, target);
    });
  });
  [$("#fContent"), $("#fThoughts")].forEach(ed => {
    ed.addEventListener("focus", ()=> activeEditor = ed);
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
  if (cmd === "formatBlock") {
    // 같은 블록이면 토글하여 문단으로
    document.execCommand("formatBlock", false, val);
  } else {
    document.execCommand(cmd, false, null);
  }
  scheduleSave();
}
function getSel(){ const s=window.getSelection(); return s? s.toString() : ""; }
function onPaste(ev) {
  const html = ev.clipboardData.getData("text/html");
  const text = ev.clipboardData.getData("text/plain");
  if (html) {
    ev.preventDefault();
    document.execCommand("insertHTML", false, sanitize(html));
    scheduleSave();
  } else if (text) {
    // 일반 텍스트는 기본 동작 (줄바꿈 유지) 후 저장
    setTimeout(scheduleSave, 0);
  }
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
function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { $("#searchResults").innerHTML=""; searchHits=[]; return; }
  searchHits = state.entries.filter(e =>
    (e.title||"").toLowerCase().includes(q) ||
    (e.meta||"").toLowerCase().includes(q) ||
    plainText(e.content).toLowerCase().includes(q) ||
    plainText(e.thoughts).toLowerCase().includes(q) ||
    (e.tags||[]).join(" ").toLowerCase().includes(q))
    .sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,40);
  searchSel = 0;
  drawSearch();
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
  $$(".sr-row").forEach(r => r.onclick = () => { const e=state.entries.find(x=>x.id===r.dataset.id); $("#searchModal").classList.remove("show"); openEditor(e.section, e.id); });
}

/* ---------- 백업 / 가져오기 ---------- */
function download(name, content, type) {
  const blob = new Blob([content], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function exportJson() {
  download(`research-desk-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("JSON 백업을 내려받았습니다.");
}
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
      if (plainText(e.thoughts)) md += `\n> **내 생각**\n>\n` + htmlToMd(e.thoughts).split("\n").map(l=>"> "+l).join("\n") + "\n";
    });
  });
  download(`research-desk-${todayStr()}.md`, md, "text/markdown");
  toast("마크다운을 내려받았습니다.");
}
function htmlToMd(html) {
  const div = document.createElement("div"); div.innerHTML = html || "";
  function walk(node, depth=0) {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g," ").replace(/^\s+|\s+$/g,m=>m?" ":""); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName.toLowerCase(), inner = walk(n, depth);
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
  const kb = (bytes/1024).toFixed(1);
  return `기록 ${state.entries.length}건 · 약 ${kb} KB 사용 중 (브라우저 한도 약 5,000 KB)`;
}

/* ---------- 테마 ---------- */
function applyTheme() {
  const t = state.settings.theme || "light";
  document.documentElement.setAttribute("data-theme", t);
  $("#themeIco").textContent = t==="dark" ? "☀" : "◐";
  $("#themeLabel").textContent = t==="dark" ? "라이트 모드" : "다크 모드";
}
function toggleTheme() {
  state.settings.theme = (state.settings.theme==="dark") ? "light" : "dark";
  save(); applyTheme();
}

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove("show"), 2400);
}

/* ---------- 초기화 / 이벤트 ---------- */
function init() {
  applyTheme();
  initEditors();
  render();

  $("#btnCloseEditor").onclick = closeEditor;
  $("#overlay").onclick = closeEditor;
  $("#btnDelete").onclick = () => {
    if (!working) return;
    if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    state.entries = state.entries.filter(e=>e.id!==working.id);
    save(); working = null;
    $("#overlay").classList.remove("show"); $("#editor").classList.remove("show");
    render(); toast("삭제되었습니다.");
  };

  // 태그 입력
  $("#fTagInput").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/,"");
      if (v && !(working.tags||[]).includes(v)) { working.tags = working.tags||[]; working.tags.push(v); renderChips(); commit(false); }
      e.target.value = "";
    } else if (e.key === "Backspace" && !e.target.value && working.tags && working.tags.length) {
      working.tags.pop(); renderChips(); commit(false);
    }
  });

  // 검색
  $("#btnSearch").onclick = openSearch;
  $("#searchInput").addEventListener("input", e => runSearch(e.target.value));
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key==="ArrowDown"){ e.preventDefault(); searchSel=Math.min(searchSel+1,searchHits.length-1); drawSearch(); }
    else if (e.key==="ArrowUp"){ e.preventDefault(); searchSel=Math.max(searchSel-1,0); drawSearch(); }
    else if (e.key==="Enter" && searchHits[searchSel]){ const h=searchHits[searchSel]; $("#searchModal").classList.remove("show"); openEditor(h.section,h.id); }
  });

  // 백업 모달
  $("#btnBackup").onclick = () => { $("#storageInfo").textContent = storageInfo(); $("#backupModal").classList.add("show"); };
  $("#btnCloseBackup").onclick = () => $("#backupModal").classList.remove("show");
  $("#btnExportJson").onclick = exportJson;
  $("#btnExportMd").onclick = exportMd;
  $("#importFile").onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value=""; };
  $("#btnWipe").onclick = () => {
    if (!confirm("정말 모든 기록을 삭제할까요? 백업하지 않았다면 복구할 수 없습니다.")) return;
    if (!confirm("마지막 확인입니다. 전체 삭제를 진행할까요?")) return;
    state.entries = []; save(); $("#backupModal").classList.remove("show"); render(); toast("전체 데이터를 삭제했습니다.");
  };

  // 링크 모달
  $("#btnApplyLink").onclick = applyLink;
  $("#btnCloseLink").onclick = () => $("#linkModal").classList.remove("show");
  $("#linkUrl").addEventListener("keydown", e => { if (e.key==="Enter") applyLink(); });

  // 테마 / 메뉴
  $("#btnTheme").onclick = toggleTheme;
  $("#menuToggle").onclick = () => $("#sidebar").classList.toggle("open");

  // 단축키
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k") { e.preventDefault(); openSearch(); }
    if (e.key==="Escape") {
      if ($("#linkModal").classList.contains("show")) $("#linkModal").classList.remove("show");
      else if ($("#searchModal").classList.contains("show")) $("#searchModal").classList.remove("show");
      else if ($("#backupModal").classList.contains("show")) $("#backupModal").classList.remove("show");
      else if ($("#editor").classList.contains("show")) closeEditor();
    }
  });
  document.querySelectorAll(".modal-overlay").forEach(m => m.addEventListener("click", e => { if (e.target===m) m.classList.remove("show"); }));
}

document.addEventListener("DOMContentLoaded", init);
