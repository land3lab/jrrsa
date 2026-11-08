// 양성이 — 건축물대장 텍스트(OCR·PDF·문서)에서 항목 추출
// 세움터/정부24 일반건축물대장(갑)·집합건축물대장(표제부) 양식의 라벨을 기준으로,
// OCR 잡음(띄어쓰기·줄바꿈·㎡/m2 표기 차이)에 견디도록 느슨하게 찾는다.

const NUM = "([0-9]{1,3}(?:[,.][0-9]{3})*(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?)";

function clean(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/m²|㎡|m2|M2|평방미터/g, "㎡")
    .replace(/[|│┃]/g, " ");
}

function toNum(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 라벨 뒤 maxGap 글자 안의 첫 숫자
function after(text, labelRe, maxGap = 40) {
  const re = new RegExp(labelRe.source + "[^0-9\\n]{0," + maxGap + "}" + NUM, "i");
  const m = re.exec(text);
  return m ? toNum(m[m.length - 1]) : null;
}

const ZONE_RE = /(제[1-3]종(?:전용|일반)주거지역|준주거지역|(?:중심|일반|근린|유통)상업지역|(?:전용|일반|준)공업지역|(?:보전|생산|자연)녹지지역|(?:보전|생산|계획)관리지역|농림지역|자연환경보전지역)/;
const PURPOSE_RE = /(다가구주택|다세대주택|단독주택|다중주택|연립주택|아파트|제[12]종근린생활시설|근린생활시설|공동주택|업무시설|숙박시설)/;


// 라벨 줄 → 다음 줄 값 (단위별 순서 매칭)
const T_LABELS = [
  ["farArea", /용\s*적\s*률\s*산\s*정\s*용\s*연\s*면\s*적/, "area"],
  ["siteArea", /대\s*지\s*면\s*적/, "area"],
  ["totArea", /연\s*면\s*적/, "area"],
  ["archArea", /건\s*축\s*면\s*적/, "area"],
  ["bcr", /건\s*폐\s*율/, "pct"],
  ["far", /용\s*적\s*률(?!\s*산)/, "pct"],
  ["height", /높\s*이/, "m"],
];
function tableValues(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const res = {};
  for (let i = 0; i < lines.length - 1; i++) {
    let line = lines[i];
    // 이 줄에 있는 라벨들의 위치
    const found = [];
    for (const [k, re, unit] of T_LABELS) {
      const m = new RegExp(re.source).exec(line);
      if (m) { found.push({ k, unit, at: m.index }); line = line.slice(0, m.index) + " ".repeat(m[0].length) + line.slice(m.index + m[0].length); }
    }
    if (found.length < 2) continue;
    if (/[0-9]+(?:\.[0-9]+)?\s*(㎡|%)/.test(lines[i])) continue; // 라벨과 값이 같은 줄이면 표 형식 아님
    const vals = lines[i + 1] + " " + (lines[i + 2] && !T_LABELS.some(([, re]) => re.test(lines[i + 2])) ? lines[i + 2] : "");
    const area = [...vals.matchAll(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*㎡/g)].map((m) => toNum(m[1]));
    const pct = [...vals.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*%/g)].map((m) => toNum(m[1]));
    const mm = [...vals.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*m(?![²2㎡a-z])/g)].map((m) => toNum(m[1]));
    found.sort((a, b) => a.at - b.at);
    const q = { area, pct, m: mm };
    for (const f of found) {
      const v = q[f.unit].shift();
      if (v != null && res[f.k] == null) res[f.k] = v;
    }
  }
  return res;
}

const LABEL = { siteArea: "대지면적", archArea: "건축면적", farArea: "용적률산정용 연면적", totArea: "연면적", bcr: "건폐율", far: "용적률", height: "높이", floorsAbove: "지상층수" };

export function parseRegister(raw) {
  const text = clean(raw);
  const flat = text.replace(/\n+/g, " ");
  const out = { fields: {}, found: [], violations: [], dropped: [] };
  const set = (k, v, label) => {
    if (v == null || v === "" || Number.isNaN(v)) return;
    out.fields[k] = v;
    out.found.push(label);
  };

  // ① 표 형식: 라벨이 한 줄에 여러 개 있고 다음 줄에 값이 같은 순서로 나오는 경우 (정부24 PDF)
  const tbl = tableValues(text);
  for (const [k, v] of Object.entries(tbl)) set(k, v, LABEL[k]);
  // ② 라벨 바로 뒤 숫자 (사진 OCR 등)
  if (out.fields.siteArea == null) set("siteArea", after(flat, /대\s*지\s*면\s*적/), "대지면적");
  if (out.fields.archArea == null) set("archArea", after(flat, /건\s*축\s*면\s*적/), "건축면적");
  if (out.fields.farArea == null) set("farArea", after(flat, /용\s*적\s*률\s*산\s*정\s*용\s*연\s*면\s*적/), "용적률산정용 연면적");
  // '연면적'은 '용적률산정용연면적'과 겹치므로 그 앞에 '산정용'이 없는 첫 번째를 찾는다
  {
    const re = new RegExp("(?<!산\\s*정\\s*용\\s*)연\\s*면\\s*적[^0-9\\n]{0,40}" + NUM);
    const m = re.exec(flat);
    if (m && out.fields.totArea == null) set("totArea", toNum(m[1]), "연면적");
  }
  const bcr = after(flat, /건\s*폐\s*율/, 20);
  if (bcr != null && bcr < 100 && out.fields.bcr == null) set("bcr", bcr, "건폐율");
  const far = after(flat, /(?<!산정용\s*)용\s*적\s*률(?!\s*산)/, 20);
  if (far != null && far < 2000 && out.fields.far == null) set("far", far, "용적률");
  const h = after(flat, /높\s*이/, 15);
  if (h != null && h < 300 && out.fields.height == null) set("height", h, "높이");

  const fa = /지\s*상\s*([0-9]{1,3})\s*층/.exec(flat) || /층\s*수[^0-9]{0,20}지상[^0-9]{0,5}([0-9]{1,3})/.exec(flat);
  if (fa) set("floorsAbove", toNum(fa[1]), "지상층수");
  const fb = /지\s*하\s*([0-9]{1,2})\s*층/.exec(flat);
  if (fb) set("floorsBelow", toNum(fb[1]), "지하층수");

  const units = /([0-9]{1,3})\s*(?:세대|가구|호)\s*\/?/.exec(flat.replace(/세대수|가구수|호수/g, ""));
  const hhm = /(?:호수|가구수|세대수)[^0-9]{0,30}([0-9]{1,3})\s*(?:호|가구|세대)?(?:\s*\/\s*([0-9]{1,3})\s*(?:가구|세대)?)?(?:\s*\/\s*([0-9]{1,3}))?/.exec(flat);
  if (hhm) {
    const nums = [hhm[1], hhm[2], hhm[3]].map(toNum).filter((n) => n != null);
    set("units", Math.max(...nums), "세대·가구수");
  } else if (units) set("units", toNum(units[1]), "세대·가구수");

  const z = ZONE_RE.exec(flat);
  if (z) set("zone", z[1], "용도지역");
  const pIdx = flat.search(/주\s*용\s*도/);
  const pp = (pIdx >= 0 && PURPOSE_RE.exec(flat.slice(pIdx, pIdx + 120))) || PURPOSE_RE.exec(flat);
  if (pp) set("purpose", pp[1], "주용도");
  const st = /주\s*구\s*조[^가-힣]{0,10}([가-힣]{2,15}(?:조|구조))/.exec(flat);
  if (st) set("structure", st[1], "주구조");

  const d = /사\s*용\s*승\s*인\s*일[^0-9]{0,15}((?:19|20)[0-9]{2})[.\-\s년]*([0-9]{1,2})[.\-\s월]*([0-9]{1,2})/.exec(flat);
  if (d) set("useAprDay", `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`, "사용승인일");

  const addrJ = /대\s*지\s*위\s*치\s*([가-힣0-9\s]+?(?:동|리|가)\s*[0-9]{0,2})\s*(?:지\s*번)?\s*(산?\s*[0-9]{1,5}(?:-[0-9]{1,5})?)/.exec(flat);
  if (addrJ) set("jibunAddress", `${addrJ[1].trim()} ${addrJ[2].replace(/\s/g, "")}`.replace(/\s+/g, " "), "대지위치");
  const addrR = /도\s*로\s*명\s*주\s*소\s*([가-힣0-9\s\-]+?(?:로|길)\s*[0-9]+(?:-[0-9]+)?)/.exec(flat);
  if (addrR) set("roadAddress", addrR[1].replace(/\s+/g, " ").trim(), "도로명주소");

  // 위반건축물 표기
  if (/위\s*반\s*건\s*축\s*물/.test(flat)) {
    set("violationMarked", true, "위반건축물 표기");
    // 변동사항란의 위반 문구만 (대지위치 등 다음 칸 글자가 섞이지 않게 짧게)
    const vm = (flat.match(/위\s*반[^.\n]{0,60}/g) || []).map((t) => t.split(/대\s*지\s*위\s*치|도\s*로\s*명|대\s*지\s*면\s*적/)[0].trim());
    out.fields.violationText = [...new Set(vm)].slice(0, 3).join(" / ").slice(0, 200);
  }
  // 변동사항의 위반 내용: "무단증축 30.5㎡", "옥탑 무단 증축", "무단용도변경", "세대분할" 등
  const vRe = /(옥탑|옥상|[0-9]{1,2}\s*층)?\s*(무단\s*(?:증축|신축|대수선|용도\s*변경)|불법\s*(?:증축|용도변경)|세대\s*분할|가구\s*분할|발코니\s*확장|베란다|필로티)[^0-9]{0,25}(?:([0-9]+(?:\.[0-9]+)?)\s*㎡)?/g;
  let m;
  while ((m = vRe.exec(flat))) {
    const what = m[2].replace(/\s/g, "");
    const where = (m[1] || "").replace(/\s/g, "");
    let type = "sideAdd";
    if (/옥탑|옥상/.test(where)) type = "roofAdd";
    if (/용도변경/.test(what)) type = "useChange";
    else if (/분할/.test(what)) type = "unitSplit";
    else if (/발코니|베란다/.test(what)) type = "balcony";
    else if (/필로티/.test(what)) type = "piloti";
    out.violations.push({ type, floor: where, area: toNum(m[3]) || 0, note: m[0].trim().slice(0, 60) });
  }
  // 정부24·세움터 대장 형식: "위반건축물 표기[내 역:4층 25㎡/ 옥상 24㎡ 조립식패널조 단독주택]"
  const listRe = /위\s*반\s*건\s*축\s*물\s*표\s*기\s*\[?\s*\(?\s*내\s*역\s*[:：]?\s*([^\]\)]{1,160})/g;
  let lm;
  const listed = [];
  while ((lm = listRe.exec(flat))) {
    const body = lm[1];
    const pr = /(옥\s*상|옥\s*탑|지\s*하\s*[0-9]*\s*층?|[0-9]{1,2}\s*층|필\s*로\s*티|발\s*코\s*니|주\s*차\s*장)\s*([0-9]+(?:\.[0-9]+)?)\s*㎡/g;
    let q;
    while ((q = pr.exec(body))) {
      const where = q[1].replace(/\s/g, "");
      const area = toNum(q[2]);
      let type = "floorAdd";
      if (/옥상|옥탑/.test(where)) type = "roofAdd";
      else if (/필로티|주차장/.test(where)) type = "piloti";
      else if (/발코니/.test(where)) type = "balcony";
      else if (/^1층$/.test(where)) type = "sideAdd";
      const mat = /(조립식\s*패널조|경량\s*철골조|철골조|목조|컨테이너|천막|샌드위치\s*패널)/.exec(body);
      listed.push({ type, floor: where, area, note: `대장 표기 위반: ${where} ${area}㎡${mat ? " · " + mat[1].replace(/\s/g, "") : ""}`, height: type === "roofAdd" ? 2.7 : undefined });
    }
  }
  if (listed.length) out.violations = listed; // 표기 내역이 있으면 그것이 가장 정확
  out.violations = out.violations.slice(0, 8);

  // ── 숫자 검증: 표 형식 PDF는 라벨과 값이 다른 줄에 있어 엉뚱한 값이 붙을 수 있다
  const F = out.fields, drop = (k, why) => { if (F[k] != null) { delete F[k]; out.found = out.found.filter((x) => x !== LABEL[k]); out.dropped.push(`${LABEL[k]}(${why})`); } };
  if (F.siteArea && F.archArea && F.archArea > F.siteArea * 1.01) drop("archArea", "대지면적보다 큼");
  if (F.totArea && F.archArea && F.totArea + 0.01 < F.archArea) drop("totArea", "건축면적보다 작음");
  if (F.siteArea && F.archArea && F.bcr != null) {
    const calc = (F.archArea / F.siteArea) * 100;
    if (Math.abs(calc - F.bcr) > 1.5) F.bcr = Math.round(calc * 100) / 100;
  }
  if (F.siteArea && (F.farArea || F.totArea) && F.far != null) {
    const calc = ((F.farArea || F.totArea) / F.siteArea) * 100;
    if (Math.abs(calc - F.far) > 3) F.far = Math.round(calc * 100) / 100;
  }
  if (F.far != null && F.bcr != null && F.far === F.bcr && F.totArea && F.archArea && F.totArea > F.archArea * 1.2) drop("far", "건폐율과 같은 값");
  if (F.height != null) {
    const fl = F.floorsAbove || 0;
    if ((F.bcr != null && F.height === F.bcr) || (F.far != null && F.height === F.far) || (fl && (F.height > fl * 6 || F.height < fl * 2))) drop("height", "층수와 맞지 않음");
  }
  if (F.totArea != null && F.siteArea != null && F.totArea === F.siteArea && F.floorsAbove > 1) drop("totArea", "대지면적과 같은 값");
  if (F.farArea != null && F.archArea != null && F.farArea === F.archArea && F.floorsAbove > 1) drop("farArea", "건축면적과 같은 값");
  out.isRegister = /건\s*축\s*물\s*대\s*장|대\s*지\s*위\s*치|표\s*제\s*부/.test(flat);
  return out;
}
