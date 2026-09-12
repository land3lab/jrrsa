
DESKTOP-EBVKI6B, 연결됨
Claude가 응답을 완료했습니다
GitHub 저장소(land3lab/jrrsa)에 파일을 덮어쓰는 방법은 이렇습니다:

웹브라우저에서 github.com/land3lab/jrrsa 접속
저장소 안에서 realestate-app 폴더 클릭 → 그 안의 public 폴더 클릭
public 폴더 안에서 기존 index.html 파일을 클릭해서 열기
파일 화면 오른쪽 위에 있는 연필 아이콘(✏️, Edit this file) 클릭
편집 화면이 열리면 안에 있는 내용을 전체 선택(Ctrl+A / Cmd+A)해서 지우기
방금 받으신 index.html 파일을 메모장(또는 텍스트 편집기)으로 열어서 내용을 전체 복사한 뒤, GitHub 편집창에 붙여넣기
아래로 스크롤하면 "Commit changes" 버튼이 있는 초록색 박스가 나옵니다 — 그대로 Commit changes 클릭
이렇게 저장하면 몇십 초 안에 Vercel이 자동으로 감지해서 재배포하고, https://jrrsa.vercel.app/에 바로 반영됩니다.

더 쉬운 방법도 있어요 — 파일을 직접 업로드하는 방식입니다:

public 폴더 화면에서 "Add file" → "Upload files" 클릭
받으신 index.html 파일을 끌어다 놓기 (드래그 앤 드롭)
같은 이름의 파일이 있다고 나오면 그대로 덮어쓰기 진행
아래 Commit changes 클릭
둘 중 편하신 방법으로 하시면 됩니다. 진행하시다 막히는 화면 있으면 캡처해서 보여주세요.

업로드된 이미지

2페이지 읽음, 로드된 도구
2페이지 읽음, 로드된 도구
말씀하신 오류는 "서버가 JSON이 아닌 응답(주로 에러 페이지)을 돌려줬다"는 뜻인데, 지금 같은 API를 직접 호출해보니 정상적으로 JSON이 나옵니다 — Vercel 서버리스 함수가 오랜만에 깨어날 때(콜드스타트) 가끔 일시적으로 이런 오류 페이지를 반환하는 경우가 있습니다.

일단 조회하기 버튼을 한 번 더 눌러보시겠어요? 대부분 재시도하면 바로 됩니다. 그와 별개로, 이런 경우에도 사용자에게 지금처럼 알아보기 힘든 브라우저 원본 에러 대신 "다시 시도해주세요" 같은 친절한 메시지가 뜨도록 코드를 개선해두겠습니다.


4개 파일 읽음, 명령 8개 실행함, 파일 수정됨 · 5 노트


4개 파일 읽음, 명령 8개 실행함, 파일 수정됨 · 5 노트
원인과 조치를 정리해드리면:

Vercel 서버리스 함수가 한동안 호출이 없다가 "콜드스타트"로 깨어날 때, 가끔 정상 JSON 대신 서버 자체 에러 페이지(HTML)를 잠깐 반환하는 경우가 있습니다. 기존 코드는 이런 경우를 대비하지 않아서 브라우저의 날것 그대로의 에러 문구가 그대로 노출됐던 것입니다.

이번에 개선한 내용:

응답을 안전하게 파싱해서, JSON이 아니면 "일시적인 서버 오류입니다 — 잠시 후 조회하기를 다시 눌러주세요"라는 친절한 메시지로 바뀝니다
메시지 옆에 "다시 시도" 버튼이 바로 붙어서, 누르면 재조회됩니다
건축물대장 탭에도 동일하게 적용했습니다
방금 서버가 첫 호출에 에러를 주는 상황을 직접 재현해서 테스트했고, 친절한 메시지 표시 → 다시 시도 클릭 → 정상 조회까지 확인했습니다. 이전과 같은 방식으로 index.html을 GitHub에 덮어써서 올리시면 반영됩니다.


Index
코드 · HTML 
업로드된 이미지

2페이지 읽음
2페이지 읽음
방금 만든 "친절한 오류 메시지 + 다시 시도 버튼"이 정상적으로 작동한 겁니다 — 즉 개선한 코드가 잘 반영됐다는 뜻이에요. 다만 실제 원인이었던 Vercel 콜드스타트 오류가 이번에도 한 번 발생한 것 같습니다.

방금 같은 조건(서울 종로구, 2026년 9월)으로 서버에 직접 다시 확인해봤는데, 지금은 정상적으로 응답합니다(해당 지역·월에는 아직 신고된 거래가 없어서 "0건"이 나옵니다 — 이번 달이라 아직 실거래 신고가 안 됐을 가능성이 높습니다).

화면에서 "다시 시도" 버튼을 한 번 눌러보시겠어요? 정상적으로 넘어갈 겁니다. 그리고 참고로, 2026년 9월은 이제 막 시작된 이번 달이라 국토부에 신고된 실거래가 아직 없을 수 있습니다 — 8월처럼 이미 지난 달로 조회하시면 더 확실하게 데이터를 보실 수 있어요.

업로드된 이미지

페이지 읽음
페이지 읽음
일관되게 재현되는 걸 보니, 이번엔 사용자 브라우저 문제가 아니라 서버 함수가 시간 안에 응답을 못 끝내는 경우로 보입니다. 국토부 공공데이터 서버가 가끔 느리게 응답하는데, Vercel 무료 플랜의 서버리스 함수는 10초 안에 반드시 끝내야 해서, 그 시간을 넘기면 Vercel이 자체적으로 HTML 에러 페이지를 돌려버립니다 — 그게 JSON 파싱 실패로 이어진 것 같습니다. 근본 원인을 서버 쪽에서 고치겠습니다.


명령 4개 실행함, 파일 읽음, 파일 수정됨
명령 4개 실행함, 파일 읽음, 파일 수정됨
All three scenarios confirmed working correctly — normal fast path, transient slowness (auto-recovers), and persistent slowness (clean error instead of a Vercel timeout page). Let's clean up and deliver the fix.


명령 실행함, 파일 공유함, 메모리 업데이트됨
명령 실행함, 파일 공유함, 메모리 업데이트됨
진짜 원인을 찾았습니다. 매번 다른 지역·기간에서 반복되길래 살펴보니, 사용자 브라우저 문제가 아니라 서버 쪽 타임아웃이었습니다.

국토부 데이터 서버가 가끔 느리게 응답하는데, Vercel 무료 플랜은 서버리스 함수가 10초 안에 반드시 끝나야 합니다. 이 시간을 넘기면 Vercel이 우리 코드 대신 자기 HTML 에러 페이지를 돌려버려서, 브라우저에서 JSON으로 못 읽고 "일시적인 서버 오류"로 떴던 겁니다.

고친 방식: 국토부 서버 호출에 6초 타임아웃을 걸고, 그 안에 안 끝나면 자동으로 한 번 더(2.5초) 재시도하도록 서버 코드를 바꿨습니다. 이렇게 하면 최악의 경우에도 8.5초 안에 항상 응답이 끝나서 Vercel의 10초 제한에 걸리지 않습니다. 직접 느린 서버를 흉내 내서 세 가지 상황(정상/일시적으로 느림/계속 느림) 모두 테스트했고, 모든 경우에 정상 작동을 확인했습니다.

방금 보내드린 _util.js 파일을 GitHub 저장소의 realestate-app/api/_util.js 경로(index.html과는 다른 폴더, api 폴더 안입니다)에 덮어써서 커밋해주시면 이번 문제는 해결될 겁니다.


util
JS 
이번 세션에서 Claude는 어떤가요?

메시지를 입력하세요…


util · JS
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
 
  let resp, text;
  try {
    ({ resp, text } = await fetchOnce(url, 6000));
  } catch (e1) {
    try {
      ({ resp, text } = await fetchOnce(url, 2500));
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
 

