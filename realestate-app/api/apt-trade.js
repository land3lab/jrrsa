// 국토교통부_아파트매매 실거래자료 (RTMSDataSvcAptTradeDev)
const BASE = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";

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
    const { lawdCd, dealYmd, keyword } = req.query;
    if (!lawdCd || !dealYmd) {
      return sendJson(res, 400, { ok: false, error: "lawdCd(지역코드), dealYmd(계약년월 YYYYMM)가 필요합니다." });
    }
    const result = await fetchDataGoKr(BASE, {
      LAWD_CD: lawdCd,
      DEAL_YMD: dealYmd,
      numOfRows: "999",
      pageNo: "1",
    });
    if (!result.ok) {
      return sendJson(res, 502, { ok: false, error: result.error, raw: result.raw });
    }
    let items = result.items.map((it) => ({
      아파트: it.aptNm || it.아파트,
      지번: it.jibun || it.지번,
      법정동: (it.umdNm || it.법정동 || "").trim(),
      전용면적: it.excluUseAr || it.전용면적,
      층: it.floor || it.층,
      건축년도: it.buildYear || it.건축년도,
      거래금액: (it.dealAmount || it.거래금액 || "").replace(/,/g, "").trim(),
      년: it.dealYear || it.년,
      월: it.dealMonth || it.월,
      일: it.dealDay || it.일,
    }));
    if (keyword) {
      const k = keyword.trim();
      items = items.filter((it) => (it.아파트 || "").includes(k) || (it.지번 || "").includes(k));
    }
    // most recent first
    items.sort((a, b) => (Number(b.일) || 0) - (Number(a.일) || 0));
    return sendJson(res, 200, { ok: true, count: items.length, items });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
