// 양성이 — 분석 엔진: 위반 여부 → 양성화 대상/가능 → 기준별 허용한도 → 최소 보완 규모
import { SPECIAL_ACT, SUNLIGHT, zoneLimits, FINE, VIOLATION_TYPES } from "./laws.js";

export const FLOOR_H = 3.0; // 층고 가정(m) — 대장에 높이가 없을 때
export const ROOF_ADD_H = 2.7; // 옥상 증축부 높이 가정(m)

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v, d = 0) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : d;
};

export function categoryOf(purpose = "") {
  const p = String(purpose);
  if (/다가구/.test(p)) return "dagagu";
  if (/다세대/.test(p)) return "dasedae";
  if (/연립|아파트/.test(p)) return "apt";
  if (/단독|다중주택|공관/.test(p)) return "dandok";
  if (/근린생활|근생/.test(p)) return "geunsaeng";
  return "other";
}

export const CATEGORY_LABEL = {
  dagagu: "다가구주택",
  dasedae: "다세대주택",
  dandok: "단독주택",
  apt: "연립·아파트",
  geunsaeng: "근린생활시설",
  other: "기타",
};

// 대지 형상(가로=동서 W, 세로=남북 D)과 건물 배치(정북 이격 s)를 정한다.
export function layout(P) {
  const site = Math.max(num(P.site.area, 150), 20);
  let W = num(P.site.width, 0), D = num(P.site.depth, 0);
  if (!(W > 0 && D > 0)) {
    W = Math.sqrt(site / 1.25);
    D = site / W;
  }
  const arch = Math.max(num(P.legal.archArea, site * 0.5), 5);
  const s = num(P.site.northSetback, 1.5);
  // 건물 가로/세로: 대지 비율을 따르되 정북 이격과 남측 여유(1m) 안에 들어가게
  let bw = Math.min(W - 1.0, Math.sqrt(arch * (W / D)));
  bw = Math.max(bw, 3);
  let bd = arch / bw;
  const maxD = D - s - 1.0;
  if (bd > maxD && maxD > 2) {
    bd = maxD;
    bw = Math.min(W - 0.4, arch / bd);
  }
  return { W, D, bw, bd, s, site, arch };
}

function legalHeight(P) {
  const h = num(P.legal.height, 0);
  if (h > 0) return h;
  return Math.max(1, num(P.legal.floorsAbove, 1)) * FLOOR_H;
}

export function analyze(P) {
  const site = num(P.site.area, 0);
  const zone = P.site.zone || "";
  const isSeoul = !!P.address?.isSeoul;
  const lim = zoneLimits(zone, isSeoul) || { bcr: num(P.site.bcrLimit, 60), far: num(P.site.farLimit, 200), source: "직접 입력" };
  if (num(P.site.bcrLimit, 0) > 0 && P.site.limitsManual) lim.bcr = num(P.site.bcrLimit);
  if (num(P.site.farLimit, 0) > 0 && P.site.limitsManual) lim.far = num(P.site.farLimit);

  const cat = P.legal.category || categoryOf(P.legal.purpose);
  const L = layout(P);
  const legalArch = num(P.legal.archArea, 0);
  const legalTot = num(P.legal.totArea, 0);
  const legalFarArea = num(P.legal.farArea, 0) || Math.max(0, legalTot - num(P.legal.belowArea, 0));
  const H0 = legalHeight(P);
  const floors0 = num(P.legal.floorsAbove, 1);
  const units0 = num(P.legal.units, 1);

  // ── 위반 내역 합산
  const V = (P.violations || []).filter((v) => v && v.type);
  let addArch = 0, addTot = 0, addFar = 0, addH = 0, addFloors = 0, addUnits = 0, roofArea = 0;
  const fineRows = [];
  for (const v of V) {
    const t = VIOLATION_TYPES[v.type] || {};
    const a = num(v.area, 0);
    if (v.type === "roofAdd") {
      addTot += a; addFar += a; roofArea += a;
      addH = Math.max(addH, num(v.height, ROOF_ADD_H));
      addFloors = Math.max(addFloors, 1);
    } else if (v.type === "sideAdd" || v.type === "annex") {
      addArch += a; addTot += a * Math.max(1, num(v.floors, 1)); addFar += a * Math.max(1, num(v.floors, 1));
    } else if (v.type === "balcony" || v.type === "piloti" || v.type === "floorAdd") {
      addTot += a; addFar += a;
    }
    if (v.type === "unitSplit") addUnits += Math.max(1, num(v.units, 1));
    fineRows.push({ v, t, a });
  }

  const cur = {
    arch: legalArch + addArch,
    tot: legalTot + addTot,
    farArea: legalFarArea + addFar,
    height: H0 + addH,
    floors: floors0 + addFloors,
    units: units0 + addUnits,
  };
  const before = {
    arch: legalArch, tot: legalTot, farArea: legalFarArea, height: H0, floors: floors0, units: units0,
  };
  const pct = (a) => (site > 0 ? (a / site) * 100 : 0);
  before.bcr = pct(before.arch); before.far = pct(before.farArea);
  cur.bcr = pct(cur.arch); cur.far = pct(cur.farArea);

  // ── 1. 위반건축물 여부
  const totalViolArea = V.reduce((s, v) => s + (["unitSplit", "useChange"].includes(v.type) ? 0 : num(v.area, 0)), 0);
  const marked = !!P.legal.violationMarked;
  const isViolation = marked || V.length > 0;
  const violation = {
    isViolation,
    marked,
    sources: [marked ? "건축물대장 '위반건축물' 표기" : null, V.length ? `현황 조사 위반 ${V.length}건` : null].filter(Boolean),
    items: V.map((v) => ({
      label: (VIOLATION_TYPES[v.type] || {}).label || v.type,
      area: num(v.area, 0),
      floor: v.floor || "",
      note: v.note || "",
      units: num(v.units, 0),
    })),
    totalArea: r2(totalViolArea),
    note: P.legal.violationText || "",
  };

  // ── 이행강제금 / 특조법 과태료 추정
  const std = num(P.price?.stdPerM2, 0);
  const totalStd = std * Math.max(cur.tot, 1);
  const small = (cat === "dasedae" ? num(P.legal.unitExclusiveMax, 999) : cur.tot) <= FINE.smallResidentialArea;
  let fineOnce = 0;
  const fineDetail = [];
  for (const { v, t, a } of fineRows) {
    let f = 0, how = "";
    if (t.fineKey && t.fineKey !== "other") {
      const rate = FINE.rate[t.fineKey];
      f = std * 0.5 * a * rate;
      how = `시가표준액 ${std.toLocaleString()}원 × 50% × ${a}㎡ × ${rate * 100}%`;
    } else {
      // 시행령 별표 15: 무단 용도변경 = 변경 부분 시가표준액 × 10% (1의2호),
      //                 세대·가구 증설 대수선 = 시가표준액 × 10% (1호)
      const base = a > 0 ? std * a : totalStd;
      f = base * 0.1;
      how = a > 0 ? `시가표준액 ${std.toLocaleString()}원 × ${a}㎡ × 10% (시행령 별표15)` : `건축물 시가표준액 × 10% (시행령 별표15 제1호)`;
    }
    if (small) { f /= 2; how += " × ½(60㎡ 이하 주거 감경 상한)"; }
    fineOnce += f;
    fineDetail.push({ label: t.label || v.type, amount: Math.round(f), how });
  }
  const paidTimes = num(P.checks?.finePaidTimes, 0);
  const paidAmount = num(P.checks?.finePaidAmount, 0);
  const specialPenalty = paidTimes >= SPECIAL_ACT.penaltyTimes && !P.checks?.additionalViolation
    ? 0
    : Math.max(0, fineOnce * SPECIAL_ACT.penaltyTimes - (paidTimes > 0 ? paidAmount : 0));
  const money = {
    stdPerM2: std,
    fineOnce: Math.round(fineOnce),
    fineDetail,
    specialPenalty: Math.round(specialPenalty),
    smallReduction: small,
    note: "지자체 조례·시가표준액에 따라 달라지는 추정치입니다.",
  };

  // ── 일조(정북) 검토
  const sunApplies = SUNLIGHT.zonesApplied.includes(zone) && !P.site.northNotResidential;
  const s = L.s;
  const reqLegal = SUNLIGHT.requiredNew(before.height);
  const reqCur = SUNLIGHT.requiredNew(cur.height);
  const maxHAtS = SUNLIGHT.maxHeightNew(s);
  const sun = {
    applies: sunApplies,
    setback: s,
    legalHeight: r1(before.height),
    curHeight: r1(cur.height),
    requiredForCur: r2(reqCur),
    requiredForLegal: r2(reqLegal),
    maxHeightAtSetback: r1(maxHAtS),
    curOk: !sunApplies || s >= reqCur,
    legalOk: !sunApplies || s >= reqLegal,
    oldRule: { required: r2(SUNLIGHT.requiredOld(cur.height)), ok: !sunApplies || s >= SUNLIGHT.requiredOld(cur.height) },
  };
  // 옥상 증축부가 일조선을 넘는 경우: 북측으로부터 (필요이격 - 현재이격) 만큼 후퇴 → 그 폭만큼 감축
  let sunCut = 0;
  if (sunApplies && roofArea > 0 && !sun.curOk) {
    const back = reqCur - s;
    sunCut = Math.min(roofArea, Math.max(0, back) * L.bw);
  }
  sun.cutArea = r2(sunCut);

  // ── 2. 양성화 대상 여부 (특조법 제2조·제3조)
  const ex = P.checks?.exclusions || {};
  const exclusionsHit = SPECIAL_ACT.exclusions.filter((e) => ex[e.key]);
  const completedOk = P.checks?.completedBy2023 !== false;
  const resRatio = cur.tot > 0 ? num(P.legal.residentialArea, cur.tot) / cur.tot : 1;
  const residentialOk = resRatio >= SPECIAL_ACT.residentialRatioMin || cat === "geunsaeng" && P.checks?.usedAsHouse;

  // 규모 상한
  let cap = null, capLabel = "", capValue = 0, capCur = 0;
  const ordinanceCap = num(P.checks?.dandokOrdinanceCap, SPECIAL_ACT.caps.dandok_total);
  if (cat === "dagagu" || (cat === "geunsaeng" && P.checks?.usedAsType === "dagagu")) {
    cap = SPECIAL_ACT.caps.dagagu_total; capLabel = "다가구 연면적 660㎡ 이하"; capCur = cur.tot; capValue = cap;
  } else if (cat === "dandok" || (cat === "geunsaeng" && P.checks?.usedAsType === "dandok")) {
    cap = Math.min(Math.max(ordinanceCap, SPECIAL_ACT.caps.dandok_total), SPECIAL_ACT.caps.dandok_total_ordinanceMax);
    capLabel = `단독 연면적 ${cap}㎡ 이하${cap > 165 ? " (조례)" : ""}`; capCur = cur.tot; capValue = cap;
  } else if (cat === "dasedae" || (cat === "geunsaeng" && P.checks?.usedAsType === "dasedae")) {
    cap = SPECIAL_ACT.caps.dasedae_unitExclusive;
    const unitMax = num(P.legal.unitExclusiveMax, 0);
    const perUnitAdd = num(P.checks?.perUnitAddArea, 0) || (cur.units > 0 ? (cur.tot - before.tot) / Math.max(1, num(P.checks?.affectedUnits, cur.units)) : 0);
    capLabel = "다세대 세대당 전용 85㎡ 이하"; capCur = unitMax + perUnitAdd; capValue = cap;
  }
  const typeOk = cap !== null;
  const capOk = !typeOk || capCur <= capValue + 1e-6;
  const capExcess = typeOk && !capOk ? capCur - capValue : 0;

  const targetReasons = [];
  if (!isViolation) targetReasons.push({ ok: true, text: "위반사항이 확인되지 않았습니다 — 양성화 절차가 필요 없을 수 있습니다." });
  targetReasons.push({ ok: completedOk, text: `2023.12.31 당시 사실상 완공 (제3조①)` });
  targetReasons.push({ ok: residentialOk, text: `주거용 연면적 50% 이상 (제2조①2) — 현재 ${Math.round(resRatio * 100)}%` });
  targetReasons.push({ ok: typeOk, text: typeOk ? `대상 용도: ${CATEGORY_LABEL[cat]}` : `대상 용도 아님: ${CATEGORY_LABEL[cat] || cat} (다세대·단독·다가구, 주택 사용 근생만 대상)` });
  if (typeOk) targetReasons.push({ ok: capOk, text: `${capLabel} — 현재 ${r1(capCur)}㎡${capOk ? "" : ` (${r1(capExcess)}㎡ 초과)`}${typeOk && cat !== "dasedae" && before.tot > capValue ? " · 대장(적법) 면적만으로도 초과" : ""}` });
  if (cat === "geunsaeng") targetReasons.push({ ok: !!P.checks?.usedAsHouse, text: "근생 허가 후 2023.12.31 이전부터 주택으로 사용 (제3조①3)" });
  for (const e of exclusionsHit) targetReasons.push({ ok: false, text: `적용 제외: ${e.label} (${e.basis})` });

  const isTarget = isViolation && completedOk && residentialOk && typeOk && exclusionsHit.length === 0;
  // 적법 부분만으로 이미 상한을 넘으면 위반부를 모두 철거해도 대상이 될 수 없다
  const legalOverCap = typeOk && cat !== "dasedae" && before.tot > capValue + 1e-6;
  const targetStatus = !isViolation ? "none" : !isTarget || legalOverCap ? "no" : capOk ? "yes" : "partial";

  // ── 사용승인 기준 (제6조)
  const crit = P.checks?.criteria || {};
  const roadW = num(P.site.roadWidth, 4);
  const frontage = num(P.site.roadFrontage, 2);
  // 건축법 제44조: 대지는 2m 이상 도로에 접해야 함. 특조법은 도로 최소너비를 3m로 봄(제6조①2) —
  // 3m 미만 도로는 중심선에서 1.5m 건축선 후퇴(제46조) 저촉 여부를 확인해야 하므로 '확인 필요'로 둔다.
  const roadOk = frontage >= 2 && (roadW >= SPECIAL_ACT.roadMinWidth || P.checks?.setbackOk === true);
  const unitIncrease = V.some((v) => v.type === "unitSplit") || cat === "geunsaeng";
  const approval = [
    { key: "landRight", ok: crit.landRight !== false, label: "자기 소유 대지 (또는 사용승낙)", basis: "제6조①1" },
    { key: "roadAccess", ok: roadOk && crit.roadAccess !== false, label: `접도 2m 이상 (도로너비 ${roadW}m · 접도길이 ${frontage}m)${roadW < SPECIAL_ACT.roadMinWidth ? " — 3m 미만 도로: 건축선 후퇴 확인" : ""}`, basis: "제6조①2 · 건축법 제44·46·47조" },
    { key: "sun", ok: sun.curOk, label: sunApplies ? `인근 일조권 현저한 지장 없음 — 정북 이격 ${s}m / 필요 ${sun.requiredForCur}m (개정 제61조 기준)` : "정북 일조 기준 비적용 지역", basis: "제6조①2 · 건축법 제61조" },
    { key: "safety", ok: crit.safety !== false, label: "구조안전·위생·방화 지장 없음 (건축사 현장조사)", basis: "제6조①2" },
  ];
  if (unitIncrease) approval.push({ key: "unitIncrease", ok: crit.unitIncrease !== false, label: "세대·가구 증가/주택사용: 방화·피난·내화·마감재·소방시설 준수", basis: "제6조①3" });
  approval.push({ key: "noArrears", ok: crit.noArrears !== false, label: "과태료·이행강제금 체납 없음 (1년 내 완납 조건부 가능)", basis: "제6조①4" });
  const failed = approval.filter((a) => !a.ok);
  const fixable = failed.every((a) => ["sun", "noArrears", "roadAccess"].includes(a.key));
  let possible = "no";
  if (targetStatus === "yes" && failed.length === 0) possible = "yes";
  else if ((targetStatus === "yes" || targetStatus === "partial") && fixable) possible = "conditional";
  else if (targetStatus === "none") possible = "none";

  // ── 3. 기준별 "얼마까지 남길 수 있는가" (두 트랙)
  // 트랙 A: 특조법 — 건폐율·용적률은 "건축법 및 관계 법률에도 불구하고" 적용 배제(제6조①), 규모상한·일조·접도가 한도
  const retainA = [];
  const violArea = totalViolArea;
  if (typeOk) {
    let keep = violArea;
    if (cat === "dasedae") {
      // 세대당 전용 85㎡: 세대당 초과분 × 해당 세대 수
      const affected = Math.max(1, num(P.checks?.affectedUnits, 1));
      keep = Math.max(0, violArea - Math.max(0, capExcess) * affected);
    } else {
      keep = Math.max(0, Math.min(violArea, capValue - before.tot));
    }
    retainA.push({ key: "cap", label: capLabel, limit: `${capValue}㎡`, keep: r2(keep), basis: "특조법 제3조①" });
  }
  if (roofArea > 0 && sunApplies) {
    retainA.push({ key: "sun", label: "일조(정북) — 인근 일조 현저한 지장 판단 기준", limit: `이격 ${s}m에서 높이 ${r1(maxHAtS)}m`, keep: r2(violArea - sunCut), basis: "특조법 제6조①2 · 건축법 제61조" });
  }
  retainA.push({ key: "bcrfar", label: "건폐율·용적률", limit: "적용 배제", keep: r2(violArea), basis: "특조법 제6조① (건축법 등에도 불구하고)" });

  // 트랙 B: 건축법 추인(일반 양성화) — 현행 조례 건폐율·용적률·일조 모두 충족해야
  const maxArch = site * lim.bcr / 100;
  const maxFar = site * lim.far / 100;
  const retainB = [];
  const sideViol = V.filter((v) => v.type === "sideAdd" || v.type === "annex").reduce((s2, v) => s2 + num(v.area, 0), 0);
  const keepBcrArch = Math.max(0, maxArch - before.arch);
  // 건폐율 초과 → 수평증축 중 남길 수 있는 바닥(건축면적)
  const keepByBcr = Math.min(violArea, violArea - Math.max(0, sideViol - keepBcrArch));
  retainB.push({ key: "bcr", label: `건폐율 ${lim.bcr}%`, limit: `건축면적 ${r1(maxArch)}㎡`, keep: r2(Math.max(0, keepByBcr)), basis: lim.source });
  const keepByFar = Math.max(0, Math.min(violArea, maxFar - before.farArea));
  retainB.push({ key: "far", label: `용적률 ${lim.far}%`, limit: `용적률 연면적 ${r1(maxFar)}㎡`, keep: r2(keepByFar), basis: lim.source });
  if (sunApplies && (roofArea > 0 || !sun.legalOk)) {
    retainB.push({ key: "sun", label: "일조 정북 이격 (개정 제61조)", limit: `이격 ${s}m → 높이 ${r1(maxHAtS)}m`, keep: r2(Math.max(0, violArea - sunCut)), basis: "건축법 제61조① (2026.11.12 시행)" });
  }
  if (P.site.parkingShort) retainB.push({ key: "parking", label: "부설주차장", limit: "주차장법 제19조", keep: 0, basis: "주차 대수 확보 필요" });

  const pickMin = (arr) => arr.reduce((m, x) => (m == null || x.keep < m.keep ? x : m), null);
  const minA = pickMin(retainA);
  const minB = pickMin(retainB);

  const trackA = {
    name: "특조법 양성화",
    period: `${SPECIAL_ACT.effective} ~ ${SPECIAL_ACT.expires} 신고`,
    rows: retainA,
    binding: minA,
    keep: minA ? minA.keep : 0,
    cut: r2(Math.max(0, violArea - (minA ? minA.keep : 0))),
    available: targetStatus === "yes" || targetStatus === "partial",
  };
  const trackB = {
    name: "건축법 추인 (일반 양성화)",
    period: "상시 — 현행 기준 전부 충족 시",
    rows: retainB,
    binding: minB,
    keep: minB ? minB.keep : 0,
    cut: r2(Math.max(0, violArea - (minB ? minB.keep : 0))),
    available: true,
  };

  // 추천 트랙: 특조법 가능하면 A, 아니면 B
  const rec = trackA.available ? trackA : trackB;

  // ── 양성화 후 (추천 트랙 적용, 감축은 옥상증축 → 수평증축 → 기타 순으로 배분)
  let toCut = rec.cut;
  const kept = V.map((v) => ({ ...v, keepArea: num(v.area, 0) }));
  const order = ["roofAdd", "annex", "floorAdd", "sideAdd", "balcony", "piloti"];
  for (const t of order) {
    for (const k of kept) {
      if (toCut <= 0) break;
      if (k.type !== t) continue;
      const c = Math.min(k.keepArea, toCut);
      k.keepArea = r2(k.keepArea - c);
      toCut -= c;
    }
  }
  let aArch = before.arch, aTot = before.tot, aFar = before.farArea, aH = before.height, aFloors = before.floors;
  for (const k of kept) {
    if (k.type === "roofAdd" && k.keepArea > 0) { aTot += k.keepArea; aFar += k.keepArea; aH = Math.max(aH, before.height + num(k.height, ROOF_ADD_H)); aFloors = before.floors + 1; }
    if ((k.type === "sideAdd" || k.type === "annex") && k.keepArea > 0) { aArch += k.keepArea; aTot += k.keepArea * Math.max(1, num(k.floors, 1)); aFar += k.keepArea * Math.max(1, num(k.floors, 1)); }
    if ((k.type === "balcony" || k.type === "piloti" || k.type === "floorAdd") && k.keepArea > 0) { aTot += k.keepArea; aFar += k.keepArea; }
  }
  const after = { arch: aArch, tot: aTot, farArea: aFar, height: aH, floors: aFloors, units: cur.units, bcr: pct(aArch), far: pct(aFar), kept };

  const metric = (label, unit, b, c, a, limit) => ({ label, unit, before: r2(b), current: r2(c), after: r2(a), limit });
  const compare = [
    metric("건폐율", "%", before.bcr, cur.bcr, after.bcr, `${lim.bcr}%`),
    metric("용적률", "%", before.far, cur.far, after.far, `${lim.far}%`),
    metric("연면적", "㎡", before.tot, cur.tot, after.tot, cap && cat !== "dasedae" ? `${capValue}㎡(특조법)` : "-"),
    metric("건축면적", "㎡", before.arch, cur.arch, after.arch, `${r1(maxArch)}㎡`),
    metric("지상층수", "층", before.floors, cur.floors, after.floors, "-"),
    metric("높이", "m", before.height, cur.height, after.height, sunApplies ? `${r1(maxHAtS)}m(일조)` : "-"),
    metric("세대·가구", "", before.units, cur.units, after.units, "-"),
  ];

  // ── 한 줄 요약
  let headline;
  if (!isViolation) headline = "위반사항 없음 — 건축물대장과 현황이 일치하면 양성화가 필요 없습니다.";
  else if (possible === "yes") headline = `특조법 양성화 가능 — 위반 ${r1(violArea)}㎡ 전부 존치 가능`;
  else if (possible === "conditional") headline = `조건부 가능 — 최소 ${r1(rec.cut)}㎡ 감축(보완) 후 신고`;
  else if (targetStatus === "no") headline = `특조법 대상 아님 — 일반 추인 시 ${r1(trackB.cut)}㎡ 철거 필요`;
  else headline = "추가 확인 필요";

  return {
    site, zone, lim, cat, L, before, cur, after, compare,
    violation, money, sun,
    target: { status: targetStatus, reasons: targetReasons, capExcess: r2(capExcess) },
    approval, possible,
    tracks: { A: trackA, B: trackB, rec: rec === trackA ? "A" : "B" },
    headline,
  };
}
