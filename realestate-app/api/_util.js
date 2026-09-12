// Shared helpers for data.go.kr (공공데이터포털) proxy functions.
// The service key lives ONLY here, server-side — never sent to the browser.
const SERVICE_KEY = "7f6c358454733828dd692a66ac6b5d26c322e39bfee17bc6584fc9330276db1f";

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// Very small regex-based XML item extractor — data.go.kr responses are a flat
// list of <item><field>value</field>...</item> blocks with no nesting inside a field.
function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const body = m[1];
    const obj = {};
    const fieldRe = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = fieldRe.exec(body))) {
      obj[f[1]] = decodeEntities(f[2]);
    }
    items.push(obj);
  }
  return items;
}

function parseErrorHeader(xml) {
  const codeM = /<resultCode>([\s\S]*?)<\/resultCode>/.exec(xml) || /<returnReasonCode>([\s\S]*?)<\/returnReasonCode>/.exec(xml);
  const msgM = /<resultMsg>([\s\S]*?)<\/resultMsg>/.exec(xml) || /<returnAuthMsg>([\s\S]*?)<\/returnAuthMsg>/.exec(xml);
  // data.go.kr success codes vary by API: some use "0", some "00", some "000" — all-zero means success.
  if (codeM && codeM[1] && !/^0+$/.test(codeM[1].trim())) {
    return { code: codeM[1].trim(), message: msgM ? decodeEntities(msgM[1]) : "알 수 없는 오류" };
  }
  return null;
}

// Vercel(Hobby)의 서버리스 함수는 10초 안에 반드시 응답해야 하고, 넘기면 Vercel이 자체
// HTML 에러 페이지를 돌려버려 클라이언트에서 JSON 파싱이 깨진다. data.go.kr이 가끔 느리므로,
// 각 시도에 짧은 타임아웃을 걸고 실패하면 한 번 더 재시도해서 항상 10초 안에 "유효한 JSON"으로
// 응답을 끝맺는다 — 최악의 경우에도 깔끔한 { ok:false, error } 를 돌려준다.
async function fetchOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { headers: { Accept: "application/xml, text/xml" }, signal: controller.signal });
    const text = await resp.text();
    return { resp, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDataGoKr(baseUrl, params) {
  const qs = new URLSearchParams({ serviceKey: SERVICE_KEY, ...params });
  const url = `${baseUrl}?${qs.toString()}`;

  // Vercel 함수 자체의 콜드스타트(컨테이너 기동) 오버헤드가 10초 예산의 일부를 먼저 먹을 수
  // 있으므로, 넉넉히 안전마진을 두고 짧게 두 번만 시도한다 (총 5.5초 이내로 항상 응답 끝맺기).
  let resp, text;
  try {
    ({ resp, text } = await fetchOnce(url, 4000));
  } catch (e1) {
    try {
      ({ resp, text } = await fetchOnce(url, 1500));
    } catch (e2) {
      return { ok: false, status: 504, error: "공공데이터 서버 응답이 지연되고 있습니다 (시간 초과) — 잠시 후 다시 시도해주세요." };
    }
  }

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: `공공데이터 서버 오류 (HTTP ${resp.status})`, raw: text.slice(0, 500) };
  }
  const err = parseErrorHeader(text);
  if (err) {
    return { ok: false, status: 200, error: `${err.message} (코드 ${err.code})`, raw: text.slice(0, 500) };
  }
  const items = parseItems(text);
  return { ok: true, items, raw: text.slice(0, 2000) };
}

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).send(JSON.stringify(payload));
}

module.exports = { fetchDataGoKr, sendJson, decodeEntities, SERVICE_KEY };
