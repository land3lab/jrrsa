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

export function parseRegister(raw) {
  const text = clean(raw);
  const flat = text.replace(/\n+/g, " ");
  const out = { fields: {}, found: [], violations: [] };
  const set = (k, v, label) => {
    if (v == null || v === "" || Number.isNaN(v)) return;
    out.fields[k] = v;
    out.found.push(label);
  };

  set("siteArea", after(flat, /대\s*지\s*면\s*적/), "대지면적");
  set("archArea", after(flat, /건\s*축\s*면\s*적/), "건축면적");
  const farArea = after(flat, /용\s*적\s*률\s*산\s*정\s*용\s*연\s*면\s*적/);
  set("farArea", farArea, "용적률산정용 연면적");
  // '연면적'은 '용적률산정용연면적'과 겹치므로 그 앞에 '산정용'이 없는 첫 번째를 찾는다
  {
    const re = new RegExp("(?<!산\\s*정\\s*용\\s*)연\\s*면\\s*적[^0-9\\n]{0,40}" + NUM);
    const m = re.exec(flat);
    if (m) set("totArea", toNum(m[1]), "연면적");
  }
  const bcr = after(flat, /건\s*폐\s*율/, 20);
  if (bcr != null && bcr < 100) set("bcr", bcr, "건폐율");
  const far = after(flat, /(?<!산정용\s*)용\s*적\s*률(?!\s*산)/, 20);
  if (far != null && far < 2000) set("far", far, "용적률");
  const h = after(flat, /높\s*이/, 15);
  if (h != null && h < 300) set("height", h, "높이");

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
  const p = /주\s*용\s*도[^가-힣]{0,10}([가-힣]{2,12})/.exec(flat);
  const pp = PURPOSE_RE.exec(p ? p[1] : flat);
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
  out.violations = out.violations.slice(0, 8);
  out.isRegister = /건\s*축\s*물\s*대\s*장|대\s*지\s*위\s*치|표\s*제\s*부/.test(flat);
  return out;
}
