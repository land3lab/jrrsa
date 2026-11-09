// 양성이 — 주소 한 번으로 [주소 해석 → 건축물대장(건축HUB) → 필지 경계·용도지역]을 모아 돌려준다.
//
// 입력(쿼리스트링) 중 하나:
//   q=관악구 봉천동 1527-11            (지번/도로명 아무거나)
//   sigunguCd=11620&bjdongCd=10100&bun=1527&ji=11[&platGbCd=0]   (주소검색 팝업 결과)
//   lat=37.48&lng=126.95                (지도에서 필지 클릭)
//
// 사용하는 외부 API (키는 모두 서버 환경변수 — 브라우저로 나가지 않음):
//   DATA_GO_KR_KEY  국토교통부_건축HUB_건축물대장정보 서비스 (기존 _util.js 키 재사용)
//   VWORLD_KEY      (선택) 브이월드 검색·지오코더·연속지적도·용도지역 → 좌표·필지경계·용도지역 자동
//   KAKAO_REST_KEY  (선택) 카카오 로컬 주소검색 → 법정동코드·좌표
//   JUSO_KEY        (선택) 행정안전부 도로명주소 검색 API → 법정동코드
// 키가 하나도 없으면: 지번주소는 내장 표에서 법정동코드를 찾고, 그래도 없으면 주소검색 팝업을 쓰라고 안내한다.

const HUB = "https://apis.data.go.kr/1613000/BldRgstHubService";

// 서울 25개 자치구 시군구코드 + 자주 쓰는 법정동(샘플 포함). 키 없는 환경에서 지번 주소를 풀기 위한 최소 표.
const SEOUL_GU = {
  종로구: "11110", 중구: "11140", 용산구: "11170", 성동구: "11200", 광진구: "11215", 동대문구: "11230",
  중랑구: "11260", 성북구: "11290", 강북구: "11305", 도봉구: "11320", 노원구: "11350", 은평구: "11380",
  서대문구: "11410", 마포구: "11440", 양천구: "11470", 강서구: "11500", 구로구: "11530", 금천구: "11545",
  영등포구: "11560", 동작구: "11590", 관악구: "11620", 서초구: "11650", 강남구: "11680", 송파구: "11710", 강동구: "11740",
};
const DONG = {
  "11620": { 봉천동: "10100", 신림동: "10200", 남현동: "10300" },
  "11590": { 노량진동: "10100", 상도동: "10200", 상도1동: "10300", 본동: "10400", 흑석동: "10500", 동작동: "10600", 사당동: "10700", 대방동: "10800", 신대방동: "10900" },
};

function fetchT(url, ms, opts = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}
async function getJson(url, ms = 3500, opts) {
  const r = await fetchT(url, ms, opts);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt.slice(0, 300), _status: r.status }; }
}

// 브이월드 키는 등록한 서비스 URL(도메인)과 함께 호출해야 한다. 서버 호출이라 domain 파라미터로 알려준다.
// 공식 주소. 브이월드 키의 '서비스 URL'과 같아야 한다 (Vercel 환경변수 VWORLD_DOMAIN 으로 바꿀 수 있음).
const CANONICAL = "https://yangseongi.land3lab.com";
let VW_DOMAIN = process.env.VWORLD_DOMAIN || CANONICAL;
const vwErrors = [];
function vwCheck(j, what) {
  const st = j?.response?.status;
  if (j && st && st !== "OK" && st !== "NOT_FOUND") vwErrors.push(`${what}: ${j.response?.error?.text || j.response?.error?.code || st}`);
  if (!j) vwErrors.push(`${what}: 응답 없음`);
  if (j && j._raw) vwErrors.push(`${what}: ${String(j._raw).slice(0, 120)}`);
}
let VW_ALT = ""; // 이 요청이 들어온 주소 (공식 주소가 아직 브이월드에 등록 전일 때 대비)
const domQ = (d) => (d ? `&domain=${encodeURIComponent(d)}` : "");
// 브이월드 호출: 등록 도메인 불일치(인증 오류)면 들어온 주소로 한 번 더 시도하고, 되면 그 요청 동안 그 주소를 쓴다
async function vwJson(u, ms) {
  const j = await getJson(u.replace("__DOM__", domQ(VW_DOMAIN)), ms).catch(() => null);
  const st = j?.response?.status;
  const errTxt = `${j?.response?.error?.code || ""} ${j?.response?.error?.text || ""} ${j?._raw || ""}`;
  if ((st === "ERROR" || j?._raw || !j) && /INCORRECT_KEY|INVALID|도메인|domain|인증/i.test(errTxt) && VW_ALT && VW_ALT !== VW_DOMAIN) {
    const j2 = await getJson(u.replace("__DOM__", domQ(VW_ALT)), ms).catch(() => null);
    if (j2?.response?.status && j2.response.status !== "ERROR") { VW_DOMAIN = VW_ALT; return j2; }
  }
  return j;
}

function pad4(n) { return String(parseInt(n || "0", 10) || 0).padStart(4, "0"); }

function fromPnu(pnu) {
  if (!pnu || pnu.length < 19) return null;
  return {
    sigunguCd: pnu.slice(0, 5), bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0", // PNU 1=대지,2=산 → 건축HUB 0=대지,1=산
    bun: pnu.slice(11, 15), ji: pnu.slice(15, 19),
  };
}
function toPnu(a) {
  return `${a.sigunguCd}${a.bjdongCd}${a.platGbCd === "1" ? "2" : "1"}${pad4(a.bun)}${pad4(a.ji)}`;
}

// ── 주소 해석기들
async function viaVworld(q, key) {
  const base = "https://api.vworld.kr/req/search";
  for (const category of ["parcel", "road"]) {
    const u = `${base}?service=search&request=search&version=2.0&crs=EPSG:4326&size=5&page=1&type=address&category=${category}&format=json&errorformat=json&key=${key}__DOM__&query=${encodeURIComponent(q)}`;
    const j = await vwJson(u, 3000).catch(() => null);
    vwCheck(j, "브이월드 주소검색");
    const items = j?.response?.result?.items || [];
    if (items.length) {
      return items.map((it) => ({
        roadAddress: it.address?.road || "", jibunAddress: it.address?.parcel || "",
        lng: parseFloat(it.point?.x), lat: parseFloat(it.point?.y),
        pnu: category === "parcel" ? it.id : null, src: "vworld",
      }));
    }
  }
  return [];
}
async function viaKakao(q, key) {
  const j = await getJson(`https://dapi.kakao.com/v2/local/search/address.json?size=5&query=${encodeURIComponent(q)}`, 3000, { headers: { Authorization: `KakaoAK ${key}` } }).catch(() => null);
  return (j?.documents || []).filter((d) => d.address).map((d) => ({
    roadAddress: d.road_address?.address_name || "", jibunAddress: d.address.address_name,
    lng: parseFloat(d.x), lat: parseFloat(d.y),
    sigunguCd: d.address.b_code.slice(0, 5), bjdongCd: d.address.b_code.slice(5, 10),
    platGbCd: d.address.mountain_yn === "Y" ? "1" : "0",
    bun: d.address.main_address_no, ji: d.address.sub_address_no || "0", src: "kakao",
  }));
}
async function viaJuso(q, key) {
  const j = await getJson(`https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${key}&currentPage=1&countPerPage=5&resultType=json&keyword=${encodeURIComponent(q)}`, 3000).catch(() => null);
  return (j?.results?.juso || []).map((d) => ({
    roadAddress: d.roadAddr, jibunAddress: d.jibunAddr,
    sigunguCd: d.admCd.slice(0, 5), bjdongCd: d.admCd.slice(5, 10),
    platGbCd: d.mtYn === "1" ? "1" : "0", bun: d.lnbrMnnm, ji: d.lnbrSlno || "0", src: "juso",
  }));
}
function viaTable(q) {
  const s = q.replace(/서울(특별)?시/g, " ").replace(/\s+/g, " ").trim();
  const m = /([가-힣]+구)\s*([가-힣0-9]+동)\s*(산)?\s*([0-9]{1,5})(?:\s*-\s*([0-9]{1,5}))?\s*(번지)?/.exec(s);
  if (!m) return [];
  const sg = SEOUL_GU[m[1]];
  const bj = sg && DONG[sg] && DONG[sg][m[2]];
  if (!sg || !bj) return [];
  return [{
    roadAddress: "", jibunAddress: `서울특별시 ${m[1]} ${m[2]} ${m[3] ? "산" : ""}${m[4]}${m[5] ? "-" + m[5] : ""}`,
    sigunguCd: sg, bjdongCd: bj, platGbCd: m[3] ? "1" : "0", bun: m[4], ji: m[5] || "0", src: "table",
  }];
}

// 좌표 → 필지(연속지적도) / 용도지역 (브이월드 데이터 API)
async function vworldFeature(layer, geomFilter, key, extra = "") {
  const u = `https://api.vworld.kr/req/data?service=data&request=GetFeature&version=2.0&format=json&errorformat=json&size=10&crs=EPSG:4326&data=${layer}&geomFilter=${encodeURIComponent(geomFilter)}&key=${key}__DOM__${extra}`;
  const j = await vwJson(u, 3500).catch(() => null);
  vwCheck(j, `브이월드 ${layer}`);
  return j?.response?.result?.featureCollection?.features || [];
}
async function vworldByPnu(pnu, key) {
  const u = `https://api.vworld.kr/req/data?service=data&request=GetFeature&version=2.0&format=json&errorformat=json&size=1&crs=EPSG:4326&data=LP_PA_CBND_BUBUN&attrFilter=${encodeURIComponent("pnu:=:" + pnu)}&key=${key}__DOM__`;
  const j = await vwJson(u, 3500).catch(() => null);
  vwCheck(j, "브이월드 필지");
  return j?.response?.result?.featureCollection?.features || [];
}
function ring(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  const c = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.type === "Polygon" ? g.coordinates[0] : null;
  return c ? c.map(([x, y]) => [y, x]) : null; // [lat,lng]
}

// ── 건축HUB 묶음 조회
// ── 건축HUB 호출 절약
// 같은 필지는 함수 인스턴스 메모리에 6시간 보관 (CDN 캐시와 별도로, 주소 표기가 달라도 같은 필지면 재사용)
const HUB_MEMO = new Map();
const HUB_TTL = 6 * 3600 * 1000;
const hubKey = (a) => `${a.sigunguCd}-${a.bjdongCd}-${a.platGbCd || "0"}-${pad4(a.bun)}-${pad4(a.ji)}`;
async function hubCall(fetchDataGoKr, a, op) {
  const k = `${hubKey(a)}|${op}`;
  const m = HUB_MEMO.get(k);
  if (m && Date.now() - m.t < HUB_TTL) return { ...m.v, cached: true };
  const p = { sigunguCd: a.sigunguCd, bjdongCd: a.bjdongCd, platGbCd: a.platGbCd || "0", bun: pad4(a.bun), ji: pad4(a.ji), numOfRows: "100", pageNo: "1" };
  const v = await fetchDataGoKr(`${HUB}/${op}`, p).catch((e) => ({ ok: false, error: String(e) }));
  if (v && v.ok) {
    HUB_MEMO.set(k, { t: Date.now(), v });
    if (HUB_MEMO.size > 2000) HUB_MEMO.delete(HUB_MEMO.keys().next().value);
  }
  return v;
}
// 1단계: 표제부만
async function hub(fetchDataGoKr, a) {
  return { getBrTitleInfo: await hubCall(fetchDataGoKr, a, "getBrTitleInfo") };
}
// 2단계: 표제부·브이월드 결과를 보고 꼭 필요한 것만 추가 호출
async function hubExtras(fetchDataGoKr, a, H, zoneKnown) {
  const T = H.getBrTitleInfo?.ok ? H.getBrTitleInfo.items : [];
  if (!T.length) return H; // 대장 자체가 없으면 더 부르지 않음
  const main = T.filter((t) => t.mainAtchGbCd !== "1").sort((x, y) => (parseFloat(y.totArea) || 0) - (parseFloat(x.totArea) || 0))[0] || T[0];
  const purp = `${main.mainPurpsCdNm || ""} ${main.etcPurps || ""}`;
  const need = [];
  // 총괄표제부: 표제부에 대지면적이 없거나 여러 동일 때만
  if (!(parseFloat(main.platArea) > 0) || T.length > 1) need.push("getBrRecapTitleInfo");
  // 층별개요: 주거 비율(근생 혼합)·다가구 판별이 필요할 때만
  const fam = parseFloat(main.fmlyCnt) || 0;
  if (/근린|업무|숙박|판매|기타|복합/.test(purp) || (/단독/.test(purp) && !/다가구|다중/.test(purp) && fam < 2)) need.push("getBrFlrOulnInfo");
  // 지역지구: 브이월드에서 용도지역을 못 얻었을 때만
  if (!zoneKnown) need.push("getBrJijiguInfo");
  // 전유부: 다세대·연립·아파트(세대당 전용면적)일 때만
  if (/다세대|연립|아파트|공동주택/.test(purp)) need.push("getBrExposPubuseAreaInfo");
  const res = await Promise.all(need.map((op) => hubCall(fetchDataGoKr, a, op)));
  need.forEach((op, i) => { H[op] = res[i]; });
  H._calls = (H.getBrTitleInfo?.cached ? 0 : 1) + need.filter((op, i) => !res[i]?.cached).length;
  return H;
}

module.exports = async (req, res) => {
  let util;
  try { util = require("./_util"); } catch (e) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).send(JSON.stringify({ ok: false, error: "서버 모듈 로드 오류" }));
  }
  const { fetchDataGoKr, sendJson } = util;
  const started = Date.now();
  const VW = process.env.VWORLD_KEY, KK = process.env.KAKAO_REST_KEY, JS = process.env.JUSO_KEY;
  const warnings = [];
  vwErrors.length = 0;
  // 서버 호출은 어느 주소로 들어왔든 브이월드에 등록한 공식 주소로 보낸다 (vercel.app 으로 접속해도 동작)
  VW_DOMAIN = process.env.VWORLD_DOMAIN || CANONICAL;
  VW_ALT = req.headers && req.headers.host ? `https://${req.headers["x-forwarded-host"] || req.headers.host}` : "";
  try {
    const qy = req.query || {};
    let addr = null;
    let candidates = [];

    if (qy.sigunguCd && qy.bjdongCd && qy.bun) {
      addr = { sigunguCd: qy.sigunguCd, bjdongCd: qy.bjdongCd, platGbCd: qy.platGbCd || "0", bun: qy.bun, ji: qy.ji || "0", jibunAddress: qy.jibun || "", roadAddress: qy.road || "", src: "codes" };
    } else if (qy.lat && qy.lng) {
      if (!VW) return sendJson(res, 200, { ok: false, needKey: "VWORLD_KEY", error: "지도 클릭으로 필지를 찾으려면 브이월드 키(VWORLD_KEY)가 필요합니다. 주소 입력을 이용해 주세요." });
      const f = await vworldFeature("LP_PA_CBND_BUBUN", `POINT(${qy.lng} ${qy.lat})`, VW);
      if (!f.length) return sendJson(res, 200, { ok: false, error: "해당 위치에서 필지를 찾지 못했습니다." });
      const pr = f[0].properties || {};
      addr = { ...fromPnu(pr.pnu), pnu: pr.pnu, jibunAddress: pr.addr || "", lat: parseFloat(qy.lat), lng: parseFloat(qy.lng), src: "vworld-click", _parcel: f[0] };
    } else if (qy.q) {
      const q = String(qy.q).trim().replace(/번지$/, "");
      if (VW) candidates = await viaVworld(q, VW);
      if (!candidates.length && KK) candidates = await viaKakao(q, KK);
      if (!candidates.length && JS) candidates = await viaJuso(q, JS);
      if (!candidates.length) candidates = viaTable(q);
      if (!candidates.length) {
        return sendJson(res, 200, {
          ok: false, needPostcode: true,
          error: VW || KK || JS ? "주소를 찾지 못했습니다. 표기를 확인하거나 주소검색 버튼을 이용해 주세요." : "이 주소는 내장 표에 없어 바로 풀 수 없습니다. 🔎 주소검색(도로명·지번)으로 선택해 주세요.",
        });
      }
      addr = candidates[0];
      if (addr.pnu) Object.assign(addr, fromPnu(addr.pnu));
    } else {
      return sendJson(res, 400, { ok: false, error: "q(주소) 또는 법정동코드 또는 좌표가 필요합니다." });
    }

    addr.pnu = addr.pnu || toPnu(addr);
    addr.isSeoul = addr.sigunguCd.startsWith("11");

    // 건축HUB + 필지/용도지역 병렬
    const parcelP = (async () => {
      if (!VW) return null;
      let feats = addr._parcel ? [addr._parcel] : await vworldByPnu(addr.pnu, VW);
      const f = feats[0];
      if (!f) return null;
      const r = ring(f);
      const pr = f.properties || {};
      let zone = null;
      if (r && r.length) {
        const cLat = r.reduce((s, p) => s + p[0], 0) / r.length, cLng = r.reduce((s, p) => s + p[1], 0) / r.length;
        if (!addr.lat) { addr.lat = cLat; addr.lng = cLng; }
        const z = await vworldFeature("LT_C_UQ111", `POINT(${cLng} ${cLat})`, VW).catch(() => []);
        zone = z[0]?.properties?.uname || null;
      }
      return { pnu: pr.pnu, ring: r, jibun: pr.jibun, address: pr.addr, zone };
    })().catch(() => null);
    const hubP = hub(fetchDataGoKr, addr);
    let [parcel, H] = await Promise.all([parcelP, hubP]);
    H = await hubExtras(fetchDataGoKr, addr, H, !!(parcel && parcel.zone));
    delete addr._parcel;

    const T = H.getBrTitleInfo?.ok ? H.getBrTitleInfo.items : [];
    const R = H.getBrRecapTitleInfo?.ok ? H.getBrRecapTitleInfo.items : [];
    const F = H.getBrFlrOulnInfo?.ok ? H.getBrFlrOulnInfo.items : [];
    const J = H.getBrJijiguInfo?.ok ? H.getBrJijiguInfo.items : [];
    const E = H.getBrExposPubuseAreaInfo?.ok ? H.getBrExposPubuseAreaInfo.items : [];
    if (!H.getBrTitleInfo?.ok) warnings.push(`건축물대장 조회 실패: ${H.getBrTitleInfo?.error || "응답 없음"}`);

    // 주 건축물(주건축물 + 연면적 최대) 선택
    const main = T.filter((t) => t.mainAtchGbCd !== "1").sort((a, b) => (parseFloat(b.totArea) || 0) - (parseFloat(a.totArea) || 0))[0] || T[0] || null;
    // 세대별 최대 전유면적 (다세대)
    const unitArea = {};
    for (const e of E) {
      if (e.exposPubuseGbCd === "1" || /전유/.test(e.exposPubuseGbCdNm || "")) {
        const k = `${e.dongNm || ""}-${e.hoNm || ""}`;
        unitArea[k] = (unitArea[k] || 0) + (parseFloat(e.area) || 0);
      }
    }
    const unitExclusiveMax = Object.values(unitArea).reduce((m, v) => Math.max(m, v), 0) || null;
    const zones = J.map((j) => j.jijiguCdNm || j.etcJijigu).filter(Boolean);

    // 브이월드 지오코더(주소→좌표)로 정확한 지점을 찾고, 그 점의 필지 경계를 다시 읽는다
    if (VW && !addr.lat) {
      const tries = [];
      if (addr.jibunAddress) tries.push([addr.jibunAddress, "PARCEL"]);
      if (addr.roadAddress) tries.push([addr.roadAddress, "ROAD"]);
      for (const [q, type] of tries) {
        const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&format=json&errorformat=json&refine=true&simple=false&type=${type}&key=${VW}__DOM__&address=${encodeURIComponent(q)}`;
        const g = await vwJson(u, 3000).catch(() => null);
        vwCheck(g, "브이월드 지오코더");
        const pt = g?.response?.result?.point;
        if (pt && pt.x) { addr.lat = parseFloat(pt.y); addr.lng = parseFloat(pt.x); addr.coordSrc = "vworld-geocoder"; break; }
      }
      if (addr.lat && !parcel) {
        const f = await vworldFeature("LP_PA_CBND_BUBUN", `POINT(${addr.lng} ${addr.lat})`, VW).catch(() => []);
        if (f[0]) {
          const r = ring(f[0]);
          const z = await vworldFeature("LT_C_UQ111", `POINT(${addr.lng} ${addr.lat})`, VW).catch(() => []);
          parcel = { pnu: f[0].properties?.pnu, ring: r, jibun: f[0].properties?.jibun, address: f[0].properties?.addr, zone: z[0]?.properties?.uname || null };
        }
      }
    }
    // 실제 건물 외곽선 (브이월드 도로명주소 건물 LT_C_SPBD) — 필지 안에 중심이 있는 건물 중 가장 큰 것
    let footprint = null;
    if (VW && parcel?.ring?.length > 2) {
      const lats = parcel.ring.map((p) => p[0]), lngs = parcel.ring.map((p) => p[1]);
      const pad = 0.00003;
      const box = `BOX(${Math.min(...lngs) - pad},${Math.min(...lats) - pad},${Math.max(...lngs) + pad},${Math.max(...lats) + pad})`;
      const bf = await vworldFeature("LT_C_SPBD", box, VW).catch(() => []);
      const inside = (pt, poly) => {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [yi, xi] = poly[i], [yj, xj] = poly[j];
          if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      };
      const area = (r) => Math.abs(r.reduce((s2, p, i) => { const q = r[(i + 1) % r.length]; return s2 + p[1] * q[0] - q[1] * p[0]; }, 0) / 2);
      let best = null;
      for (const f of bf) {
        const r = ring(f);
        if (!r || r.length < 3) continue;
        const c = [r.reduce((s2, p) => s2 + p[0], 0) / r.length, r.reduce((s2, p) => s2 + p[1], 0) / r.length];
        if (!inside(c, parcel.ring)) continue;
        const a2 = area(r);
        if (!best || a2 > best.a) best = { a: a2, r, pr: f.properties || {} };
      }
      if (best) footprint = { ring: best.r, floors: parseInt(best.pr.gro_flo_co, 10) || null, below: parseInt(best.pr.und_flo_co, 10) || null, name: best.pr.buld_nm || best.pr.bld_nm || "" };
    }
    if (VW && !parcel) warnings.push(`브이월드 필지 조회 실패${vwErrors.length ? ": " + vwErrors.slice(0, 2).join(" / ") : ""}`);
    let lat = addr.lat, lng = addr.lng;
    // 키가 없을 때 좌표: OSM Nominatim (정밀하지 않을 수 있음)
    if (!lat && Date.now() - started < 6500) {
      const qq = addr.roadAddress || addr.jibunAddress;
      if (qq) {
        const n = await getJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=${encodeURIComponent(qq)}`, 2500, { headers: { "User-Agent": "yangseongi/1.0", "Accept-Language": "ko" } }).catch(() => null);
        if (Array.isArray(n) && n[0]) { lat = parseFloat(n[0].lat); lng = parseFloat(n[0].lon); addr.coordApprox = true; }
      }
    }

    // 대장을 찾은 성공 응답만 CDN에 하루 보관(이후 1주일은 오래된 값을 먼저 주고 뒤에서 갱신). 실패는 보관하지 않음
    if (T.length) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    else res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, {
      ok: true,
      hubCalls: H._calls ?? null,
      address: { ...addr, lat, lng },
      candidates: candidates.slice(0, 5).map((c) => ({ roadAddress: c.roadAddress, jibunAddress: c.jibunAddress })),
      parcel,
      footprint,
      zone: (parcel && parcel.zone) || zones.find((z) => /지역$/.test(z)) || null,
      zones,
      building: main,
      buildings: T.map((t) => ({ dongNm: t.dongNm, bldNm: t.bldNm, mainPurpsCdNm: t.mainPurpsCdNm, totArea: t.totArea, mainAtchGbCdNm: t.mainAtchGbCdNm })),
      recap: R[0] || null,
      floors: F.filter((f) => !main || !f.dongNm || f.dongNm === main.dongNm).map((f) => ({ flrGbCdNm: f.flrGbCdNm, flrNo: f.flrNo, flrNoNm: f.flrNoNm, mainPurpsCdNm: f.mainPurpsCdNm, etcPurps: f.etcPurps, area: f.area, mainAtchGbCdNm: f.mainAtchGbCdNm })),
      unitExclusiveMax,
      warnings,
      keys: { vworld: !!VW, kakao: !!KK, juso: !!JS },
      ms: Date.now() - started,
    });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String((e && e.message) || e), warnings });
  }
};
