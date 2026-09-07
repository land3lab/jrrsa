const { fetchDataGoKr, sendJson } = require("./_util");

// 국토교통부_아파트매매 실거래자료 (RTMSDataSvcAptTradeDev)
const BASE = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";

module.exports = async (req, res) => {
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
