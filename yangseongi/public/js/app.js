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
let mapV = null, view = null, thumb = null, bigView = null, bigView2 = null;

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
  // 실제 건물 외곽선(브이월드) → 로컬 좌표, 정북 이격 자동 측정
  let bld = null;
  if (P.footprintRing && P.footprintRing.length > 2 && origin) {
    const pts = P.footprintRing.map(([la, ln]) => toLocal(origin, la, ln));
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    bld = { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    if (siteLocal && !P.site.setbackManual) {
      const siteMinZ = Math.min(...siteLocal.map((p) => p[1]));
      P.site.northSetback = Math.max(0, Math.round((bld.minZ - siteMinZ) * 10) / 10);
    }
  }
  if (!bld && siteLocal && siteLocal.length > 2 && origin) {
    const polyArea = Math.abs(siteLocal.reduce((s2, p, i) => { const q = siteLocal[(i + 1) % siteLocal.length]; return s2 + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
    const arch = +P.legal.archArea || 0;
    if (polyArea > 0 && arch > 0) {
      const k = Math.min(0.97, Math.sqrt(arch / polyArea));
      const cx = siteLocal.reduce((s2, p) => s2 + p[0], 0) / siteLocal.length, cz = siteLocal.reduce((s2, p) => s2 + p[1], 0) / siteLocal.length;
      const pts = siteLocal.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
      const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
      bld = { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), approx: true };
    }
  }
  const R = analyze(P);
  R.bld = bld;
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
  const markedNoDetail = !unknown && P.legal.violationMarked && !(P.violations || []).length;
  if (unknown) hl.className = "headline";
  if (markedNoDetail) hl.className = "headline bad";
  hl.querySelector(".t").textContent = unknown ? (P.noMarkDetected ? "첨부 대장에서 위반 표기를 찾지 못함 — 원본 대장의 표기·변동사항을 확인하거나 현장 위반을 입력하세요" : "대장 조회 완료 — 위반 여부를 확인하세요 (대장 첨부 또는 현황 입력)")
    : markedNoDetail ? "대장에 '위반건축물' 표기 — 위반 내용(위치·면적)을 입력하면 양성화 가능 여부를 계산합니다" : R.headline;
  hl.querySelector(".a").textContent = `${R.zone || "용도지역 미확인"} · ${CATEGORY_LABEL[R.cat] || ""} · 대지 ${f1(R.site)}㎡ · 특조법 신고기간 ${SPECIAL_ACT.effective} ~ ${SPECIAL_ACT.expires}`;

  // ① 위반 여부
  const V = R.violation;
  const ex = P.isExample ? ` <span class="badge b-warn">예시</span>` : "";
  $("#e1").innerHTML = markedNoDetail
    ? `<div class="big" style="color:var(--bad)">위반건축물</div>
       <div class="sub">건축물대장에 '위반건축물' 표기가 있습니다. 위반 위치·면적을 넣으면 계산합니다.</div>
       <div class="chips"><span class="chip" role="button" data-act="viol-edit">✏️ 위반 내용 입력</span></div>`
    : unknown
    ? `<div class="big" style="color:var(--warn)">확인 필요</div>
       ${P.noMarkDetected ? `<div class="sub">첨부 대장에서 '위반건축물' 표기를 찾지 못했습니다. <b>표기 미검출은 위반 없음이 아닙니다.</b></div>` : ""}
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
  if (unknown || markedNoDetail) {
    const pre = R.target.reasons.filter((r) => /용도|이하|주거용/.test(r.text));
    $("#e2").innerHTML = `<div><span class="badge b-navy">${markedNoDetail ? "위반 내용 입력 후 판정" : "위반 확인 후 판정"}</span></div>
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
  try { if (bigView && sheetOpen === "view3d") { bigView.update(S.P, S.R, S.bigPair ? "current" : S.bigMode || "after"); bigView2?.update(S.P, S.R, "after"); } } catch (e) { console.warn(e); }

  renderTiles();
}

function renderTiles() {
  const R = S.R;
  const rec = R.tracks[R.tracks.rec];
  const T = [
    ["todo", "🔎", "확인 · 보완 모아보기", "추가 자료가 필요한 항목과 다음 조치", `${todoItems().filter((t) => t.level !== "info").length}건`],
    ["report", "🖨️", "검토표 인쇄 · PDF", "상담용 한 장 보고서 (PDF 저장 가능)", ""],
    ["limits", "📐", "기준별 한도 · 최소 보완", "건폐율·용적률·일조·규모별 남길 수 있는 면적", `최소 보완 ${f1(rec.cut)}㎡`],
    ["sun", "☀️", "일조사선 검토", "개정 건축법 제61조 (2026.11.12 시행)", R.sun.applies ? (R.sun.curOk ? "적합" : `이격 ${R.sun.setback}m → 필요 ${R.sun.requiredForCur}m`) : "비적용"],
    ["money", "💰", "이행강제금 · 과태료", "특조법 과태료 = 이행강제금 5회분 − 기납부", `과태료 약 ${won(R.money.specialPenalty)}`],
    ["upload", "📎", "대장 첨부 자동확인", "이미지·PDF(비밀번호)·문서 → 자동 인식", S.lastUpload ? `${S.lastUpload.found.length}개 항목 인식` : "OCR · PDF"],
    ["register", "🏛️", "건축물대장 정보", "건축HUB 자동조회 결과 확인·수정", S.P.isSample ? "샘플 값" : (S.P.sources || []).join(", ")],
    ["viol-edit", "✏️", "위반 내역 입력", "옥탑·수평증축·발코니·세대분할 등", `${(S.P.violations || []).length}건`],
    ["checks", "✅", "대상 요건 · 제외구역", "특조법 제3조·제6조 체크리스트", ""],
    ["process", "🧾", "신고 절차 · 서류", "건축사 설계도서·현장조사서 → 30일 내 처리", ""],
    ["issue", "📄", "건축물대장 발급 · 열람", "정부24 발급 · 세움터 열람 · 건축HUB", ""],
    ["public", "🗂️", "위반건축물 공개자료", "서초구 공개 목록(CSV)과 주소 대조", S.publicRows?.length ? `${S.publicRows.length}건 불러옴` : ""],
    ["laws", "⚖️", "근거 법령 (검증)", `국가법령정보센터 대조 ${LAW_CHECKED_AT}`, ""],
    ["account", "💾", "내 기록", "로그인 없이 이 기기에 저장·불러오기", ""],
    ["install", "📱", "휴대폰에 설치", "홈 화면에 양성이 앱 추가", ""],
  ];
  // 헤드라인 아래: 확인·보완 요약
  const todo = todoItems().filter((t) => t.level !== "info");
  const ts = $("#todoStrip");
  if (ts) { ts.hidden = !todo.length; ts.innerHTML = todo.length ? `<span>🔎 확인·보완 <b>${todo.length}건</b> — ${esc(todo[0].text)}</span><button class="chip" data-sheet="todo">모아보기 ›</button><button class="chip" data-act="report">🖨️ 인쇄</button>` : ""; }
  $("#tiles").innerHTML = T.map(([id, ic, t, s, v]) => `<button class="tile" data-sheet="${id}"><span class="ic">${ic}</span><b>${t}</b><span>${esc(s)}</span>${v ? `<span class="val">${esc(v)}</span>` : ""}</button>`).join("");
}

// 추가로 확인·보완할 항목과 다음 조치
function todoItems() {
  const P = S.P, R = S.R, T = [];
  const add = (level, text, act, actLabel) => T.push({ level, text, act, actLabel });
  if (P.violationsUnknown) add("need", P.noMarkDetected ? "첨부 대장에서 위반 표기 미검출 — 최신 원본 대장(표기·변동사항) 확인" : "위반 여부 미확인 — 대장 첨부 또는 현장 위반 입력", "upload", "대장 첨부");
  if (P.legal.violationMarked && !(P.violations || []).length) add("need", "대장에 위반 표기 — 위반 위치·면적 입력", "viol-edit", "위반 입력");
  if (P.isExample) add("info", "위반 내역이 가상 예시입니다 — 실제 현황으로 바꾸세요", "viol-edit", "위반 입력");
  if (!P.site.zone) add("need", "용도지역 미확인 — 토지이용계획에서 확인", "register", "대장 정보");
  if (!P.address.lat) add("need", "지도 위치 미확인 — 지도에서 선택 또는 대지 경계 그리기", "pick", "지도에서 선택");
  if (!P.parcelRing) add("info", "대지 경계가 추정값 — 지도에 대지 경계를 그리면 정확해집니다", "draw-parcel", "대지 경계 그리기");
  if (!P.footprintRing) add("info", "건물 모양이 추정값 — 건물 외곽을 그리면 3D가 정확해집니다", "draw-building", "건물 외곽 그리기");
  if (S.upload && S.hub) {
    const keys = ["siteArea", "archArea", "totArea", "height", "floorsAbove"];
    const d = keys.filter((k) => S.upload.fields[k] != null && S.hub[k] != null && Math.abs(+S.upload.fields[k] - +S.hub[k]) > 0.05);
    if (d.length) add("need", `첨부 대장과 건축HUB 값이 다름 (${d.length}개 항목) — 원본 대조`, "register", "출처 비교");
  }
  for (const r of R.target.reasons) if (!r.ok) add("fail", r.text, "checks", "요건 체크");
  for (const a of R.approval) if (!a.ok) add("fail", `${a.label} (${a.basis})`, a.key === "sun" ? "sun" : "checks", a.key === "sun" ? "일조 검토" : "요건 체크");
  if (P.checks?.completedBy2023 !== false) add("info", "2023.12.31 이전 완공 입증자료(항공사진·과세자료) 준비", "process", "준비 서류");
  add("info", "용도지역 조례·지구단위계획 별도 제한 확인 (토지이음)", "checks", "토지이음");
  add("info", "특조법 시행령은 입법예고 중 — 신고기간·소방 기준은 공포본으로 재확인", "laws", "법령 상태");
  return T;
}

function sheetTodo(b) {
  const T = todoItems();
  const L = { fail: ["보완 필요", "b-bad"], need: ["확인 필요", "b-warn"], info: ["준비", "b-navy"] };
  const sorted = [...T.filter((t) => t.level === "fail"), ...T.filter((t) => t.level === "need"), ...T.filter((t) => t.level === "info")];
  b.innerHTML = `
    <p style="font-size:13.5px">결과를 확정하기 전에 확인하거나 보완할 항목입니다. 위에서부터 처리하세요.</p>
    <ul class="checks">${sorted.map((t) => `<li class="${t.level === "info" ? "ok" : "no"}"><span class="badge ${L[t.level][1]}" style="flex:0 0 auto">${L[t.level][0]}</span><div style="flex:1">${esc(t.text)}</div>${t.act ? `<button class="chip" data-todo="${t.act}">${esc(t.actLabel)} ›</button>` : ""}</li>`).join("")}</ul>
    <h4>다음 조치</h4>
    <ol class="steps">
      <li><div>최신 건축물대장(정부24) 발급 → 📎 첨부해서 위반 표기·변동사항 대조</div></li>
      <li><div>현장 실측으로 위반 위치·면적 확정 → ✏️ 위반 내역 수정</div></li>
      <li><div>📐 기준별 한도에서 최소 보완 규모 확인 → 보완 공사 계획</div></li>
      <li><div>건축사 상담(설계도서·현장조사서) → 관할 구청 특정건축물 지원센터 사전 상담</div></li>
      <li><div>🖨️ 검토표 인쇄해 상담 자료로 사용</div></li>
    </ol>
    <button class="btn btn-main" data-todo="report">🖨️ 검토표 인쇄</button>`;
  b.onclick = (e) => {
    const a = e.target.closest("[data-todo]")?.dataset.todo; if (!a) return;
    if (a === "pick") { back(); setTimeout(startPick, 150); }
    else if (a.startsWith("draw-")) { back(); setTimeout(() => startDrawing(a.slice(5)), 150); }
    else if (a === "report") printReport();
    else { history.replaceState({ v: "sheet", id: a }, "", `#${a}`); openSheet(a, false); }
  };
}

// 2) 검토표 인쇄 (한 장 보고서)
function printReport() {
  const P = S.P, R = S.R, V = R.violation, rec = R.tracks[R.tracks.rec];
  let img = "";
  try { img = (view || thumb)?.snapshot?.() || ""; } catch (e) { /* 3D 캡처 실패 시 생략 */ }
  const T = todoItems().filter((t) => t.level !== "info");
  const tbl = (Tk) => `<table><tr><th>기준</th><th>허용 한도</th><th>남길 수 있는 위반면적</th></tr>${Tk.rows.map((r) => `<tr${Tk.binding && r.key === Tk.binding.key ? ' class="b"' : ""}><td>${esc(r.label)}<br><small>${esc(r.basis)}</small></td><td>${esc(r.limit)}</td><td>${f2(r.keep)}㎡</td></tr>`).join("")}</table><p>가장 제한적인 기준: <b>${esc(Tk.binding?.label || "-")}</b> · 존치 ${f2(Tk.keep)}㎡ · 최소 보완 ${f2(Tk.cut)}㎡</p>`;
  $("#printArea").innerHTML = `
    <div class="pr-head"><img src="./icons/icon-96.png" alt=""><div><h1>위반건축물 양성화 사전 검토표</h1><p>양성이 · 랜드3 연구소 · 작성 ${new Date().toLocaleString("ko-KR")}</p></div></div>
    <table class="kv"><tr><th>대상</th><td>${esc(P.address.roadAddress || "")} ${esc(P.address.jibunAddress || "")}</td></tr>
      <tr><th>자료 출처</th><td>${(P.sources || []).map(esc).join(" · ")}</td></tr>
      <tr><th>대장 요약</th><td>${esc(R.zone || "용도지역 미확인")} · ${esc(P.legal.purpose || "")} · 대지 ${f2(R.site)}㎡ · 연면적 ${f2(R.before.tot)}㎡ · 지상 ${R.before.floors}층 · 높이 ${f2(R.before.height)}m</td></tr></table>
    <h2>결론</h2><p class="concl">${esc($("#headline .t").textContent || R.headline)}</p>
    <div class="four">
      <div><h3>① 위반건축물 여부</h3><p>${P.violationsUnknown ? "확인 필요" : P.legal.violationMarked && !(P.violations || []).length ? "대장에 위반 표기 — 위반 위치·면적 입력 필요" : V.isViolation ? `위반 ${f2(V.totalArea)}㎡ · ${V.items.length}건${P.isExample ? " (가상 예시)" : ""}` : "위반 없음"}</p><ul>${V.items.map((i) => `<li>${esc(i.label)} ${i.floor ? esc(i.floor) : ""} ${i.area ? f2(i.area) + "㎡" : ""}</li>`).join("")}</ul></div>
      <div><h3>② 양성화 대상·가능</h3><p>특조법 대상: ${{ yes: "대상", partial: "규모 초과(감축 시 대상)", no: "대상 아님", none: "해당 없음" }[R.target.status]}<br>판정: ${{ yes: "가능", conditional: "조건부 가능", no: "불가/추인 검토", none: "필요 없음" }[R.possible]}<br>권장: ${rec.name} · 최소 보완 ${f2(rec.cut)}㎡</p></div>
      <div><h3>③ 전후 차이</h3><table><tr><th></th><th>전</th><th>현황</th><th>후</th><th>기준</th></tr>${R.compare.map((c) => `<tr><td>${c.label}</td><td>${f2(c.before)}</td><td>${f2(c.current)}</td><td>${f2(c.after)}</td><td>${esc(c.limit)}</td></tr>`).join("")}</table></div>
      <div><h3>④ 전후 3D (양성화 후)</h3>${img ? `<img class="snap" src="${img}" alt="3D">` : "<p>3D 캡처 없음</p>"}</div>
    </div>
    <h2>기준별 한도 — ${esc(R.tracks.A.name)} (${R.tracks.A.available ? "적용 가능" : "대상 아님"})</h2>${tbl(R.tracks.A)}
    <h2>기준별 한도 — ${esc(R.tracks.B.name)}</h2>${tbl(R.tracks.B)}
    <h2>이행강제금 · 과태료 (추정)</h2><p>이행강제금 1회 약 ${won(R.money.fineOnce)} · 특조법 과태료(5회분 − 기납부) 약 ${won(R.money.specialPenalty)} · 시가표준액 ${R.money.stdPerM2.toLocaleString()}원/㎡ 가정</p>
    <h2>확인·보완 필요 (${T.length})</h2><ul>${T.map((t) => `<li>${esc(t.text)}</li>`).join("") || "<li>없음</li>"}</ul>
    <h2>근거 법령</h2><ul>${LAW_SOURCES.map((l) => `<li>[${esc(l.status || "")}] ${esc(l.title)} — ${esc(l.detail)}</li>`).join("")}</ul>
    <p class="disc">본 검토표는 입력 자료와 공개 법령에 따른 사전 검토 시뮬레이션입니다. 최종 판단은 관할 구청 건축과·건축위원회 심의와 건축사 현장조사에 따릅니다. 법령 확인일 ${LAW_CHECKED_AT}.</p>`;
  setTimeout(() => window.print(), 200);
}

// 8) 위반건축물 공개자료 (서초구 CSV 등)
async function readCsv(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if ((text.match(/\uFFFD/g) || []).length > 5) { try { text = new TextDecoder("euc-kr").decode(buf); } catch (e) { /* 그대로 */ } }
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  const find = (re) => head.findIndex((h) => re.test(h));
  const iRoad = find(/도로명/), iJibun = find(/지번|소재지|대지위치|주소/), iDate = find(/적발|일자|일시|등록/), iLat = find(/위도|lat|^y$/i), iLng = find(/경도|lon|lng|^x$/i);
  return rows.filter((r) => r.length > 1).map((r) => ({
    addr: [r[iRoad], r[iJibun]].filter(Boolean).join(" / ").trim() || r.join(" ").slice(0, 80),
    road: iRoad >= 0 ? r[iRoad] : "", jibun: iJibun >= 0 ? r[iJibun] : "", date: iDate >= 0 ? r[iDate] : "",
    lat: iLat >= 0 ? parseFloat(r[iLat]) : null, lng: iLng >= 0 ? parseFloat(r[iLng]) : null,
  }));
}

function sheetPublic(b) {
  const P = S.P;
  const list = S.publicRows || [];
  const norm = (x) => String(x || "").replace(/\s+/g, "").replace(/번지/g, "");
  const keyJ = norm((P.address.jibunAddress || "").split(" ").slice(-2).join(""));
  const keyR = norm((P.address.roadAddress || "").split(" ").slice(-2).join(""));
  const hits = list.filter((r) => (keyJ && norm(r.jibun || r.addr).includes(keyJ)) || (keyR && norm(r.road || r.addr).includes(keyR)));
  b.innerHTML = `
    <p style="font-size:13.5px">지자체가 공개한 위반건축물 목록과 대상 주소를 대조합니다. <b>목록에 없다고 위반이 없는 것은 아닙니다</b> — 조회 단서로만 쓰고 최신 대장으로 확인하세요.</p>
    <div class="law"><b>서울 서초구 위반건축물 정보 (공공데이터)</b><div>주소별 CSV · 도로명·지번·적발일 포함 · 좌표와 현재 시정 상태는 없음</div>
      <a href="https://www.data.go.kr/data/15156178/fileData.do" target="_blank" rel="noopener" style="font-size:12.5px">공공데이터포털에서 CSV 받기 ↗</a></div>
    <div class="law"><b>그 밖의 지역</b><div>확인 범위에서 자치구별 일괄 공개 목록은 찾지 못했습니다. 위도·경도가 있는 검증 CSV를 가지고 있다면 함께 불러올 수 있습니다.</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn btn-navy" id="csvPick">📂 CSV 불러오기</button>${list.length ? `<button class="btn btn-ghost" id="csvClear">목록 비우기</button>` : ""}</div>
    ${list.length ? `<p>불러온 목록 <b>${list.length}건</b> · 좌표 있는 행 ${list.filter((r) => r.lat && r.lng).length}건 (지도에 자줏빛 점으로 표시)</p>
      <h4>현재 주소와 일치 (${hits.length})</h4>
      ${hits.length ? `<table class="tbl"><tr><th>주소</th><th>적발일</th></tr>${hits.slice(0, 30).map((r) => `<tr><td>${esc(r.addr)}</td><td>${esc(r.date)}</td></tr>`).join("")}</table>` : "<p>일치하는 행이 없습니다.</p>"}` : ""}
    <div class="note">파일은 이 기기 안에서만 읽습니다.</div>`;
  $("#csvPick").onclick = () => $("#csvIn").click();
  $("#csvClear") && ($("#csvClear").onclick = () => { S.publicRows = []; S.P.publicMarks = []; render(); sheetPublic(b); });
}

// 6) 지도에 직접 그리기
function startDrawing(kind) {
  if (!mapV) return;
  if (S.layout === "3d") setLayout("both");
  $("#viewerPanel").scrollIntoView({ behavior: "smooth" });
  const label = { parcel: "대지 경계 — 꼭짓점을 3개 이상 차례로 누르세요", building: "건물 외곽 — 꼭짓점을 3개 이상 차례로 누르세요", violation: "위반 위치 — 한 점 또는 꼭짓점 3개 이상" }[kind];
  S.drawKind = kind;
  $("#drawBar .draw-on").hidden = false;
  $$("#drawBar [data-draw=parcel],#drawBar [data-draw=building],#drawBar [data-draw=violation],#drawBar [data-draw=clear]").forEach((x) => (x.hidden = true));
  $("#drawMsg").textContent = label;
  mapV.startDraw(kind, (n) => { $("#drawMsg").textContent = `${label} · ${n}점`; });
  toast(label);
}
function endDrawing(save) {
  const kind = S.drawKind;
  const pts = save ? mapV.finishDraw() : (mapV.cancelDraw(), []);
  $("#drawBar .draw-on").hidden = true;
  $$("#drawBar [data-draw]").forEach((x) => (x.hidden = false));
  $("#drawBar .draw-on").hidden = true;
  S.drawKind = null;
  if (!save) return;
  const P = S.P;
  if ((kind === "parcel" || kind === "building") && pts.length < 3) { toast("꼭짓점을 3개 이상 찍어야 합니다"); return; }
  if (kind === "violation" && !pts.length) return;
  const closed = (p) => [...p, p[0]];
  if (kind === "parcel") {
    P.parcelRing = closed(pts); P.site.dimsManual = false; P.site.setbackManual = false;
    P.address.lat = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length; P.address.lng = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
    P.sources = [...new Set([...(P.sources || []), "대지 경계 직접 그림"])];
  } else if (kind === "building") {
    P.footprintRing = closed(pts); P.site.setbackManual = false;
    P.sources = [...new Set([...(P.sources || []), "건물 외곽 직접 그림"])];
  } else {
    P.violationMarks = [...(P.violationMarks || []), pts.length >= 3 ? closed(pts) : pts.slice(0, 1)];
  }
  render(); mapV.fit(); view?.update(S.P, S.R, S.mode); view?.fit();
  toast("지도·3D·계산에 반영했습니다");
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
  account: ["💾 내 기록", sheetAccount],
  install: ["휴대폰에 설치하기", sheetInstall],
  todo: ["확인 · 보완 모아보기", sheetTodo],
  public: ["위반건축물 공개자료", sheetPublic],
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
  if (bigView) { bigView.destroy(); bigView = null; }
  if (bigView2) { bigView2.destroy(); bigView2 = null; }
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
    ${V.note && S.P.legal.violationMarked ? `<div class="note o">대장 표기: ${esc(V.note.slice(0, 120))}</div>` : ""}
    ${S.P.isExample ? `<div class="note o">지금 위반 내역은 <b>가상 예시</b>입니다. 실제 판정은 대장 첨부 또는 현황 입력으로 하세요.</div>` : ""}
    ${S.P.violationsUnknown ? `<div class="note o">건축HUB 대장 정보에는 '위반건축물' 표기 항목이 없습니다. 대장(갑) PDF·사진을 첨부하거나 현장 위반 내역을 입력하면 판정합니다.</div>` : ""}
    <h4>위반 해당사항</h4>
    ${V.items.length ? `<table class="tbl"><tr><th>내용</th><th>위치</th><th>면적</th></tr>
      ${V.items.map((i) => `<tr><td>${esc(i.label)}${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</td><td>${esc(i.floor)}</td><td>${i.area ? f2(i.area) + "㎡" : i.units ? `+${i.units}가구` : "-"}</td></tr>`).join("")}
      <tr><td><b>합계</b></td><td></td><td><b>${f2(V.totalArea)}㎡</b></td></tr></table>` : `<p>입력된 위반 내역이 없습니다.</p>`}
    <h4>위반이 바꾼 수치</h4>
    <table class="tbl"><tr><th>항목</th><th>대장</th><th>현황</th><th>기준</th></tr>
      ${R.compare.map((c) => `<tr><td>${c.label}</td><td>${f2(c.before)}${c.unit}</td><td>${f2(c.current)}${c.unit}</td><td>${esc(c.limit)}</td></tr>`).join("")}</table>
    <div class="note">${(S.P.sources || []).some((x) => /^대장 /.test(x)) ? "첨부한 대장의 <b>'위반건축물' 표기 내역</b>에서 읽은 값입니다. 면적·층수 같은 수치는 건축HUB 값을 우선합니다. 현장과 다르면 위반 내역을 고치세요." : "건축물대장(갑) 상단의 <b>'위반건축물'</b> 표기와 변동사항란의 위반 내용을 기준으로 합니다. 대장을 첨부하면 자동으로 읽습니다."}</div>
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
  const real = !!S.R.bld;
  b.innerHTML = `
    <div class="big3d-bar">
      <div class="seg o" id="bigSeg"><button data-m="before">전</button><button data-m="current">현황</button><button data-m="after" class="on">후</button></div>
      <div class="seg" id="bigLayout"><button data-bl="one" class="on">하나</button><button data-bl="pair">전·후 나란히</button></div>
      <div class="seg" id="bigViews"><button data-v="iso" class="on">3D</button><button data-v="top">위</button><button data-v="south">남측</button><button data-v="east">동측</button><button data-v="north">북측</button></div>
    </div>
    <div class="big3d-wrap" id="bigWrap">
      <div id="big3d"></div>
      <div class="v-tools"><button data-bz="+" aria-label="확대">＋</button><button data-bz="-" aria-label="축소">－</button><button data-bz="fit" aria-label="전체 보기">◎</button><button data-bz="fs" aria-label="전체화면">⛶</button></div>
      <div class="rot-tools"><button data-bz="l" aria-label="왼쪽으로 돌리기">↺</button><button data-bz="up" aria-label="위에서 보기">⤒</button><button data-bz="down" aria-label="옆에서 보기">⤓</button><button data-bz="r" aria-label="오른쪽으로 돌리기">↻</button></div>
      <div class="v-legend"><i style="background:#FFF1D6;border:1px solid #1D2C5E"></i>대장(적법) <i style="background:#F28C38"></i>위반 <i style="background:#2FB67C"></i>존치 <i style="background:#E24A4A;opacity:.5"></i>철거 <i style="background:#4A7BD8;opacity:.5"></i>일조사선</div>
    </div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:8px 0">↺ ↻ 돌리기 · ⤒ ⤓ 기울이기 · ＋－ 확대 · ⛶ 전체화면 — 손가락으로도 회전(한 손가락)·확대(두 손가락) 됩니다</p>
    <div class="note">${real ? "건물 모양은 <b>브이월드 실제 건물 외곽선</b>, 층수·높이는 건축물대장 값입니다." : "실제 건물 외곽선을 찾지 못해 <b>대장 면적으로 만든 개략 모델</b>입니다 (브이월드 건물 정보가 있는 주소는 실제 모양으로 표시)."}
    증축·철거 부분은 위치를 단순화한 상자로 표시합니다. 파란 반투명 면은 개정 건축법 제61조 정북 일조 한계(1.5m·5m·h/2)입니다.</div>`;
  S.bigMode = "after";
  // 화면이 실제로 그려진 다음 크기를 재서 만든다 (배율 어긋남 방지)
  const build = (pair) => {
    if (bigView) { bigView.destroy(); bigView = null; }
    if (bigView2) { bigView2.destroy(); bigView2 = null; }
    const host = $("#big3d");
    host.innerHTML = pair ? `<div class="pair"><div id="bigA"><span class="pair-l">BEFORE · 현황</span></div><div id="bigB"><span class="pair-l a">AFTER · 양성화 후</span></div></div>` : "";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (sheetOpen !== "view3d") return;
      bigView = createView(pair ? $("#bigA") : host);
      bigView.setAuto(false); bigView.resize();
      bigView.update(S.P, S.R, pair ? "current" : S.bigMode); bigView.view("iso");
      if (pair) {
        bigView2 = createView($("#bigB"));
        bigView2.setAuto(false); bigView2.resize();
        bigView2.update(S.P, S.R, "after"); bigView2.view("iso");
        // 한쪽을 돌리면 다른 쪽도 같이
        bigView.onCamera((p, t) => bigView2?.setCam(p, t));
        bigView2.onCamera((p, t) => bigView?.setCam(p, t));
      }
    }));
  };
  S.bigPair = false;
  if (bigView) { bigView.destroy(); bigView = null; }
  build(false);
  $("#bigLayout").onclick = (e) => {
    const l = e.target.dataset.bl; if (!l) return;
    $$("#bigLayout button").forEach((x) => x.classList.toggle("on", x === e.target));
    S.bigPair = l === "pair";
    $("#bigSeg").style.display = S.bigPair ? "none" : "";
    build(S.bigPair);
  };
  $("#bigSeg").onclick = (e) => {
    const m = e.target.dataset.m; if (!m || !bigView) return;
    $$("#bigSeg button").forEach((x) => x.classList.toggle("on", x === e.target));
    S.bigMode = m; bigView.update(S.P, S.R, m);
  };
  $("#bigViews").onclick = (e) => {
    const v = e.target.dataset.v; if (!v || !bigView) return;
    $$("#bigViews button").forEach((x) => x.classList.toggle("on", x === e.target));
    bigView.view(v); bigView2?.view(v);
  };
  $("#bigWrap .v-tools").onclick = (e) => {
    const z = e.target.dataset.bz; if (!z || !bigView) return;
    if (z === "+") bigView.zoom(0.75); else if (z === "-") bigView.zoom(1.33);
    else if (z === "l") bigView.orbit(-30, 0); else if (z === "r") bigView.orbit(30, 0);
    else if (z === "up") bigView.orbit(0, 15); else if (z === "down") bigView.orbit(0, -15);
    else if (z === "fs") toggleFull($("#bigWrap"));
    else { bigView.fit(); bigView2?.fit(); }
  };
}

function sheetLimits(b) {
  const R = S.R;
  const total = R.violation.totalArea || 0;
  const tbl = (T) => `
    <div class="lims">${T.rows.map((r) => {
      const bind = T.binding && r.key === T.binding.key;
      const pct = total > 0 ? Math.max(0, Math.min(100, (r.keep / total) * 100)) : 100;
      return `<div class="lim ${bind ? "bind" : ""}">
        <div class="lim-h"><b>${esc(r.label)}</b>${bind ? '<span class="badge b-warn">가장 제한적</span>' : ""}</div>
        <div class="lim-r"><span>허용 한도</span><b>${esc(r.limit)}</b></div>
        <div class="lim-r"><span>남길 수 있는 위반면적</span><b>${f2(r.keep)}㎡ <small>/ ${f2(total)}㎡</small></b></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <small class="lim-b">${esc(r.basis)}</small></div>`;
    }).join("")}</div>
    <p>▶ 가장 제한적인 기준: <b>${esc(T.binding?.label || "-")}</b><br>▶ 존치 가능 <b style="color:var(--ok)">${f2(T.keep)}㎡</b> · 최소 보완(철거·감축) <b style="color:var(--bad)">${f2(T.cut)}㎡</b></p>`;
  b.innerHTML = `
    <p>위반면적 합계 <b>${f2(R.violation.totalArea)}㎡</b> 중 기준별로 <b>얼마까지 남길 수 있는지</b> 계산했습니다. 막대가 짧을수록 많이 줄여야 하고, 주황 카드가 가장 제한적인 기준입니다.</p>
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
    if (t.name === "northSetback") { S.P.site.northSetback = +t.value || 0; S.P.site.setbackManual = true; }
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
  S.freshBatch = true; // 이번에 넣은 대장 기준으로 새로 분석 (이전 주소 값이 섞이지 않게)
  let okCount = 0, foundTotal = 0;
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
      showUploadResult(res, row);
      if (res.found.length) { okCount++; foundTotal += res.found.length; await mergeParsed(res); }
    } catch (e) {
      lt.textContent = "실패: " + (e?.message || e);
      lt.style.color = "var(--bad)";
    }
  }
  S.freshBatch = false;
  if (okCount) {
    // 인식이 되면 바로 결과 화면으로 — 대장만 넣어도 분석 끝
    setTimeout(() => {
      if (sheetOpen === "upload") back();
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast(`대장 분석 완료 — ${foundTotal}개 항목 인식`);
    }, 900);
  }
}

function showUploadResult(res, where) {
  const host = where || $("#upStatus");
  if (!host) return;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="found">${res.found.length ? res.found.map((f) => `<span>✓ ${esc(f)}</span>`).join("") : `<span style="background:var(--bad-bg);color:var(--bad)">인식된 항목 없음 — 더 밝고 반듯한 사진으로 다시 시도</span>`}</div>
    ${res.violations.length ? `<p>위반 내용 ${res.violations.length}건 인식 → 위반 내역에 반영: ${res.violations.map((v) => esc(`${v.floor || ""} ${v.area || ""}㎡`)).join(", ")}</p>` : ""}
    ${res.dropped?.length ? `<p style="font-size:12.5px;color:var(--warn)">표 형식이라 확실하지 않아 버린 값: ${res.dropped.map(esc).join(", ")} → 주소로 건축HUB 값을 채웁니다</p>` : ""}
    <details style="margin-top:8px"><summary style="font-size:12.5px;font-weight:800;cursor:pointer">인식된 원문 보기</summary><div class="ocrtext">${esc(res.text.slice(0, 4000))}</div></details>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-main" data-close>결과 보기</button><button class="btn btn-ghost" data-open="register">값 확인·수정</button></div>`;
  host.appendChild(div);
}

async function mergeParsed(res) {
  const f = res.fields;
  if (S.freshBatch) {
    const addr0 = f.jibunAddress || f.roadAddress || "";
    const tail0 = addr0.trim().split(/\s+/).pop();
    const same = addr0 && `${S.P.address.jibunAddress} ${S.P.address.roadAddress}`.includes(tail0);
    if (S.P.isSample || S.P.isExample || !same) {
      const keep = same && !S.P.isSample && !S.P.isExample; // 샘플 값은 버리고 실제 조회
      const keepAddr = keep ? S.P.address : null;
      const keepRing = keep ? S.P.parcelRing : null;
      S.P = emptyProject();
      if (keepAddr) { S.P.address = keepAddr; S.P.parcelRing = keepRing; }
      S.floors = [];
    }
    S.freshBatch = false;
  }
  const P = S.P;
  if (P.isSample) { P.isSample = false; }
  const map = { siteArea: ["site", "area"], zone: ["site", "zone"], archArea: ["legal", "archArea"], totArea: ["legal", "totArea"], farArea: ["legal", "farArea"], height: ["legal", "height"], floorsAbove: ["legal", "floorsAbove"], floorsBelow: ["legal", "floorsBelow"], units: ["legal", "units"], purpose: ["legal", "purpose"], structure: ["legal", "structure"], useAprDay: ["legal", "useAprDay"] };
  for (const [k, [g, key]] of Object.entries(map)) if (f[k] != null) P[g][key] = f[k];
  if (f.purpose) P.legal.category = categoryOf(f.purpose);
  if (f.violationMarked) { P.legal.violationMarked = true; P.legal.violationText = f.violationText || "위반건축물"; }
  // 위반 표기를 못 찾았다고 위반이 없는 것은 아니다 (사진 흐림·다른 쪽·표기 해제 이력 등)
  P.noMarkDetected = !f.violationMarked && !res.violations.length;
  P.violationsUnknown = P.noMarkDetected && !P.legal.violationMarked && !(P.violations || []).length;
  S.upload = { fields: { ...f }, pageOf: res.pageOf || {}, pages: res.pages || [], method: res.method, fileName: res.fileName };
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
    if (!P.address.jibunAddress) P.address.jibunAddress = f.jibunAddress || "";
    if (!P.address.roadAddress) P.address.roadAddress = f.roadAddress || "";
    await lookup({ q: addr }, { keepLegal: true });
  } else if (!addr && !P.address.sigunguCd) {
    toast("대장에서 주소를 읽지 못했습니다. 주소를 입력하면 지도·필지도 함께 분석합니다.");
  }
}

// 첨부 대장 값 · 건축HUB 값 · 계산에 쓴 값을 나란히
function sourceCompareHtml() {
  const U = S.upload, H = S.hub, P = S.P;
  if (!U && !H) return "";
  const rows = [
    ["대지면적", "siteArea", P.site.area, "㎡"], ["건축면적", "archArea", P.legal.archArea, "㎡"], ["연면적", "totArea", P.legal.totArea, "㎡"],
    ["용적률산정 연면적", "farArea", P.legal.farArea, "㎡"], ["건폐율", "bcr", null, "%"], ["용적률", "far", null, "%"],
    ["높이", "height", P.legal.height, "m"], ["지상층수", "floorsAbove", P.legal.floorsAbove, "층"], ["주용도", "purpose", P.legal.purpose, ""],
  ];
  const fmt = (v, u) => (v == null || v === "" ? "—" : `${typeof v === "number" || /^[0-9.]+$/.test(v) ? f2(+v) : esc(v)}${u && v !== "" && v != null && !isNaN(+v) ? u : ""}`);
  const diff = (a, b) => a != null && b != null && a !== "" && b !== "" && !isNaN(+a) && !isNaN(+b) && Math.abs(+a - +b) > 0.05;
  return `<details class="grp" open><summary>대장 값 출처 비교 <small>${U ? esc(U.fileName || "첨부") : "첨부 없음"} · ${H ? "건축HUB" : "건축HUB 없음"}</small></summary>
    <div style="padding:0 12px 12px;overflow-x:auto"><table class="tbl src-tbl"><tr><th>항목</th><th>첨부 대장</th><th>건축HUB</th><th>계산에 사용</th></tr>
    ${rows.map(([lab, k, used, u]) => {
      const uv = U?.fields?.[k], hv = H?.[k];
      const pg = U?.pageOf?.[k] ? `<small> (${U.pageOf[k]}쪽)</small>` : "";
      const d = diff(uv, hv);
      const usedV = used ?? (k === "bcr" ? S.R?.before?.bcr : k === "far" ? S.R?.before?.far : null);
      return `<tr class="${d ? "warn" : ""}"><td>${lab}${d ? ' <span class="badge b-warn">차이</span>' : ""}</td><td>${fmt(uv, u)}${uv != null ? pg : ""}</td><td>${fmt(hv, u)}</td><td><b>${fmt(usedV, u)}</b></td></tr>`;
    }).join("")}</table>
    <p style="font-size:12px;color:var(--ink-3);margin:6px 0 0">수치는 건축HUB(국토부 구조화 자료)를 우선하고, 위반 표기는 첨부 대장에서 확인합니다. 차이가 있으면 최신 원본 대장으로 확인하세요.</p>
    ${U?.pages?.length ? `<details style="margin-top:6px"><summary style="font-size:12.5px;font-weight:800;cursor:pointer">쪽별 인식 원문 보기 (${U.pages.length}쪽)</summary>${U.pages.map((t, i) => `<p style="font-size:12px;font-weight:800;margin:8px 0 2px">${i + 1}쪽</p><div class="ocrtext">${esc(t.slice(0, 3000))}</div>`).join("")}</details>` : ""}
    </div></details>`;
}

function sheetRegister(b) {
  const P = S.P;
  const zoneOpts = Object.keys(ZONES).map((z) => `<option ${z === P.site.zone ? "selected" : ""}>${z}</option>`).join("");
  const purposeOpts = ["다가구주택", "다세대주택", "단독주택", "다중주택", "제1종근린생활시설", "제2종근린생활시설", "연립주택", "아파트", "기타"].map((p) => `<option ${p === P.legal.purpose ? "selected" : ""}>${p}</option>`).join("");
  b.innerHTML = `
    <p style="font-size:13px">출처: ${(P.sources || []).map(esc).join(" · ") || "-"} ${P.isSample ? '<span class="badge b-warn">샘플 예시 값</span>' : ""}</p>
    ${sourceCompareHtml()}
    ${S.floors?.length ? `<details><summary style="font-weight:800;cursor:pointer;font-size:13px">층별 개요 (건축HUB) ${S.floors.length}개</summary><table class="tbl">${S.floors.map((x) => `<tr><td>${esc(x.flrNoNm || x.flrNo)}</td><td>${esc(x.mainPurpsCdNm || x.etcPurps)}</td><td>${f2(x.area)}㎡</td></tr>`).join("")}</table></details>` : ""}
    <form id="regForm" style="margin-top:10px">
      <details class="grp" open><summary>판정에 쓰는 값 <small>용도·면적·층수</small></summary><div class="form">
        <label>주용도<select name="legal.purpose">${purposeOpts}</select></label>
        <label>용도지역<select name="site.zone"><option value="">선택</option>${zoneOpts}</select></label>
        ${P.legal.etcPurps ? `<label class="full">대장 기타용도 (건축HUB)<input value="${esc(P.legal.etcPurps)}" readonly></label>` : ""}
        <label>대지면적(㎡)<input type="number" inputmode="decimal" step="0.01" name="site.area" value="${P.site.area}"></label>
        <label>연면적(㎡)<input type="number" inputmode="decimal" step="0.01" name="legal.totArea" value="${P.legal.totArea}"></label>
        <label>건축면적(㎡)<input type="number" inputmode="decimal" step="0.01" name="legal.archArea" value="${P.legal.archArea}"></label>
        <label>지상층수<input type="number" inputmode="numeric" name="legal.floorsAbove" value="${P.legal.floorsAbove}"></label>
        <label>높이(m)<input type="number" inputmode="decimal" step="0.1" name="legal.height" value="${P.legal.height}"></label>
        <label>세대·가구수<input type="number" inputmode="numeric" name="legal.units" value="${P.legal.units}"></label>
        <label class="cb full"><input type="checkbox" name="legal.violationMarked" ${P.legal.violationMarked ? "checked" : ""}>건축물대장에 '위반건축물' 표기 있음</label>
      </div></details>
      <details class="grp"><summary>대장 세부 항목 <small>지번·구조·용적률 면적·사용승인일</small></summary><div class="form">
        <label class="full">대지위치(지번)<input name="address.jibunAddress" value="${esc(P.address.jibunAddress)}"></label>
        <label>구조<input name="legal.structure" value="${esc(P.legal.structure || "")}"></label>
        <label>사용승인일<input type="date" name="legal.useAprDay" value="${esc(P.legal.useAprDay || "")}"></label>
        <label>용적률산정용 연면적(㎡)<input type="number" inputmode="decimal" step="0.01" name="legal.farArea" value="${P.legal.farArea}"></label>
        <label>주거용 면적(㎡)<input type="number" inputmode="decimal" step="0.01" name="legal.residentialArea" value="${P.legal.residentialArea ?? P.legal.totArea}"></label>
        <label class="full">세대당 최대 전용면적(㎡, 다세대)<input type="number" inputmode="decimal" step="0.01" name="legal.unitExclusiveMax" value="${P.legal.unitExclusiveMax ?? ""}"></label>
      </div></details>
      <details class="grp"><summary>대지 · 도로 <small>접도·대지 형상</small></summary><div class="form">
        <label>전면도로 너비(m)<input type="number" inputmode="decimal" step="0.1" name="site.roadWidth" value="${P.site.roadWidth}"></label>
        <label>도로에 접한 길이(m)<input type="number" inputmode="decimal" step="0.1" name="site.roadFrontage" value="${P.site.roadFrontage}"></label>
        <label>대지 동서 길이(m)<input type="number" inputmode="decimal" step="0.1" name="site.width" value="${P.site.width ?? ""}"></label>
        <label>대지 남북 길이(m)<input type="number" inputmode="decimal" step="0.1" name="site.depth" value="${P.site.depth ?? ""}"></label>
      </div></details>
    </form>
    <div class="note">입력하는 즉시 다시 계산됩니다. 대지 형상은 브이월드 필지 경계가 있으면 자동, 없으면 면적으로 추정합니다.</div>`;
  $("#regForm").oninput = (e) => {
    if (!e.target.name) return;
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
  const exHit = SPECIAL_ACT.exclusions.filter((e) => ex[e.key]).length;
  const crFail = SPECIAL_ACT.approvalCriteria.filter((c) => cr[c.key] === false).length;
  b.innerHTML = `
    <form id="chkForm">
      <details class="grp" open><summary>기본 요건 <small>완공 시기·용도</small></summary><div class="form">
      <label class="cb full"><input type="checkbox" name="completedBy2023" ${P.checks.completedBy2023 !== false ? "checked" : ""}>2023.12.31 당시 사실상 완공 (항공사진·과세자료 등으로 입증)</label>
      ${P.legal.category === "geunsaeng" ? `<label class="cb full"><input type="checkbox" name="usedAsHouse" ${P.checks.usedAsHouse ? "checked" : ""}>근린생활시설을 2023.12.31 이전부터 주택으로 사용</label>
        <label>주택 사용 형태<select name="usedAsType"><option value="dagagu">다가구</option><option value="dasedae" ${P.checks.usedAsType === "dasedae" ? "selected" : ""}>다세대</option><option value="dandok" ${P.checks.usedAsType === "dandok" ? "selected" : ""}>단독</option></select></label>` : ""}
      ${P.legal.category === "dandok" ? `<label>단독 연면적 상한(조례, 165~330㎡)<input type="number" name="dandokOrdinanceCap" value="${P.checks.dandokOrdinanceCap || 165}"></label>` : ""}
      ${P.legal.category === "dasedae" ? `<label>위반으로 면적이 늘어난 세대 수<input type="number" name="affectedUnits" value="${P.checks.affectedUnits || 1}"></label><label>세대당 늘어난 전용면적(㎡)<input type="number" step="0.1" name="perUnitAddArea" value="${P.checks.perUnitAddArea || ""}"></label>` : ""}
      </div></details>
      <details class="grp" ${exHit ? "open" : ""}><summary>적용 제외 구역 <small class="${exHit ? "bad" : "ok"}">${exHit ? `${exHit}개 해당` : "해당 없음"}</small></summary><div class="form">
      <p class="full" style="margin:0;font-size:12.5px;color:var(--ink-2)">특조법 제3조②③ — 해당하면 체크</p>
      ${SPECIAL_ACT.exclusions.map((e) => `<label class="cb full"><input type="checkbox" data-ex="${e.key}" ${ex[e.key] ? "checked" : ""}>${e.label} <small style="color:var(--ink-3)">${e.basis}</small></label>`).join("")}
      </div></details>
      <details class="grp" ${crFail ? "open" : ""}><summary>사용승인 기준 <small class="${crFail ? "bad" : "ok"}">${crFail ? `${crFail}개 미충족` : "모두 충족"}</small></summary><div class="form">
      <p class="full" style="margin:0;font-size:12.5px;color:var(--ink-2)">특조법 제6조 — 충족하면 체크</p>
      ${SPECIAL_ACT.approvalCriteria.map((c) => `<label class="cb full"><input type="checkbox" data-cr="${c.key}" ${cr[c.key] !== false ? "checked" : ""}>${c.label} <small style="color:var(--ink-3)">${c.basis}</small></label>`).join("")}
      <label class="cb full"><input type="checkbox" name="setbackOk" ${P.checks.setbackOk ? "checked" : ""}>(도로 3m 미만인 경우) 도로 중심선에서 1.5m 건축선 후퇴부에 건물 없음</label>
      </div></details>
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
    if (t.dataset.ex || t.dataset.cr) {
      // 요약 숫자만 갱신 (열린 그룹은 그대로)
      const eh = SPECIAL_ACT.exclusions.filter((x) => ex[x.key]).length, cf = SPECIAL_ACT.approvalCriteria.filter((x) => cr[x.key] === false).length;
      const sm = $$("#chkForm summary small");
      if (sm[1]) { sm[1].textContent = eh ? `${eh}개 해당` : "해당 없음"; sm[1].className = eh ? "bad" : "ok"; }
      if (sm[2]) { sm[2].textContent = cf ? `${cf}개 미충족` : "모두 충족"; sm[2].className = cf ? "bad" : "ok"; }
    }
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
    ${[["확정", "확정 법률 (공포 · 시행 예정)"], ["입법예고", "입법예고 (미확정 — 바뀔 수 있음)"], ["현행", "일반 법령 · 조례 (현행)"]].map(([k, t]) => {
      const items = LAW_SOURCES.filter((l) => (l.status || "").startsWith(k));
      return items.length ? `<h4>${t}</h4>${items.map((l) => `<div class="law"><span class="badge ${k === "확정" ? "b-ok" : k === "입법예고" ? "b-warn" : "b-navy"}">${esc(l.status)}</span> <b>${esc(l.title)}</b><div>${esc(l.detail)}</div><a href="${l.url}" target="_blank" rel="noopener" style="font-size:12px">원문 보기 ↗</a></div>`).join("")}` : "";
    }).join("")}
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
  let list = [];
  try { list = await A.listCases(); } catch (e) { console.warn(e); }
  const title = S.P.address.roadAddress || S.P.address.jibunAddress || "분석";
  b.innerHTML = `
    <p style="font-size:13.5px">로그인 없이 쓰는 앱입니다. 분석 결과는 <b>이 기기(브라우저)</b>에 저장되고, 다른 사람이나 서버로 보내지지 않습니다.</p>
    <button class="btn btn-main" id="saveBtn">💾 지금 분석 저장</button>
    <h4>저장한 기록 (${list.length})</h4>
    <div>${list.map((c, i) => `<div class="law" style="display:flex;gap:8px;align-items:center"><div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</b><div>${new Date(c.created_at).toLocaleString("ko-KR")}</div></div><button class="chip" data-load="${i}">열기</button><button class="chip" data-delc="${i}">삭제</button></div>`).join("") || "<p>아직 없습니다.</p>"}</div>
    <div class="note">브라우저 데이터를 지우면 기록도 지워집니다. 최근 50건까지 보관합니다.</div>`;
  $("#saveBtn").onclick = async () => {
    try { await A.saveCase(title, S.P); toast("이 기기에 저장했습니다"); sheetAccount(b); } catch (e) { toast("저장 실패: " + e.message); }
  };
  $$("[data-load]", b).forEach((x) => (x.onclick = () => { S.P = structuredClone(list[+x.dataset.load].payload); render(); back(); mapV?.fit(); view?.update(S.P, S.R, S.mode); view?.fit(); }));
  $$("[data-delc]", b).forEach((x) => (x.onclick = async () => { await A.deleteCase(list[+x.dataset.delc]); sheetAccount(b); }));
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
async function lookup(params, { keepLegal = false, example = false, quiet = false } = {}) {
  if (!quiet) loading(true, "건축물대장·필지 정보를 불러오는 중…");
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
    if (!keepLegal && (/봉천동\s*1527-11/.test(q.replace(/번지/g, "")) || (params.bun === "1527" && params.ji === "11"))) {
      S.P = sampleProject();
      S.P.sources = ["샘플(예시 값) — 서버 조회 실패: " + (e.message || e)];
      render();
      if (!quiet) toast("서버 조회가 안 되어 샘플 예시 값으로 보여드립니다.");
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
    if (!S.P.address.lat) S.P.sources.push("위치 미확인");
    toast("건축HUB 응답이 없어 샘플 예시 값으로 보여드립니다.");
    render(); mapV?.fit(); view?.update(S.P, S.R, S.mode); view?.fit();
    return;
  }
  if (!keepLegal) { S.hub = null; S.upload = null; }
  const P = keepLegal ? prev : emptyProject();
  const a = j.address || {};
  P.address = { ...P.address, ...a, isSeoul: (a.sigunguCd || "").startsWith("11") };
  P.parcelRing = j.parcel?.ring || null;
  P.footprintRing = j.footprint?.ring || null;
  const t = j.building;
  const src = [];
  const fromUpload = keepLegal && (P.sources || []).some((x) => /^대장 /.test(x));
  const before = fromUpload ? JSON.parse(JSON.stringify(P.legal)) : null;
  const siteBefore = fromUpload ? P.site.area : null;
  if (t) {
    S.hub = { siteArea: t.platArea, archArea: t.archArea, totArea: t.totArea, farArea: t.vlRatEstmTotArea, bcr: t.bcRat, far: t.vlRat, height: t.heit, floorsAbove: t.grndFlrCnt, floorsBelow: t.ugrndFlrCnt, purpose: [t.mainPurpsCdNm, t.etcPurps].filter(Boolean).join(" / "), structure: t.strctCdNm, useAprDay: t.useAprDay };
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
  if (fromUpload) {
    // 수치는 건축HUB(국토부 구조화 자료)가 정확 → 건축HUB 값 우선, 비어 있는 항목만 첨부 대장 값으로 채움
    if (t) {
      for (const [k, v] of Object.entries(before)) if ((P.legal[k] == null || P.legal[k] === "" || P.legal[k] === 0) && v != null) P.legal[k] = v;
      P.legal.violationMarked = before.violationMarked || P.legal.violationMarked;
      P.legal.violationText = before.violationText || P.legal.violationText;
      if (!P.site.area && siteBefore) P.site.area = siteBefore;
      src.push("수치=건축HUB · 위반=첨부 대장");
    } else {
      Object.assign(P.legal, before);
      if (siteBefore) P.site.area = siteBefore;
    }
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
  if (j.footprint?.ring) src.push("실제 건물 외곽선");
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
  view?.update(S.P, S.R, S.mode); view?.fit();
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

// ───────────────────────── 전체화면 (지원 안 되는 아이폰은 화면 가득 채우기로 대체)
function toggleFull(el) {
  if (!el) return;
  const doc = document;
  const after = () => setTimeout(() => { mapV?.invalidate(); view?.resize(); bigView?.resize(); bigView?.fit(); }, 120);
  if (doc.fullscreenElement || el.classList.contains("fs")) {
    if (doc.fullscreenElement) doc.exitFullscreen?.();
    el.classList.remove("fs"); document.body.classList.remove("fs-on");
    after(); return;
  }
  if (el.requestFullscreen) {
    el.requestFullscreen().then(after).catch(() => { el.classList.add("fs"); document.body.classList.add("fs-on"); after(); });
  } else { el.classList.add("fs"); document.body.classList.add("fs-on"); after(); }
}
document.addEventListener("fullscreenchange", () => setTimeout(() => { mapV?.invalidate(); view?.resize(); bigView?.resize(); bigView?.fit(); }, 120));

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
    const el = e.target.closest("[data-act],[data-sheet],[data-open],[data-close],[data-z],[data-go],[data-fs]");
    if (!el) return;
    if (el.dataset.act) {
      const a = el.dataset.act;
      if (a === "postcode") openSheet("postcode");
      else if (a === "pick") startPick();
      else if (a === "upload") openSheet("upload");
      else if (a === "upload-direct") $("#fileIn").click();
      else if (a === "report") printReport();
      else if (a === "sample") { $("#q").value = SAMPLE_ADDRESS; lookup({ q: SAMPLE_ADDRESS }, { example: true }); }
      else if (a === "example") { applyExample(); if (sheetOpen) back(); }
      else openSheet(a);
    } else if (el.dataset.sheet) {
      if (e.target.closest("#thumbSeg")) return;
      if (el.dataset.sheet === "report") { printReport(); return; }
      openSheet(el.dataset.sheet);
    } else if (el.dataset.open) {
      e.preventDefault(); history.replaceState({ v: "sheet", id: el.dataset.open }, "", `#${el.dataset.open}`); openSheet(el.dataset.open, false);
    } else if (el.dataset.close != null && el.hasAttribute("data-close")) { back(); }
    else if (el.dataset.fs) {
      toggleFull(document.getElementById(el.dataset.fs));
    } else if (el.dataset.z) {
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
  $("#drawBar").onclick = (e) => {
    const d = e.target.closest("[data-draw]")?.dataset.draw; if (!d) return;
    if (d === "done") endDrawing(true);
    else if (d === "cancel") endDrawing(false);
    else if (d === "undo") mapV.undoDraw();
    else if (d === "clear") { S.P.violationMarks = []; render(); toast("표시한 위반 위치를 지웠습니다"); }
    else startDrawing(d);
  };
  $("#csvIn").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      S.publicRows = await readCsv(f);
      S.P.publicMarks = S.publicRows.filter((r) => r.lat && r.lng).slice(0, 3000);
      render(); if (sheetOpen === "public") sheetPublic($("#sheetBody"));
      toast(`${S.publicRows.length}건 불러왔습니다`);
    } catch (err) { toast("CSV를 읽지 못했습니다: " + err.message); }
  };
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

function setupNavSpy() {
  if (!("IntersectionObserver" in window)) return;
  const pick = (g) => $$("#bnav button").forEach((b) => b.classList.toggle("on", b.dataset.go === g));
  const vis = new Map();
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en) => vis.set(en.target.id, en.intersectionRatio));
    let best = "ess", r = -1;
    for (const [id, v] of vis) if (v > r) { r = v; best = id; }
    pick(best === "viewerPanel" ? (S.layout === "3d" ? "3d" : "map") : best === "tiles" ? "more" : "top");
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  ["ess", "viewerPanel", "tiles"].forEach((id) => io.observe(document.getElementById(id)));
}

function setupGuide() {
  const g = $("#guide");
  if (!g) return;
  if (localStorage.getItem("ysg.guide.hidden") === "1") { g.hidden = true; return; }
  g.hidden = false;
  g.querySelector("[data-x]").onclick = () => { g.hidden = true; localStorage.setItem("ysg.guide.hidden", "1"); };
}

async function init() {
  $("#lawDate").textContent = LAW_CHECKED_AT;
  const startSheet = location.hash.slice(1);
  bind();
  setupHistory();
  setupGuide();
  setupNavSpy();
  try { S.cfg = await fetch("../api/ys-config").then((r) => (r.ok ? r.json() : {})); } catch { S.cfg = {}; }
  try { mapV = createMap($("#map"), { onPick, vworldKey: S.cfg.vworldKey }); } catch (e) { console.warn("지도 초기화 실패", e); }
  try { view = createView($("#three"), { scrollFriendly: matchMedia("(pointer: coarse)").matches, onTap: () => { if (matchMedia("(pointer: coarse)").matches) openSheet("view3d"); } }); } catch (e) { console.warn("3D 초기화 실패", e); }
  try { thumb = createView($("#thumb"), { thumb: true }); } catch (e) { console.warn(e); }
  render();
  mapV?.fit(); view?.update(S.P, S.R, S.mode); view?.fit();
  // 공유 링크: ?q=주소
  const q = new URLSearchParams(location.search).get("q");
  if (q) { $("#q").value = q; lookup({ q }); }
  else {
    // 첫 화면: 샘플 주소를 실제로 조회해서(정확한 위치·대장) 예시 위반으로 시뮬레이션
    $("#q").value = SAMPLE_ADDRESS;
    lookup({ q: SAMPLE_ADDRESS }, { example: true, quiet: true });
  }
  if (SHEETS[startSheet] && startSheet !== "postcode") openSheet(startSheet);
  // 로그인 없이 사용 — 외부 로그인 서버는 불러오지 않는다 (기록은 이 기기에만 저장)
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

init();
