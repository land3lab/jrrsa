// 국토교통부_건축HUB 표제부 조회 (getBrTitleInfo)
const BASE = "http://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

module.exports = async (req, res) => {
  // require를 핸들러 안(try 블록)에서 지연 로드한다 — 모듈 로드 시점 오류까지 우리 catch가
  // 잡아 항상 유효한 JSON으로 응답을 끝맺기 위함 (그렇지 않으면 Vercel이 자체 HTML 오류
  // 페이지를 돌려줘서 브라우저에서 JSON 파싱이 깨진다).
  let fetchDataGoKr, sendJson;
  try {
    ({ fetchDataGoKr, sendJson } = require("./_util"));
  } catch (loadErr) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500).send(JSON.stringify({ ok: false, error: "서버 모듈 로드 오류: " + String((loadErr && loadErr.message) || loadErr) }));
    return;
  }
  try {
    const { sigunguCd, bjdongCd, bun, ji } = req.query;
    if (!sigunguCd || !bjdongCd || !bun) {
      return sendJson(res, 400, { ok: false, error: "sigunguCd(시군구코드 5자리), bjdongCd(법정동코드 5자리), bun(번지 본번)이 필요합니다." });
    }
    const result = await fetchDataGoKr(BASE, {
      sigunguCd,
      bjdongCd,
      platGbCd: "0",
      bun: String(bun).padStart(4, "0"),
      ji: String(ji || "0").padStart(4, "0"),
      numOfRows: "20",
      pageNo: "1",
    });
    if (!result.ok) {
      return sendJson(res, 502, { ok: false, error: result.error, raw: result.raw });
    }
    const items = result.items.map((it) => ({
      건물명: it.bldNm || it.건물명 || "(건물명 없음)",
      대지위치: it.platPlc || it.대지위치,
      도로명대지위치: it.newPlatPlc || it.도로명대지위치,
      주용도: it.mainPurpsCdNm || it.주용도,
      구조: it.strctCdNm || it.구조,
      지상층수: it.grndFlrCnt || it.지상층수,
      지하층수: it.ugrndFlrCnt || it.지하층수,
      연면적: it.totArea || it.연면적,
      대지면적: it.platArea || it.대지면적,
      건폐율: it.bcRat || it.건폐율,
      용적률: it.vlRat || it.용적률,
      사용승인일: it.useAprDay || it.사용승인일,
      세대수: it.hhldCnt || it.세대수,
    }));
    return sendJson(res, 200, { ok: true, count: items.length, items });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
