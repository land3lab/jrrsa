const { fetchDataGoKr, sendJson } = require("./_util");

// 국토교통부_건축HUB 표제부 조회 (getBrTitleInfo)
const BASE = "http://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

module.exports = async (req, res) => {
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
