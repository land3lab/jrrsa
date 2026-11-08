// 양성이 — 메인 화면 / 상태 / 뒤로가기 / 시트
import { analyze, categoryOf, CATEGORY_LABEL } from "./engine.js";
import { SPECIAL_ACT, SUNLIGHT, LAW_SOURCES, LAW_CHECKED_AT, VIOLATION_TYPES, ZONES } from "./laws.js";
import { createMap, toLocal } from "./map.js";
import { createView } from "./view3d.js";
import { readFile } from "./upload.js";
import { sampleProject, emptyProject, SAMPLE_ADDRESS } from "./sample.js";
import * as A from "./auth.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = (n) => (Number.isFinite(+n) ? (+n).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "-");
const f2 = (n) => (Number.isFinite(+n) ? (+n).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "-");
const won = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}억원` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만원` : `${Math.round(n).toLocaleString()}원`);

const S = { P: sampleProject(), R: null, mode: "after", layout: "both", cfg: {}, lastUpload: null };
let mapV = null, view = null, thumb = null, bigView = null;

// ───────────────────────── 계산 + 그리기
function compute() {
  const P = S.P;
  // 필지 형상 → 로컬 좌표
  let origin = null, siteLocal = null;
  if (P.parcelRing && P.parcelRing.length > 2) {
    const lats = P.parcelRing.map((p) => p[0]), lngs = P.parcelRing.map((p) => p[1]);
    origin = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
    siteLocal = P.parcelRing.map(([la, ln]) => toLocal(origin, la, ln));
    const xs = siteLocal.map((p) => p[0]), zs = siteLocal.map((p) => p[1]);
    if (!P.site.dimsManual) { P.site.width = +(Math.max(...xs) - Math.min(...xs)).toFixed(2); P.site.depth = +(Math.max(...zs) - Math.min(...zs)).toFixed(2); }
  } else if (P.address.lat && P.address.lng) origin = { lat: P.address.lat, lng: P.address.lng };
  else {
    // 좌표를 못 찾은 경우: 엉뚱한 기본 위치 대신 지금 지도 중심을 쓴다 (위치 미확인 표시)
    const c = mapV?.map?.getCenter?.();
    origin = c ? { lat: c.lat, lng: c.lng } : { lat: 37.5665, lng: 126.978 };
  }
  P.legal.category = P.legal.category && P.legal.category !== "other" ? P.legal.category : categoryOf(P.legal.purpose);
  const R = analyze(P);
  R.origin = origin; R.siteLocal = siteLocal;
  S.R = R;
  return R;
}

function render() {
  const R = compute();
  const P = S.P;
  // 출처 라인
  const addr = P.address.roadAddress || P.address.jibunAddress || "주소 미입력";
  $("#srcLine").innerHTML = `<b>${esc(addr)}</b>${P.address.roadAddress && P.address.jibunAddress ? ` <span>(${esc(P.address.jibunAddress)})</span>` : ""} ${(P.sources || []).map((s) => `<span class="tag ${/샘플|예시|추정/.test(s) ? "o" : ""}">${esc(s)}</span>`).join(" ")}`;

  // 헤드라인
  const hl = $("#headline");
  hl.className = "headline " + (R.possible === "yes" || R.possible === "none" ? "ok" : R.possible === "no" ? "bad" : "");
  const unknown = !!P.violationsUnknown;
  if (unknown) hl.className = "headline";
  hl.querySelector(".t").textContent = unknown ? "대장 조회 완료 — 위반 여부를 확인하세요 (대장 첨부 또는 현황 입력)" : R.headline;
  hl.querySelector(".a").textContent = `${R.zone || "용도지역 미확인"} · ${CATEGORY_LABEL[R.cat] || ""} · 대지 ${f1(R.site)}㎡ · 특조법 신고기간 ${SPECIAL_ACT.effective} ~ ${SPECIAL_ACT.expires}`;

  // ① 위반 여부
  const V = R.violation;
  const ex = P.isExample ? ` <span class="badge b-warn">예시</span>` : "";
  $("#e1").innerHTML = unknown
    ? `<div class="big" style="color:var(--warn)">확인 필요</div>
       <div class="sub hide-m">건축HUB 대장 정보에는 '위반건축물' 표기가 없어 자동 판정할 수 없습니다.</div>
       <div class="chips"><span class="chip" role="button" data-act="upload">📎 대장 첨부</span><span class="chip" role="button" data-act="viol-edit">✏️ 현황 입력</span><span class="chip" role="button" data-act="example">예시로 보기</span></div>`
    : V.isViolation
    ? `<div class="big" style="color:var(--bad)">위반건축물${ex}</div>
       <div class="sub hide-m">${V.sources.map(esc).join(" · ")}</div>
       <ul>${V.items.slice(0, 3).map((i) => `<li>${esc(i.label)}${i.area ? ` <b>${f1(i.area)}㎡</b>` : ""}${i.units ? ` (+${i.units}가구)` : ""}</li>`).join("")}</ul>
       <div class="sub">위반 <b>${f1(V.totalArea)}㎡</b> · ${V.items.length}건<span class="hide-m"> · 이행강제금 1회 약 <b>${won(S.R.money.fineOnce)}</b></span></div>`
    : `<div class="big" style="color:var(--ok)">위반 없음</div><div class="sub">대장에 위반 표기가 없고 입력된 위반 내역이 없습니다.</div><div class="sub">현장과 다르면 ✏️ 위반 내역을 입력하세요.</div>`;

  // ② 대상/가능
  const tMap = { yes: ["대상", "b-ok"], partial: ["규모 초과(감축 시 대상)", "b-warn"], no: ["대상 아님", "b-bad"], none: ["해당 없음", "b-navy"] };
  const pMap = { yes: ["양성화 가능", "b-ok"], conditional: ["조건부 가능", "b-warn"], no: ["불가 / 추인 검토", "b-bad"], none: ["필요 없음", "b-navy"] };
  const fails = R.target.reasons.filter((r) => !r.ok).concat(R.approval.filter((a) => !a.ok).map((a) => ({ text: a.label })));
  if (unknown) {
    const pre = R.target.reasons.filter((r) => /용도|이하|주거용/.test(r.text));
    $("#e2").innerHTML = `<div><span class="badge b-navy">위반 확인 후 판정</span></div>
      <div class="sub">사전 검토 (용도·규모)</div>
      <div class="sub">${pre.map((r) => `<div style="color:${r.ok ? "var(--ok)" : "var(--bad)"}">${r.ok ? "✓" : "✕"} ${esc(r.text)}</div>`).join("")}</div>`;
  } else
  $("#e2").innerHTML = `
    <div>특조법 대상 <span class="badge ${tMap[R.target.status][1]}">${tMap[R.target.status][0]}</span></div>
    <div>양성화 <span class="badge ${pMap[R.possible][1]}">${pMap[R.possible][0]}</span></div>
    <div class="sub hide-m">${fails.length ? "⚠ " + esc(fails[0].text) : "✔ 대상 요건·사용승인 기준 충족"}</div>
    <div class="sub">권장: <b>${R.tracks.rec === "A" ? "특조법 신고" : "건축법 추인"}</b> · 최소 보완 <b>${f1(R.tracks[R.tracks.rec].cut)}㎡</b></div>`;

  // ③ 전후 차이
  const rows = R.compare.filter((c) => ["건폐율", "용적률", "연면적", "높이"].includes(c.label));
  $("#e3").innerHTML = `<table class="mini"><tr><th></th><th>전</th><th>현황</th><th>후</th></tr>
    ${rows.map((c) => `<tr><td>${c.label}</td><td>${f1(c.before)}</td><td class="${c.current > c.before ? "up" : ""}">${f1(c.current)}</td><td class="fix">${f1(c.after)}</td></tr>`).join("")}</table>
    <div class="sub hide-m">가장 제한적인 기준: <b>${esc(R.tracks[R.tracks.rec].binding?.label || "-")}</b></div>`;

  // 뷰어
  $("#threeLabel").textContent = { before: "양성화 전 (대장)", current: "현황 (위반 포함)", after: "양성화 후 (권장안)" }[S.mode];
  try { mapV?.update(P, R, S.mode); } catch (e) { console.warn(e); }
  try { view?.update(P, R, S.mode); } catch (e) { console.warn(e); }
  try { thumb?.update(P, R, $("#thumbSeg .on")?.dataset.m || "after"); } catch (e) { console.warn(e); }
  try { if (bigView && !$("#sheet").hidden) bigView.update(P, R, S.bigMode || "after"); } catch (e) { console.warn(e); }

  renderTiles();
}

function renderTiles() {
  const R = S.R;
  const rec = R.tracks[R.tracks.rec];
  const T = [
    ["limits", "📐", "기준별 한도 · 최소 보완", "건폐율·용적률·일조·규모별 남길 수 있는 면적", `최소 보완 ${f1(rec.cut)}㎡`],
    ["sun", "☀️", "일조사선 검토", "개정 건축법 제61조 (2026.11.12 시행)", R.sun.applies ? (R.sun.curOk ? "적합" : `이격 ${R.sun.setback}m → 필요 ${R.sun.requiredForCur}m`) : "비적용"],
    ["money", "💰", "이행강제금 · 과태료", "특조법 과태료 = 이행강제금 5회분 − 기납부", `과태료 약 ${won(R.money.specialPenalty)}`],
    ["upload", "📎", "대장 첨부 자동확인", "이미지·PDF(비밀번호)·문서 → 자동 인식", S.lastUpload ? `${S.lastUpload.found.length}개 항목 인식` : "OCR · PDF"],
    ["register", "🏛️", "건축물대장 정보", "건축HUB 자동조회 결과 확인·수정", S.P.isSample ? "샘플 값" : (S.P.sources || []).join(", ")],
    ["viol-edit", "✏️", "위반 내역 입력", "옥탑·수평증축·발코니·세대분할 등", `${(S.P.violations || []).length}건`],
    ["checks", "✅", "대상 요건 · 제외구역", "특조법 제3조·제6조 체크리스트", ""],
    ["process", "🧾", "신고 절차 · 서류", "건축사 설계도서·현장조사서 → 30일 내 처리", ""],
    ["issue", "📄", "건축물대장 발급 · 열람", "정부24 발급 · 세움터 열람 · 건축HUB", ""],
    ["laws", "⚖️", "근거 법령 (검증)", `국가법령정보센터 대조 ${LAW_CHECKED_AT}`, ""],
    ["account", "👤", "로그인 · 내 기록", A.auth.enabled ? (A.auth.user ? "서버에 자동 연결됨" : "외부 서버 로그인") : "이 기기에 저장", ""],
    ["install", "📱", "휴대폰에 설치", "홈 화면에 양성이 앱 추가", ""],
  ];
  $("#tiles").innerHTML = T.map(([id, ic, t, s, v]) => `<button class="tile" data-sheet="${id}"><span class="ic">${ic}</span><b>${t}</b><span>${esc(s)}</span>${v ? `<span class="val">${esc(v)}</span>` : ""}</button>`).join("");
}

// ───────────────────────── 시트(세부 화면) + 뒤로가기
const SHEETS = {
  violation: ["① 위반건축물 여부 · 해당사항", sheetViolation],
  eligibility: ["② 양성화 대상 · 가능 여부", sheetEligibility],
  compare: ["③ 양성화 전후 차이", sheetCompare],
  view3d: ["④ 전후 3D 분석", sheetView3d],
  limits: ["기준별 허용 한도 · 최소 보완 규모", sheetLimits],
  sun: ["일조사선 (정북방향) 검토", sheetSun],
  money: ["이행강제금 · 특조법 과태료", sheetMoney],
  upload: ["건축물대장 첨부 → 자동 확인", sheetUpload],
  register: ["건축물대장 정보 (건축HUB)", sheetRegister],
  "viol-edit": ["위반 내역 입력", sheetViolEdit],
  checks: ["대상 요건 · 제외구역 체크", sheetChecks],
  process: ["특조법 신고 절차 · 준비 서류", sheetProcess],
  issue: ["건축물대장 발급 · 열람", sheetIssue],
  laws: ["근거 법령 (원문 대조)", sheetLaws],
  account: ["로그인 · 내 기록", sheetAccount],
  install: ["휴대폰에 설치하기", sheetInstall],
  postcode: ["주소검색 (도로명 · 지번)", sheetPostcode],
};

let sheetOpen = null;
function openSheet(id, push = true) {
  const def = SHEETS[id];
  if (!def) return;
  if (push) history.pushState({ v: "sheet", id }, "", `#${id}`);
  sheetOpen = id;
  $("#sheetTitle").textContent = def[0];
  const body = $("#sheetBody");
  body.innerHTML = "";
  body.scrollTop = 0;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
  def[1](body);
}
function closeSheetUI() {
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
  sheetOpen = null;
  if (bigView) bigView.setAuto(false);
}
function back() { history.back(); }

function setupHistory() {
  // 앱 첫 화면에서 뒤로가기를 눌러도 앱이 닫히지 않도록 '가드' 상태를 하나 깔아 둔다.
  history.replaceState({ v: "guard" }, "", location.pathname + location.search);
  history.pushState({ v: "home" }, "", location.pathname + location.search);
  window.addEventListener("popstate", (e) => {
    const st = e.state || {};
    if (st.v === "sheet") { openSheet(st.id, false); return; }
    if (sheetOpen) closeSheetUI();
    if (st.v === "guard") {
      history.pushState({ v: "home" }, "", location.pathname + location.search);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast("첫 화면입니다. 앱을 닫으려면 홈 버튼을 이용하세요.");
    }
  });
}

// ───────────────────────── 시트 내용
function sheetViolation(b) {
  const R = S.R, V = R.violation;
  b.innerHTML = `
    <p><span class="badge ${V.isViolation ? "b-bad" : "b-ok"}">${V.isViolation ? "위반건축물" : "위반사항 없음"}</span> ${V.sources.map(esc).join(" · ")}</p>
    ${V.note && S.P.legal.violationMarked ? `<div class="note o">대장 표기: ${esc(V.note)}</div>` : ""}
    ${S.P.isExample ? `<div class="note o">지금 위반 내역은 <b>가상 예시</b>입니다. 실제 판정은 대장 첨부 또는 현황 입력으로 하세요.</div>` : ""}
    ${S.P.violationsUnknown ? `<div class="note o">건축HUB 대장 정보에는 '위반건축물' 표기 항목이 없습니다. 대장(갑) PDF·사진을 첨부하거나 현장 위반 내역을 입력하면 판정합니다.</div>` : ""}
    <h4>위반 해당사항</h4>
    ${V.items.length ? `<table class="tbl"><tr><th>내용</th><th>위치</th><th>면적</th></tr>
      ${V.items.map((i) => `<tr><td>${esc(i.label)}${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</td><td>${esc(i.floor)}</td><td>${i.area ? f2(i.area) + "㎡" : i.units ? `+${i.units}가구` : "-"}</td></tr>`).join("")}
      <tr><td><b>합계</b></td><td></td><td><b>${f2(V.totalArea)}㎡</b></td></tr></table>` : `<p>입력된 위반 내역이 없습니다.</p>`}
    <h4>위반이 바꾼 수치</h4>
    <table class="tbl"><tr><th>항목</th><th>대장</th><th>현황</th><th>기준</th></tr>
      ${R.compare.map((c) => `<tr><td>${c.label}</td><td>${f2(c.before)}${c.unit}</td><td>${f2(c.current)}${c.unit}</td><td>${esc(c.limit)}</td></tr>`).join("")}</table>
    <div class="note">건축물대장(갑) 상단의 <b>'위반건축물'</b> 표기와 변동사항란의 위반 내용을 기준으로 합니다. 대장을 첨부하면 자동으로 읽고, 현장 상태가 다르면 위반 내역을 직접 고칠 수 있습니다.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-main" data-open="viol-edit">✏️ 위반 내역 수정</button><button class="btn btn-ghost" data-open="upload">📎 대장 첨부</button></div>`;
}

function sheetEligibility(b) {
  const R = S.R;
  const li = (ok, t, small = "") => `<li class="${ok ? "ok" : "no"}"><span class="m">${ok ? "✓" : "✕"}</span><div>${esc(t)}${small ? `<small>${esc(small)}</small>` : ""}</div></li>`;
  b.innerHTML = `
    <div class="note o"><b>${esc(R.headline)}</b></div>
    <h4>A. 특조법 대상 여부 (제2조·제3조)</h4>
    <ul class="checks">${R.target.reasons.map((r) => li(r.ok, r.text)).join("")}</ul>
    <h4>B. 사용승인 기준 (제6조) — 신고 후 30일 내 건축위원회 심의</h4>
    <ul class="checks">${R.approval.map((a) => li(a.ok, a.label, a.basis)).join("")}</ul>
    <h4>C. 결론</h4>
    <p>특조법: <b>${{ yes: "양성화 가능", conditional: "조건부 가능 (보완 후 신고)", no: "대상 아님", none: "양성화 불필요" }[R.possible]}</b></p>
    <p>권장 경로: <b>${R.tracks.rec === "A" ? R.tracks.A.name : R.tracks.B.name}</b> — 최소 보완(철거·감축) <b>${f2(R.tracks[R.tracks.rec].cut)}㎡</b>, 존치 <b>${f2(R.tracks[R.tracks.rec].keep)}㎡</b></p>
    <div class="note">특조법은 <b>2026.12.17 시행, 18개월 한시(2028.6.16까지 신고)</b>입니다. 대상이 되면 「건축법 및 관계 법률에도 불구하고」 사용승인하므로 <b>건폐율·용적률 초과 자체는 결격이 아닙니다</b>. 다만 접도·건축선, 구조·방화, 인근 일조권에 현저한 지장이 없어야 합니다.</div>
    <button class="btn btn-main" data-open="checks">✅ 요건·제외구역 직접 체크</button>`;
}

function sheetCompare(b) {
  const R = S.R;
  b.innerHTML = `
    <table class="tbl"><tr><th>항목</th><th>양성화 전<br><small>(대장)</small></th><th>현황<br><small>(위반 포함)</small></th><th>양성화 후<br><small>(권장안)</small></th><th>기준</th></tr>
    ${R.compare.map((c) => `<tr><td>${c.label}</td><td>${f2(c.before)}${c.unit}</td><td style="color:${c.current > c.before ? "var(--bad)" : "inherit"}">${f2(c.current)}${c.unit}</td><td style="color:var(--ok);font-weight:800">${f2(c.after)}${c.unit}</td><td>${esc(c.limit)}</td></tr>`).join("")}</table>
    <h4>위반 부분별 처리</h4>
    <table class="tbl"><tr><th>위반</th><th>현황</th><th>존치</th><th>철거·보완</th></tr>
    ${R.after.kept.map((k) => `<tr><td>${esc((VIOLATION_TYPES[k.type] || {}).label || k.type)}</td><td>${f2(k.area)}㎡</td><td style="color:var(--ok)">${f2(k.keepArea)}㎡</td><td style="color:var(--bad)">${f2((+k.area || 0) - (+k.keepArea || 0))}㎡</td></tr>`).join("")}</table>
    <div class="note">권장 경로(${R.tracks.rec === "A" ? "특조법" : "건축법 추인"})의 <b>가장 제한적인 기준</b>(${esc(R.tracks[R.tracks.rec].binding?.label || "-")})에 맞추어 최소한만 줄인 결과입니다. 줄이는 순서: 옥상 증축 → 부속 → 수평 증축 → 발코니.</div>
    <button class="btn btn-main" data-open="limits">📐 기준별 한도 보기</button>`;
}

function sheetView3d(b) {
  b.innerHTML = `
    <div class="seg o" id="bigSeg" style="margin-bottom:8px"><button data-m="before">양성화 전</button><button data-m="current">현황</button><button data-m="after" class="on">양성화 후</button></div>
    <div style="position:relative;height:min(62vh,520px);border-radius:12px;overflow:hidden" id="bigWrap">
      <div id="big3d" style="width:100%;height:100%"></div>
      <div class="v-tools"><button data-bz="+">＋</button><button data-bz="-">－</button><button data-bz="fit">◎</button></div>
      <div class="v-legend"><i style="background:#FFF1D6;border:1px solid #1D2C5E"></i>대장(적법) <i style="background:#F28C38"></i>위반 <i style="background:#2FB67C"></i>존치 <i style="background:#E24A4A;opacity:.5"></i>철거 <i style="background:#4A7BD8;opacity:.5"></i>일조사선</div>
    </div>
    <p class="sub" style="font-size:12.5px;color:var(--ink-2)">한 손가락 회전 · 두 손가락 확대/이동 (PC: 드래그 회전 · 휠 확대 · 우클릭 이동)</p>
    <div class="note">파란 반투명 면은 개정 건축법 제61조 정북 일조 한계(1.5m·5m·h/2)입니다. 매스는 대장 면적으로 만든 <b>개략 모델</b>입니다.</div>`;
  S.bigMode = "after";
  if (bigView) { $("#big3d").appendChild(bigView.dom); }
  else bigView = createView($("#big3d"));
  bigView.setAuto(false);
  bigView.fit();
  bigView.update(S.P, S.R, "after");
  setTimeout(() => bigView.resize(), 60);
  $("#bigSeg").onclick = (e) => {
    const m = e.target.dataset.m; if (!m) return;
    $$("#bigSeg button").forEach((x) => x.classList.toggle("on", x === e.target));
    S.bigMode = m; bigView.update(S.P, S.R, m);
  };
  $("#bigWrap .v-tools").onclick = (e) => {
    const z = e.target.dataset.bz; if (!z) return;
    if (z === "+") bigView.zoom(0.8); else if (z === "-") bigView.zoom(1.25); else { bigView.fit(); bigView.update(S.P, S.R, S.bigMode); }
  };
}

function sheetLimits(b) {
  const R = S.R;
  const tbl = (T) => `
    <table class="tbl"><tr><th>기준</th><th>허용 한도</th><th>남길 수 있는 위반면적</th></tr>
    ${T.rows.map((r) => `<tr class="${T.binding && r.key === T.binding.key ? "bind" : ""}"><td>${esc(r.label)}<br><small>${esc(r.basis)}</small></td><td>${esc(r.limit)}</td><td>${f2(r.keep)}㎡</td></tr>`).join("")}
    </table>
    <p>▶ 가장 제한적인 기준: <b>${esc(T.binding?.label || "-")}</b><br>▶ 존치 가능 <b style="color:var(--ok)">${f2(T.keep)}㎡</b> · 최소 보완(철거·감축) <b style="color:var(--bad)">${f2(T.cut)}㎡</b></p>`;
  b.innerHTML = `
    <p>위반면적 합계 <b>${f2(R.violation.totalArea)}㎡</b> 중 기준별로 <b>얼마까지 남길 수 있는지</b> 계산했습니다. 주황 행이 가장 제한적인 기준입니다.</p>
    <h4>A. ${R.tracks.A.name} <span class="badge ${R.tracks.A.available ? "b-ok" : "b-bad"}">${R.tracks.A.available ? "적용 가능" : "대상 아님"}</span> <small>${R.tracks.A.period}</small></h4>
    ${tbl(R.tracks.A)}
    <h4>B. ${R.tracks.B.name} <small>${R.tracks.B.period}</small></h4>
    ${tbl(R.tracks.B)}
    <div class="note">용도지역 기준: ${esc(R.lim.source)} — 건폐율 ${R.lim.bcr}% · 용적률 ${R.lim.far}%.<br>
    특조법 트랙에서 일조는 「인근 주민 일조권에 현저한 지장」 여부를 건축위원회가 판단하므로, 개정 제61조 기준을 <b>보수적 참고치</b>로 썼습니다.</div>`;
}

function sheetSun(b) {
  const R = S.R, s = R.sun;
  b.innerHTML = `
    <p>${s.applies ? "전용·일반주거지역 — 정북방향 일조 높이제한 적용" : "이 용도지역은 정북 일조 높이제한(건축법 제61조①) 비적용"}</p>
    <table class="tbl"><tr><th>건물 각 부분 높이</th><th>개정 (2026.11.12~)</th><th>종전</th></tr>
      <tr><td>10m 이하</td><td>1.5m 이상</td><td>1.5m 이상</td></tr>
      <tr><td>10m 초과 ~ 17m 이하</td><td><b>5m 이상</b></td><td>높이의 1/2 (5~8.5m)</td></tr>
      <tr><td>17m 초과</td><td>높이의 1/2</td><td>높이의 1/2</td></tr></table>
    <h4>이 건물</h4>
    <table class="tbl"><tr><th></th><th>높이</th><th>정북 이격</th><th>필요 이격</th><th>판정</th></tr>
      <tr><td>대장</td><td>${f2(s.legalHeight)}m</td><td>${s.setback}m</td><td>${s.requiredForLegal}m</td><td>${s.legalOk ? "적합" : "부적합"}</td></tr>
      <tr><td>현황</td><td>${f2(s.curHeight)}m</td><td>${s.setback}m</td><td>${s.requiredForCur}m</td><td style="color:${s.curOk ? "var(--ok)" : "var(--bad)"};font-weight:800">${s.curOk ? "적합" : "부적합"}</td></tr></table>
    <p>현재 이격 ${s.setback}m에서 허용 높이: <b>${f1(s.maxHeightAtSetback)}m</b> (개정 기준) · 종전 기준이면 필요 이격 ${s.oldRule.required}m</p>
    ${s.cutArea > 0 ? `<div class="note o">옥상 증축부를 북쪽에서 <b>${f2(s.requiredForCur - s.setback)}m</b> 물리면 일조선 안으로 들어옵니다 → 감축 <b>${f2(s.cutArea)}㎡</b></div>` : ""}
    <form class="form" id="sunForm" style="margin-top:10px">
      <label>정북 인접대지경계선까지 이격(m)<input type="number" step="0.1" name="northSetback" value="${S.P.site.northSetback}"></label>
      <label class="cb"><input type="checkbox" name="northNotResidential" ${S.P.site.northNotResidential ? "checked" : ""}>정북쪽 인접 대지가 주거지역이 아님 / 도로·공원</label>
    </form>
    <div class="note">근거: 건축법 제61조① (법률 제21880호, 2026.8.11 공포, 2026.11.12 시행 — 시행 이후 허가·신고 신청분부터 적용, 부칙 제4조), 종전 건축법 시행령 제86조①. 구체 거리는 해당 지자체 건축조례 범위 내 기준.</div>`;
  $("#sunForm").oninput = (e) => {
    const t = e.target;
    if (t.name === "northSetback") S.P.site.northSetback = +t.value || 0;
    if (t.name === "northNotResidential") S.P.site.northNotResidential = t.checked;
    render();
  };
}

function sheetMoney(b) {
  const R = S.R, M = R.money;
  b.innerHTML = `
    <form class="form" id="moneyForm">
      <label>건축물 시가표준액 (원/㎡)<input type="number" step="10000" name="stdPerM2" value="${S.P.price.stdPerM2}"></label>
      <label>이미 부과·납부한 이행강제금 횟수<input type="number" min="0" name="finePaidTimes" value="${S.P.checks.finePaidTimes || 0}"></label>
      <label class="full">이미 납부한 이행강제금 합계 (원)<input type="number" step="10000" name="finePaidAmount" value="${S.P.checks.finePaidAmount || 0}"></label>
    </form>
    <h4>이행강제금 1회분 추정 (건축법 제80조)</h4>
    <table class="tbl"><tr><th>위반</th><th>산식</th><th>금액</th></tr>
      ${M.fineDetail.map((d) => `<tr><td>${esc(d.label)}</td><td style="font-size:12px">${esc(d.how)}</td><td>${won(d.amount)}</td></tr>`).join("")}
      <tr><td><b>1회 합계</b></td><td></td><td><b>${won(M.fineOnce)}</b></td></tr></table>
    <h4>특조법 과태료 (제9조)</h4>
    <p>이행강제금 <b>5회분</b>에서 이미 낸 금액을 뺀 금액 → <b style="color:var(--orange-600);font-size:18px">${won(M.specialPenalty)}</b></p>
    <div class="note">비율(시행령 제115조의3): 건폐율 초과 80% · 용적률 초과 90% · 무허가 100% · 무신고 70% (조례로 60%까지 하향 가능). 연면적 60㎡ 이하 주거용은 1/2 범위 감경. 2027.2.12부터 영리·상습 위반 가중(50~100%)과 반복부과 의무화·연도별 가중이 시행됩니다. 전세사기피해자가 매수한 피해주택은 과태료 면제(제9조① 단서).</div>`;
  $("#moneyForm").oninput = (e) => {
    const t = e.target, v = +t.value || 0;
    if (t.name === "stdPerM2") S.P.price.stdPerM2 = v; else S.P.checks[t.name] = v;
    render(); sheetMoney(b);
    const el = $(`#moneyForm [name=${t.name}]`); el.focus(); el.setSelectionRange?.(99, 99);
  };
}

function sheetUpload(b) {
  b.innerHTML = `
    <div class="drop" id="drop">📎 건축물대장 파일을 놓거나 눌러서 선택<br><small style="font-weight:600">사진(JPG·PNG) · PDF(비밀번호 보호 포함) · 세움터/정부24 저장 문서(HTML·TXT)</small></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-navy" id="camBtn">📷 카메라로 촬영</button>
      <button class="btn btn-ghost" id="pickBtn">파일 선택</button>
    </div>
    <div id="upStatus"></div>
    <div class="note">파일은 <b>이 기기 안에서만</b> 읽습니다(서버로 올리지 않음). 인식 후 값은 '대장 정보'에서 고칠 수 있습니다.<br>
    건축HUB(국토교통부 건축물대장 API)는 주소만 넣으면 서버에서 자동 조회됩니다. 세 가지(첨부·문서·건축HUB)를 함께 쓰면 서로 비어 있는 값을 채웁니다.</div>`;
  const d = $("#drop");
  d.onclick = () => { $("#fileIn").removeAttribute("capture"); $("#fileIn").click(); };
  $("#pickBtn").onclick = d.onclick;
  $("#camBtn").onclick = () => { const i = $("#fileIn"); i.setAttribute("capture", "environment"); i.accept = "image/*"; i.click(); setTimeout(() => { i.accept = "image/*,application/pdf,.pdf,.txt,.html,.htm,.xml"; i.removeAttribute("capture"); }, 500); };
  d.ondragover = (e) => { e.preventDefault(); d.classList.add("over"); };
  d.ondragleave = () => d.classList.remove("over");
  d.ondrop = (e) => { e.preventDefault(); d.classList.remove("over"); handleFiles(e.dataTransfer.files); };
  if (S.lastUpload) showUploadResult(S.lastUpload);
}

function askPassword(msg) {
  return new Promise((resolve) => {
    const st = $("#upStatus") || $("#sheetBody");
    const box = document.createElement("form");
    box.className = "form"; box.style.marginTop = "12px";
    box.innerHTML = `<div class="note o full">🔒 ${esc(msg)}<br><small>정부24 발급 PDF는 보통 발급 시 정한 비밀번호(또는 생년월일 6자리)입니다.</small></div>
      <label class="full">PDF 비밀번호<input type="password" name="pw" autocomplete="off" required></label>
      <div class="full" style="display:flex;gap:8px"><button class="btn btn-main" type="submit">열기</button><button class="btn btn-ghost" type="button" data-x>취소</button></div>`;
    st.prepend(box);
    box.pw.focus();
    box.onsubmit = (e) => { e.preventDefault(); const v = box.pw.value; box.remove(); resolve(v); };
    box.querySelector("[data-x]").onclick = () => { box.remove(); resolve(null); };
  });
}

async function handleFiles(files) {
  if (!files || !files.length) return;
  if (sheetOpen !== "upload") openSheet("upload");
  const st = $("#upStatus");
  for (const file of files) {
    const row = document.createElement("div");
    row.innerHTML = `<p><b>${esc(file.name)}</b> <span class="lbltxt">읽는 중…</span></p><div class="prog"><i></i></div>`;
    st.appendChild(row);
    const bar = row.querySelector(".prog i"), lt = row.querySelector(".lbltxt");
    try {
      const res = await readFile(file, {
        onProgress: (p, m) => { bar.style.width = Math.round(p * 100) + "%"; lt.textContent = m || ""; },
        askPassword,
      });
      bar.style.width = "100%";
      lt.textContent = `${res.method} 완료`;
      S.lastUpload = res;
      mergeParsed(res);
      showUploadResult(res, row);
    } catch (e) {
      lt.textContent = "실패: " + (e?.message || e);
      lt.style.color = "var(--bad)";
    }
  }
}

function showUploadResult(res, where) {
  const host = where || $("#upStatus");
  if (!host) return;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="found">${res.found.length ? res.found.map((f) => `<span>✓ ${esc(f)}</span>`).join("") : `<span style="background:var(--bad-bg);color:var(--bad)">인식된 항목 없음 — 더 밝고 반듯한 사진으로 다시 시도</span>`}</div>
    ${res.violations.length ? `<p>위반 내용 ${res.violations.length}건 인식 → 위반 내역에 반영</p>` : ""}
    <details style="margin-top:8px"><summary style="font-size:12.5px;font-weight:800;cursor:pointer">인식된 원문 보기</summary><div class="ocrtext">${esc(res.text.slice(0, 4000))}</div></details>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-main" data-close>결과 보기</button><button class="btn btn-ghost" data-open="register">값 확인·수정</button></div>`;
  host.appendChild(div);
}

function mergeParsed(res) {
  const P = S.P, f = res.fields;
  if (P.isSample) { P.isSample = false; }
  const map = { siteArea: ["site", "area"], zone: ["site", "zone"], archArea: ["legal", "archArea"], totArea: ["legal", "totArea"], farArea: ["legal", "farArea"], height: ["legal", "height"], floorsAbove: ["legal", "floorsAbove"], floorsBelow: ["legal", "floorsBelow"], units: ["legal", "units"], purpose: ["legal", "purpose"], structure: ["legal", "structure"], useAprDay: ["legal", "useAprDay"] };
  for (const [k, [g, key]] of Object.entries(map)) if (f[k] != null) P[g][key] = f[k];
  if (f.purpose) P.legal.category = categoryOf(f.purpose);
  if (f.violationMarked) { P.legal.violationMarked = true; P.legal.violationText = f.violationText || "위반건축물"; }
  P.violationsUnknown = false;
  if (res.violations.length) {
    P.isExample = false;
    P.violations = res.violations.map((v, i) => ({ id: "u" + i + Date.now(), ...v, height: v.type === "roofAdd" ? 2.7 : undefined, units: v.type === "unitSplit" ? 1 : undefined }));
  }
  if (!P.legal.residentialArea || P.legal.residentialArea > P.legal.totArea) P.legal.residentialArea = /주택|주거/.test(P.legal.purpose || "") ? P.legal.totArea : P.legal.residentialArea;
  P.sources = [...new Set([...(P.sources || []).filter((s) => !/샘플/.test(s)), `대장 ${res.method}`])];
  render();
  const addr = f.jibunAddress || f.roadAddress;
  const tail = (addr || "").trim().split(/\s+/).pop();
  if (addr && (!P.address.sigunguCd || !`${P.address.jibunAddress} ${P.address.roadAddress}`.includes(tail))) {
    $("#q").value = addr;
    lookup({ q: addr }, { keepLegal: true });
  }
}

function sheetRegister(b) {
  const P = S.P;
  const zoneOpts = Object.keys(ZONES).map((z) => `<option ${z === P.site.zone ? "selected" : ""}>${z}</option>`).join("");
  const purposeOpts = ["다가구주택", "다세대주택", "단독주택", "다중주택", "제1종근린생활시설", "제2종근린생활시설", "연립주택", "아파트", "기타"].map((p) => `<option ${p === P.legal.purpose ? "selected" : ""}>${p}</option>`).join("");
  b.innerHTML = `
    <p style="font-size:13px">출처: ${(P.sources || []).map(esc).join(" · ") || "-"} ${P.isSample ? '<span class="badge b-warn">샘플 예시 값</span>' : ""}</p>
    ${S.floors?.length ? `<details><summary style="font-weight:800;cursor:pointer;font-size:13px">층별 개요 (건축HUB) ${S.floors.length}개</summary><table class="tbl">${S.floors.map((x) => `<tr><td>${esc(x.flrNoNm || x.flrNo)}</td><td>${esc(x.mainPurpsCdNm || x.etcPurps)}</td><td>${f2(x.area)}㎡</td></tr>`).join("")}</table></details>` : ""}
    <form class="form" id="regForm" style="margin-top:10px">
      <label class="full">대지위치(지번)<input name="address.jibunAddress" value="${esc(P.address.jibunAddress)}"></label>
      <label>대지면적(㎡)<input type="number" step="0.01" name="site.area" value="${P.site.area}"></label>
      <label>용도지역<select name="site.zone"><option value="">선택</option>${zoneOpts}</select></label>
      <label>주용도<select name="legal.purpose">${purposeOpts}</select></label>
      ${P.legal.etcPurps ? `<label class="full">대장 기타용도 (건축HUB)<input value="${esc(P.legal.etcPurps)}" readonly></label>` : ""}
      <label>구조<input name="legal.structure" value="${esc(P.legal.structure || "")}"></label>
      <label>건축면적(㎡)<input type="number" step="0.01" name="legal.archArea" value="${P.legal.archArea}"></label>
      <label>연면적(㎡)<input type="number" step="0.01" name="legal.totArea" value="${P.legal.totArea}"></label>
      <label>용적률산정용 연면적(㎡)<input type="number" step="0.01" name="legal.farArea" value="${P.legal.farArea}"></label>
      <label>주거용 면적(㎡)<input type="number" step="0.01" name="legal.residentialArea" value="${P.legal.residentialArea ?? P.legal.totArea}"></label>
      <label>지상층수<input type="number" name="legal.floorsAbove" value="${P.legal.floorsAbove}"></label>
      <label>높이(m)<input type="number" step="0.1" name="legal.height" value="${P.legal.height}"></label>
      <label>세대·가구수<input type="number" name="legal.units" value="${P.legal.units}"></label>
      <label>세대당 최대 전용면적(㎡, 다세대)<input type="number" step="0.01" name="legal.unitExclusiveMax" value="${P.legal.unitExclusiveMax ?? ""}"></label>
      <label>사용승인일<input type="date" name="legal.useAprDay" value="${esc(P.legal.useAprDay || "")}"></label>
      <label>전면도로 너비(m)<input type="number" step="0.1" name="site.roadWidth" value="${P.site.roadWidth}"></label>
      <label>도로에 접한 길이(m)<input type="number" step="0.1" name="site.roadFrontage" value="${P.site.roadFrontage}"></label>
      <label>대지 동서 길이(m)<input type="number" step="0.1" name="site.width" value="${P.site.width ?? ""}"></label>
      <label>대지 남북 길이(m)<input type="number" step="0.1" name="site.depth" value="${P.site.depth ?? ""}"></label>
      <label class="cb full"><input type="checkbox" name="legal.violationMarked" ${P.legal.violationMarked ? "checked" : ""}>건축물대장에 '위반건축물' 표기 있음</label>
    </form>
    <div class="note">입력하는 즉시 다시 계산됩니다. 대지 형상은 브이월드 필지 경계가 있으면 자동, 없으면 면적으로 추정합니다.</div>`;
  $("#regForm").oninput = (e) => {
    const t = e.target, [g, k] = t.name.split(".");
    let v = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? null : +t.value) : t.value;
    S.P[g][k] = v;
    if (t.name === "legal.purpose") S.P.legal.category = categoryOf(v);
    if (t.name === "legal.violationMarked") S.P.violationsUnknown = false;
    if (g === "site" && (k === "width" || k === "depth")) S.P.site.dimsManual = true;
    if (S.P.isSample) { S.P.isSample = false; S.P.sources = ["직접 입력"]; }
    render();
  };
}

function sheetViolEdit(b) {
  const opts = (sel) => Object.entries(VIOLATION_TYPES).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v.label}</option>`).join("");
  const draw = () => {
    b.innerHTML = `
      <p style="font-size:13px">현장에서 대장과 다른 부분을 넣으세요. 면적은 ㎡, 위치는 층.</p>
      <div id="vl">${(S.P.violations || []).map((v, i) => `
        <div class="viol" data-i="${i}">
          <label>유형<select name="type">${opts(v.type)}</select></label>
          <label>위치(층)<input name="floor" value="${esc(v.floor || "")}"></label>
          <label>면적(㎡)<input type="number" step="0.1" name="area" value="${v.area ?? 0}"></label>
          <label>${v.type === "roofAdd" ? "높이(m)" : v.type === "unitSplit" ? "증가 가구" : v.type === "sideAdd" ? "층수" : "메모"}<input name="${v.type === "roofAdd" ? "height" : v.type === "unitSplit" ? "units" : v.type === "sideAdd" ? "floors" : "note"}" value="${esc(v.type === "roofAdd" ? v.height ?? 2.7 : v.type === "unitSplit" ? v.units ?? 1 : v.type === "sideAdd" ? v.floors ?? 1 : v.note || "")}"></label>
          <button class="del" data-del="${i}" aria-label="이 위반 삭제">✕ 삭제</button>
        </div>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-main" id="addV">＋ 위반 추가</button>${!(S.P.violations || []).length ? `<button class="btn btn-ghost" id="noV">현장 확인 — 위반 없음</button>` : ""}<button class="btn btn-ghost" data-act="example">예시 위반 넣어보기</button></div>
      <div class="note">유형별 영향: 옥상 증축 → 용적률·높이·일조 / 수평 증축 → 건폐율·용적률 / 발코니·필로티 → 용적률 / 세대분할·용도변경 → 방화·피난·주차 기준 추가 (특조법 제6조①3, 제7조①단서)</div>`;
    $("#addV").onclick = () => { S.P.violationsUnknown = false; S.P.isExample = false; S.P.violations.push({ id: "n" + Date.now(), type: "roofAdd", floor: "옥상", area: 20, height: 2.7 }); render(); draw(); };
    $("#noV") && ($("#noV").onclick = () => { S.P.violationsUnknown = false; S.P.legal.violationMarked = false; render(); back(); toast("위반 없음으로 확인했습니다"); });
    $$("[data-del]", b).forEach((x) => (x.onclick = () => { S.P.violations.splice(+x.dataset.del, 1); render(); draw(); }));
    $("#vl").oninput = $("#vl").onchange = (e) => {
      const row = e.target.closest(".viol"); if (!row) return;
      const v = S.P.violations[+row.dataset.i];
      const n = e.target.name;
      S.P.violationsUnknown = false;
      v[n] = ["area", "height", "units", "floors"].includes(n) ? +e.target.value || 0 : e.target.value;
      if (S.P.isSample) { S.P.isSample = false; }
      render();
      if (n === "type" && e.type === "change") draw();
    };
  };
  draw();
}

function sheetChecks(b) {
  const P = S.P, ex = P.checks.exclusions || (P.checks.exclusions = {}), cr = P.checks.criteria || (P.checks.criteria = {});
  b.innerHTML = `
    <form class="form" id="chkForm">
      <label class="cb full"><input type="checkbox" name="completedBy2023" ${P.checks.completedBy2023 !== false ? "checked" : ""}>2023.12.31 당시 사실상 완공 (항공사진·과세자료 등으로 입증)</label>
      ${P.legal.category === "geunsaeng" ? `<label class="cb full"><input type="checkbox" name="usedAsHouse" ${P.checks.usedAsHouse ? "checked" : ""}>근린생활시설을 2023.12.31 이전부터 주택으로 사용</label>
        <label>주택 사용 형태<select name="usedAsType"><option value="dagagu">다가구</option><option value="dasedae" ${P.checks.usedAsType === "dasedae" ? "selected" : ""}>다세대</option><option value="dandok" ${P.checks.usedAsType === "dandok" ? "selected" : ""}>단독</option></select></label>` : ""}
      ${P.legal.category === "dandok" ? `<label>단독 연면적 상한(조례, 165~330㎡)<input type="number" name="dandokOrdinanceCap" value="${P.checks.dandokOrdinanceCap || 165}"></label>` : ""}
      ${P.legal.category === "dasedae" ? `<label>위반으로 면적이 늘어난 세대 수<input type="number" name="affectedUnits" value="${P.checks.affectedUnits || 1}"></label><label>세대당 늘어난 전용면적(㎡)<input type="number" step="0.1" name="perUnitAddArea" value="${P.checks.perUnitAddArea || ""}"></label>` : ""}
      <h4 class="full">적용 제외 구역 (특조법 제3조②③) — 해당하면 체크</h4>
      ${SPECIAL_ACT.exclusions.map((e) => `<label class="cb full"><input type="checkbox" data-ex="${e.key}" ${ex[e.key] ? "checked" : ""}>${e.label} <small style="color:var(--ink-3)">${e.basis}</small></label>`).join("")}
      <h4 class="full">사용승인 기준 (제6조) — 충족하면 체크</h4>
      ${SPECIAL_ACT.approvalCriteria.map((c) => `<label class="cb full"><input type="checkbox" data-cr="${c.key}" ${cr[c.key] !== false ? "checked" : ""}>${c.label} <small style="color:var(--ink-3)">${c.basis}</small></label>`).join("")}
      <label class="cb full"><input type="checkbox" name="setbackOk" ${P.checks.setbackOk ? "checked" : ""}>(도로 3m 미만인 경우) 도로 중심선에서 1.5m 건축선 후퇴부에 건물 없음</label>
    </form>
    <div class="note">브이월드 키가 설정되면 용도지역은 자동으로 읽습니다. 도시계획시설·정비구역 등은 토지이음(eum.go.kr) 토지이용계획에서 확인하세요.</div>
    <a class="btn btn-ghost" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.eum.go.kr/web/ar/lu/luLandDet.jsp">토지이음 토지이용계획 열기 ↗</a>`;
  $("#chkForm").onchange = (e) => {
    const t = e.target;
    if (t.dataset.ex) ex[t.dataset.ex] = t.checked;
    else if (t.dataset.cr) cr[t.dataset.cr] = t.checked;
    else if (t.type === "checkbox") P.checks[t.name] = t.checked;
    else P.checks[t.name] = t.type === "number" ? +t.value : t.value;
    render();
  };
}

function sheetProcess(b) {
  const R = S.R;
  b.innerHTML = `
    <ol class="steps">
      <li><div><b>대상 확인</b> — 양성이로 1차 검토 → 관할 구청 건축과 / 특정건축물 지원센터 상담 (제5조)</div></li>
      <li><div><b>건축사 의뢰</b> — 설계도서 + 현장조사서 작성 (제4조①). 위반부 실측, 구조·방화 확인</div></li>
      <li><div><b>보완 공사</b> — 필요 시 최소 보완 ${f2(R.tracks[R.tracks.rec].cut)}㎡ 철거·감축 (일조·규모 기준), 세대 증가 시 방화·피난·소방 보강</div></li>
      <li><div><b>신고</b> — ${SPECIAL_ACT.effective} ~ ${SPECIAL_ACT.expires} 사이 시장·군수·구청장에게 신고 (기간 내 접수분은 만료 후에도 적용, 부칙 제3조)</div></li>
      <li><div><b>건축위원회 심의 · 사용승인서</b> — 신고일부터 30일 내 (제6조①)</div></li>
      <li><div><b>과태료 납부</b> — 이행강제금 5회분 − 기납부액 (제9조), 1년 내 완납 조건부 승인 가능 (제6조①4) · 추정 ${won(R.money.specialPenalty)}</div></li>
      <li><div><b>대장 정리</b> — 위반건축물 표기 해제, 대장 변경</div></li>
    </ol>
    <h4>준비 서류 체크</h4>
    <ul class="checks">
      ${["신고서 (시행령 서식)", "건축사 작성 설계도서", "건축사 작성 현장조사서", "토지 소유 증빙 또는 대지 사용승낙서", "집합건물 공용부분 변경 시 관리단 결의서", "2023.12.31 이전 완공 입증 (항공사진·재산세 과세자료 등)", "이행강제금 납부 내역"].map((t) => `<li class="ok"><span class="m">□</span><div>${t}</div></li>`).join("")}
    </ul>
    <div class="note">부설주차장: 특조법 사용승인으로 기준에 미달해도 추가 설치 의무 없음. 단, 세대·가구 증가 대수선이나 근생→주택은 설치 또는 비용 납부 (제7조, 조례로 완화·면제 가능).</div>`;
}

function sheetIssue(b) {
  const a = S.P.address;
  b.innerHTML = `
    <h4>1. 자동 조회 (지금 쓰는 방식)</h4>
    <p>주소를 넣으면 서버가 <b>국토교통부 건축HUB 건축물대장정보 API</b>로 표제부·총괄표제부·층별개요·지역지구·전유부를 자동으로 가져옵니다. 대장의 내용과 같은 공공데이터이지만 <b>법적 효력이 있는 '발급본'은 아닙니다</b>.</p>
    <h4>2. 공식 발급 (법적 효력) — 본인 인증 필요</h4>
    <p>건축물대장 발급은 정부24에서 <b>본인 인증(간편인증·공동인증서)</b>을 거쳐야 해서, 앱이 대신 자동 발급하는 것은 법적·기술적으로 허용되지 않습니다. 아래 버튼으로 바로 이동한 뒤, 받은 PDF를 📎 첨부하면 자동으로 읽습니다(비밀번호 PDF도 가능).</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-main" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A09004&CappBizCD=15000000098">정부24 건축물대장 발급 ↗</a>
      <a class="btn btn-navy" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.eais.go.kr/">세움터 열람 ↗</a>
      <a class="btn btn-ghost" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.hub.go.kr/">건축HUB ↗</a>
    </div>
    <p style="font-size:13px;margin-top:10px">복사용 주소: <b id="cpAddr">${esc(a.jibunAddress || a.roadAddress || "-")}</b> <button class="chip" id="cpBtn">복사</button></p>
    <div class="note">정부24 링크가 바뀐 경우 정부24에서 '건축물대장'을 검색하세요.</div>
    <button class="btn btn-ghost" data-open="upload">📎 발급받은 대장 첨부하기</button>`;
  $("#cpBtn").onclick = () => navigator.clipboard?.writeText($("#cpAddr").textContent).then(() => toast("주소를 복사했습니다"));
}

function sheetLaws(b) {
  b.innerHTML = `
    <p style="font-size:13px">아래 조문은 국가법령정보센터 원문과 대조했습니다 (확인일 ${LAW_CHECKED_AT}).</p>
    ${LAW_SOURCES.map((l) => `<div class="law"><b>${esc(l.title)}</b><div>${esc(l.detail)}</div><a href="${l.url}" target="_blank" rel="noopener" style="font-size:12px">원문 보기 ↗</a></div>`).join("")}
    <h4>핵심 요약 — 특조법 (법률 제21820호)</h4>
    <ul style="font-size:13.5px;padding-left:18px">
      <li>대상: 2023.12.31 당시 사실상 완공된 <b>주거용(연면적 50% 이상)</b> 특정건축물 — 다세대(세대당 전용 85㎡ 이하), 단독(165㎡ 이하, 조례로 330㎡까지), 다가구(660㎡ 이하), 주택으로 쓰던 근생 (제2조·제3조)</li>
      <li>특정건축물: 무허가·무신고 건축·대수선 / 허가 후 사용승인 못 받음 / 무단 용도변경 (제2조①1)</li>
      <li>적용 제외: 도시계획시설 부지, 개발제한구역, 군사보호구역, 접도구역, 도시개발·정비구역(지장 시), 보전산지, 재해구역 (제3조②)</li>
      <li>사용승인: 신고 후 30일 내 건축위원회 심의 — 「건축법 및 관계 법률에도 불구하고」 (제6조①)</li>
      <li>과태료: 이행강제금 5회분 (기납부분 차감) (제9조)</li>
      <li>시행 2026.12.17 · 18개월 한시 (부칙 제1·2조)</li>
    </ul>
    <h4>함께 바뀐 건축법 (법률 제21880호)</h4>
    <ul style="font-size:13.5px;padding-left:18px">
      <li>제61조① 일조: 10m 이하 1.5m · 10~17m 5m · 17m 초과 h/2 — <b>2026.11.12 시행</b></li>
      <li>제79조⑤ 위반건축물 실태조사 연 1회 이상 의무, 제80조 이행강제금 가중·반복부과 의무화, 제80조의3 위반건축물관리지침 — 2027.2.12 시행</li>
      <li>제22조의2 사용승인 건축물 사후관리 조사 — 2027.2.12 시행</li>
    </ul>`;
}

async function sheetAccount(b) {
  const u = A.auth.user;
  let list = [];
  try { list = await A.listCases(); } catch (e) { console.warn(e); }
  b.innerHTML = `
    ${A.auth.enabled ? (u ? `<p>✅ <b>${esc(u.email)}</b> 로 로그인됨 — 계정은 외부 서버(Supabase)에 저장되고, 이 기기에서 다음에 열 때 <b>자동으로 연결</b>됩니다.</p><button class="btn btn-ghost" id="outBtn">로그아웃</button>` : `
      <form class="form" id="loginForm">
        <label class="full">이메일<input type="email" name="email" autocomplete="email" required></label>
        <label class="full">비밀번호<input type="password" name="pw" autocomplete="current-password" minlength="6"></label>
        <div class="full" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-main" data-a="in">로그인</button><button class="btn btn-navy" data-a="up" type="button">회원가입</button><button class="btn btn-ghost" data-a="link" type="button">메일 링크로 로그인</button>
        </div>
      </form>
      <div class="note">로그인 정보는 외부 인증 서버에 저장되며 이 기기에는 자동 재연결용 토큰만 남습니다. 정부24·세움터 비밀번호는 저장하지 않습니다.</div>`)
      : `<div class="note o">로그인 서버(Supabase)가 아직 연결되지 않았습니다. 관리자가 Vercel 환경변수 <b>SUPABASE_URL</b>, <b>SUPABASE_ANON_KEY</b>를 넣으면 계정 로그인·자동 연결이 켜집니다. 지금은 기록이 <b>이 기기</b>에 저장됩니다.</div>`}
    <h4>현재 분석 저장</h4>
    <button class="btn btn-main" id="saveBtn">💾 저장 (${A.auth.enabled && u ? "서버" : "이 기기"})</button>
    <h4>내 기록 (${list.length})</h4>
    <div>${list.map((c, i) => `<div class="law" style="display:flex;gap:8px;align-items:center"><div style="flex:1"><b>${esc(c.title)}</b><div>${new Date(c.created_at).toLocaleString("ko-KR")} · ${c.where === "server" ? "서버" : "이 기기"}</div></div><button class="chip" data-load="${i}">열기</button><button class="chip" data-delc="${i}">삭제</button></div>`).join("") || "<p>아직 없습니다.</p>"}</div>`;
  $("#saveBtn").onclick = async () => {
    try { const w = await A.saveCase(S.P.address.jibunAddress || S.P.address.roadAddress || "분석", S.P); toast(w === "server" ? "서버에 저장했습니다" : "이 기기에 저장했습니다"); sheetAccount(b); } catch (e) { toast("저장 실패: " + e.message); }
  };
  $$("[data-load]", b).forEach((x) => (x.onclick = () => { S.P = structuredClone(list[+x.dataset.load].payload); render(); back(); }));
  $$("[data-delc]", b).forEach((x) => (x.onclick = async () => { await A.deleteCase(list[+x.dataset.delc]); sheetAccount(b); }));
  $("#outBtn") && ($("#outBtn").onclick = async () => { await A.signOut(); sheetAccount(b); });
  const lf = $("#loginForm");
  if (lf) {
    lf.onclick = async (e) => {
      const a = e.target.dataset.a; if (!a) return;
      e.preventDefault();
      const email = lf.email.value.trim(), pw = lf.pw.value;
      try {
        if (a === "in") await A.signIn(email, pw);
        if (a === "up") { await A.signUp(email, pw); toast("가입 확인 메일을 보냈습니다"); }
        if (a === "link") { await A.magicLink(email); toast("로그인 링크를 메일로 보냈습니다"); }
        sheetAccount(b);
      } catch (err) { toast("실패: " + (err.message || err)); }
    };
  }
}

let deferredPrompt = null;
function sheetInstall(b) {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  b.innerHTML = `
    ${deferredPrompt ? `<button class="btn btn-main" id="doInstall">⬇ 지금 설치</button>` : ""}
    <h4>${ios ? "아이폰 · 아이패드 (Safari)" : "안드로이드 (Chrome · 삼성인터넷)"}</h4>
    <ol class="steps">${ios
      ? `<li><div>Safari 아래쪽 <b>공유 버튼(□↑)</b>을 누릅니다</div></li><li><div><b>홈 화면에 추가</b>를 누릅니다</div></li><li><div>이름이 <b>양성이</b>인지 확인하고 <b>추가</b></div></li>`
      : `<li><div>오른쪽 위 <b>⋮ 메뉴</b>를 누릅니다</div></li><li><div><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누릅니다</div></li><li><div>홈 화면의 <b>양성이</b> 아이콘으로 실행</div></li>`}</ol>
    <div class="note">설치하면 주소창 없이 앱처럼 열리고, 오프라인에서도 마지막 화면과 계산 기능이 동작합니다.</div>`;
  $("#doInstall") && ($("#doInstall").onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("#installBtn").hidden = true; back(); });
}

function sheetPostcode(b) {
  b.innerHTML = `<div id="pcWrap" style="height:min(70vh,520px)"></div><p class="note">도로명·지번·건물명 모두 검색됩니다. 선택하면 바로 분석합니다.</p>`;
  loadPostcode().then((PC) => {
    new PC({
      oncomplete: (d) => {
        const bcode = d.bcode || "";
        const jibun = d.jibunAddress || d.autoJibunAddress || "";
        const m = /(산\s*)?([0-9]+)(?:-([0-9]+))?\s*$/.exec(jibun);
        const params = m && bcode.length === 10
          ? { sigunguCd: bcode.slice(0, 5), bjdongCd: bcode.slice(5, 10), bun: m[2], ji: m[3] || "0", platGbCd: m[1] ? "1" : "0", jibun, road: d.roadAddress || "" }
          : { q: d.roadAddress || jibun };
        $("#q").value = d.roadAddress || jibun;
        back();
        setTimeout(() => lookup(params), 80);
      },
      width: "100%", height: "100%",
    }).embed($("#pcWrap"));
  }).catch(() => { $("#pcWrap").innerHTML = "<p>주소검색 서비스를 불러오지 못했습니다. 주소를 직접 입력해 주세요.</p>"; });
}
function loadPostcode() {
  return new Promise((res, rej) => {
    const g = () => (window.daum && window.daum.Postcode) || (window.kakao && window.kakao.Postcode);
    if (g()) return res(g());
    const s = document.createElement("script");
    s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = () => (g() ? res(g()) : rej());
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// 예시 위반 넣기 (가상 시뮬레이션 — 실제 대장 표기가 아님)
function applyExample() {
  const sp = sampleProject();
  S.P.violations = structuredClone(sp.violations);
  S.P.legal.violationMarked = false;
  S.P.violationsUnknown = false;
  S.P.isExample = true;
  S.P.sources = [...new Set([...(S.P.sources || []), "위반내역 예시(가상)"])];
  render();
}

// ───────────────────────── 주소 → 서버 조회
async function lookup(params, { keepLegal = false, example = false } = {}) {
  loading(true, "건축물대장·필지 정보를 불러오는 중…");
  const qs = new URLSearchParams(params).toString();
  try {
    const r = await fetch(`../api/ys-lookup?${qs}`, { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => ({ ok: false, error: `서버 응답 오류 (HTTP ${r.status})` }));
    if (!j.ok) {
      if (j.needPostcode) {
        if (keepLegal) { toast("대장 값은 반영했습니다. 지도 위치는 🔎 주소검색으로 지정할 수 있습니다."); return; }
        toast(j.error); openSheet("postcode"); return;
      }
      throw new Error(j.error || "조회 실패");
    }
    applyLookup(j, params, keepLegal);
    if (example && S.P.violationsUnknown) applyExample();
  } catch (e) {
    const q = params.q || params.jibun || "";
    if (/봉천동\s*1527-11/.test(q.replace(/번지/g, "")) || (params.bun === "1527" && params.ji === "11")) {
      S.P = sampleProject();
      S.P.sources = ["샘플(예시 값) — 서버 조회 실패: " + (e.message || e)];
      render();
      toast("서버 조회가 안 되어 샘플 예시 값으로 보여드립니다.");
    } else {
      toast("조회 실패: " + (e.message || e) + " — 대장을 첨부하거나 값을 직접 입력할 수 있습니다.");
    }
  } finally { loading(false); }
}

function applyLookup(j, params, keepLegal) {
  const isSampleAddr = (j.address?.sigunguCd === "11620" && j.address?.bjdongCd === "10100" && String(+j.address?.bun) === "1527" && String(+j.address?.ji) === "11");
  const prev = S.P;
  if (!j.building && isSampleAddr && !keepLegal) {
    // 대장 서버가 응답하지 않을 때 샘플 주소는 예시 값으로 시연
    S.P = sampleProject();
    S.P.address = { ...S.P.address, ...(j.address || {}), lat: j.address?.lat || S.P.address.lat, lng: j.address?.lng || S.P.address.lng, isSeoul: true };
    S.P.parcelRing = j.parcel?.ring || null;
    S.P.sources = ["샘플(예시 값)", "건축HUB 응답 없음"];
    toast("건축HUB 응답이 없어 샘플 예시 값으로 보여드립니다.");
    render(); mapV?.fit(); view?.fit(); view?.update(S.P, S.R, S.mode);
    return;
  }
  const P = keepLegal ? prev : emptyProject();
  const a = j.address || {};
  P.address = { ...P.address, ...a, isSeoul: (a.sigunguCd || "").startsWith("11") };
  P.parcelRing = j.parcel?.ring || null;
  const t = j.building;
  const src = [];
  if (t) {
    const n = (v) => (v == null || v === "" ? null : parseFloat(v));
    if (n(t.platArea)) P.site.area = n(t.platArea);
    if (n(t.archArea)) P.legal.archArea = n(t.archArea);
    if (n(t.totArea)) P.legal.totArea = n(t.totArea);
    P.legal.farArea = n(t.vlRatEstmTotArea) || P.legal.totArea;
    P.legal.floorsAbove = n(t.grndFlrCnt) || P.legal.floorsAbove;
    P.legal.floorsBelow = n(t.ugrndFlrCnt) || 0;
    P.legal.height = n(t.heit) || 0;
    // 건축HUB는 다가구·다중주택도 주용도를 '단독주택'으로 주고 세부 용도는 기타용도(etcPurps)·층별 용도에 적는다.
    const detail = `${t.etcPurps || ""} ${(j.floors || []).map((f) => `${f.mainPurpsCdNm || ""} ${f.etcPurps || ""}`).join(" ")}`;
    const fam = parseFloat(t.fmlyCnt) || 0;
    let purpose = t.mainPurpsCdNm || P.legal.purpose;
    if (/단독주택/.test(purpose)) {
      if (/다가구/.test(detail) || fam >= 2) purpose = "다가구주택";
      else if (/다중주택/.test(detail)) purpose = "다중주택";
    }
    P.legal.purpose = purpose;
    P.legal.etcPurps = t.etcPurps || "";
    P.legal.structure = t.strctCdNm || "";
    P.legal.units = Math.max(n(t.hhldCnt) || 0, n(t.fmlyCnt) || 0, n(t.hoCnt) || 0) || 1;
    if (t.useAprDay && /^\d{8}$/.test(t.useAprDay)) P.legal.useAprDay = `${t.useAprDay.slice(0, 4)}-${t.useAprDay.slice(4, 6)}-${t.useAprDay.slice(6, 8)}`;
    P.legal.category = categoryOf(P.legal.purpose);
    src.push("건축HUB 대장");
  }
  if (j.recap && !P.site.area) P.site.area = parseFloat(j.recap.platArea) || P.site.area;
  const floors = j.floors || [];
  S.floors = floors;
  if (floors.length) {
    const res = floors.filter((f) => /주택|주거|다가구|다세대|단독/.test(`${f.mainPurpsCdNm} ${f.etcPurps}`)).reduce((s, f) => s + (parseFloat(f.area) || 0), 0);
    const below = floors.filter((f) => /지하/.test(f.flrGbCdNm || "")).reduce((s, f) => s + (parseFloat(f.area) || 0), 0);
    if (res > 0) P.legal.residentialArea = res;
    P.legal.belowArea = below;
  }
  if (!P.legal.residentialArea) P.legal.residentialArea = /주택/.test(P.legal.purpose) ? P.legal.totArea : 0;
  if (j.unitExclusiveMax) P.legal.unitExclusiveMax = j.unitExclusiveMax;
  if (j.zone) { P.site.zone = j.zone; src.push(j.parcel?.zone ? "브이월드 용도지역" : "대장 지역지구"); }
  if (j.parcel?.ring) src.push("브이월드 필지경계");
  if (!a.lat) { src.push("위치 미확인"); setTimeout(() => toast("정확한 위치를 찾지 못했습니다. '🗺️ 지도에서 선택'으로 건물을 눌러 위치를 지정하세요."), 1200); }
  else if (a.coordApprox) { src.push("위치 근사"); setTimeout(() => toast("지도 위치가 근사치입니다. '🗺️ 지도에서 선택'으로 정확한 건물을 눌러 보정하세요."), 1200); }
  const vwWarn = (j.warnings || []).find((w) => /브이월드/.test(w));
  if (vwWarn) { src.push("브이월드 실패"); setTimeout(() => toast(vwWarn), 1800); }
  P.sources = [...new Set([...(keepLegal ? (P.sources || []) : []), ...src])];
  // 건축HUB에는 위반 표기 항목이 없다 → 첨부·입력 전까지 '위반 여부 확인 필요'
  if (!keepLegal) P.violationsUnknown = !(P.violations || []).length && !P.legal.violationMarked;
  P.isSample = false;
  S.P = P;
  if (!t && !keepLegal) {
    toast(((j.warnings || [])[0] || "건축물대장을 찾지 못했습니다.") + " 대장을 첨부하거나 값을 입력하세요.");
    S.P = P; render();
    setTimeout(() => openSheet("register"), 400);
    return;
  }
  else if (!P.site.zone) toast("용도지역을 자동으로 찾지 못했습니다. '대장 정보'에서 선택해 주세요.");
  render();
  mapV?.fit();
  view?.fit(); view?.update(S.P, S.R, S.mode);
}

// ───────────────────────── 지도에서 선택
function startPick() {
  if (S.layout === "3d") setLayout("both");
  document.getElementById("viewerPanel").scrollIntoView({ behavior: "smooth" });
  mapV.pick();
  toast("지도에서 대상 건물(필지)을 누르세요");
}
async function onPick(latlng) {
  if (!S.cfg?.lookup?.vworld) {
    // 키 없는 환경: 좌표만 옮기고 주소는 검색으로
    S.P.address.lat = latlng.lat; S.P.address.lng = latlng.lng; S.P.parcelRing = null;
    render(); mapV.fit();
    toast("이 위치로 옮겼습니다. 필지 자동 인식은 브이월드 키가 필요해 주소검색을 열어드립니다.");
    setTimeout(() => openSheet("postcode"), 900);
    return;
  }
  lookup({ lat: latlng.lat.toFixed(7), lng: latlng.lng.toFixed(7) });
}

// ───────────────────────── 공통 UI
let toastT = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}
function loading(on, msg) { $("#loading").hidden = !on; if (msg) $("#loadingText").textContent = msg; }

function setLayout(l) {
  S.layout = l;
  $$("#layoutSeg button").forEach((b) => b.classList.toggle("on", b.dataset.l === l));
  const v = $("#viewer");
  v.className = "viewer " + (l === "both" ? "two" : "one");
  $("#mapBox").hidden = l === "3d";
  $("#threeBox").hidden = l === "map";
  mapV?.invalidate(); setTimeout(() => view?.resize(), 60);
}
function setMode(m) {
  S.mode = m;
  $$("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  render();
}

function bind() {
  $("#searchForm").onsubmit = (e) => {
    e.preventDefault();
    const q = $("#q").value.trim();
    if (!q) { toast("주소를 입력하세요"); return; }
    $("#q").blur();
    lookup({ q });
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act],[data-sheet],[data-open],[data-close],[data-z],[data-go]");
    if (!el) return;
    if (el.dataset.act) {
      const a = el.dataset.act;
      if (a === "postcode") openSheet("postcode");
      else if (a === "pick") startPick();
      else if (a === "upload") openSheet("upload");
      else if (a === "sample") { $("#q").value = SAMPLE_ADDRESS; lookup({ q: SAMPLE_ADDRESS }, { example: true }); }
      else if (a === "example") { applyExample(); if (sheetOpen) back(); }
      else openSheet(a);
    } else if (el.dataset.sheet) {
      if (e.target.closest("#thumbSeg")) return;
      openSheet(el.dataset.sheet);
    } else if (el.dataset.open) {
      e.preventDefault(); history.replaceState({ v: "sheet", id: el.dataset.open }, "", `#${el.dataset.open}`); openSheet(el.dataset.open, false);
    } else if (el.dataset.close != null && el.hasAttribute("data-close")) { back(); }
    else if (el.dataset.z) {
      const z = el.dataset.z;
      if (z === "map+") mapV.zoom(1); else if (z === "map-") mapV.zoom(-1); else if (z === "mapfit") mapV.fit();
      else if (z === "3d+") view.zoom(0.8); else if (z === "3d-") view.zoom(1.25); else if (z === "3dfit") view.fit();
    } else if (el.dataset.go) {
      const g = el.dataset.go;
      $$("#bnav button").forEach((b) => b.classList.toggle("on", b === el));
      if (g === "top") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (g === "map" || g === "3d") { setLayout(g === "map" ? "map" : "3d"); $("#viewerPanel").scrollIntoView({ behavior: "smooth" }); }
      else if (g === "upload") openSheet("upload");
      else if (g === "more") $("#tiles").scrollIntoView({ behavior: "smooth" });
    }
  });
  $("#ess [data-sheet=view3d]").addEventListener("keydown", (e) => { if (e.key === "Enter") openSheet("view3d"); });
  $("#sheetBack").onclick = back;
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") back(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) back(); });
  $("#layoutSeg").onclick = (e) => e.target.dataset.l && setLayout(e.target.dataset.l);
  $("#modeSeg").onclick = (e) => e.target.dataset.m && setMode(e.target.dataset.m);
  $("#thumbSeg").onclick = (e) => {
    e.stopPropagation();
    const m = e.target.dataset.m; if (!m) return;
    $$("#thumbSeg button").forEach((b) => b.classList.toggle("on", b === e.target));
    thumb?.update(S.P, S.R, m);
  };
  $("#fileIn").onchange = (e) => { handleFiles(e.target.files); e.target.value = ""; };
  $("#accountBtn").onclick = () => openSheet("account");
  // 화면 어디에 파일을 끌어다 놓아도 자동 확인
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => { if (e.target.closest("#drop")) return; e.preventDefault(); handleFiles(e.dataTransfer.files); });
  // 설치
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("#installBtn").hidden = false; });
  $("#installBtn").onclick = () => openSheet("install");
}

async function init() {
  $("#lawDate").textContent = LAW_CHECKED_AT;
  const startSheet = location.hash.slice(1);
  bind();
  setupHistory();
  try { S.cfg = await fetch("../api/ys-config").then((r) => (r.ok ? r.json() : {})); } catch { S.cfg = {}; }
  try { mapV = createMap($("#map"), { onPick, vworldKey: S.cfg.vworldKey }); } catch (e) { console.warn("지도 초기화 실패", e); }
  try { view = createView($("#three"), { scrollFriendly: matchMedia("(pointer: coarse)").matches }); } catch (e) { console.warn("3D 초기화 실패", e); }
  try { thumb = createView($("#thumb"), { thumb: true }); } catch (e) { console.warn(e); }
  render();
  mapV?.fit(); view?.fit(); view?.update(S.P, S.R, S.mode);
  // 공유 링크: ?q=주소
  const q = new URLSearchParams(location.search).get("q");
  if (q) { $("#q").value = q; lookup({ q }); }
  if (SHEETS[startSheet] && startSheet !== "postcode") openSheet(startSheet);
  A.initAuth(S.cfg).then(() => {
    const upd = () => ($("#accountBtn").textContent = A.auth.user ? "👤 " + (A.auth.user.email || "").split("@")[0] : "👤 로그인");
    upd(); A.auth.onChange(() => { upd(); renderTiles(); });
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

init();
