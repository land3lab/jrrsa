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

async function fetchDataGoKr(baseUrl, params) {
  const qs = new URLSearchParams({ serviceKey: SERVICE_KEY, ...params });
  const url = `${baseUrl}?${qs.toString()}`;
  const resp = await fetch(url, { headers: { Accept: "application/xml, text/xml" } });
  const text = await resp.text();
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
