// 샘플: 서울특별시 관악구 봉천동 1527-11
// ⚠️ 아래 수치는 화면 시연용 "예시 값"입니다. 실제 대장 값은 건축HUB 조회(서버) 또는 대장 첨부로 덮어씁니다.
export const SAMPLE_ADDRESS = "관악구 봉천동 1527-11";

export function sampleProject() {
  return {
    isSample: true,
    isExample: true,
    address: {
      jibunAddress: "서울특별시 관악구 봉천동 1527-11",
      roadAddress: "",
      sigunguCd: "11620", bjdongCd: "10100", platGbCd: "0", bun: "1527", ji: "11",
      isSeoul: true,
      lat: null, lng: null, // 실제 위치는 서버 조회(브이월드)로 받는다 — 임의 좌표를 쓰지 않음
    },
    site: {
      area: 165.0,
      zone: "제2종일반주거지역",
      roadWidth: 4,
      roadFrontage: 8,
      northSetback: 1.5,
      width: null, depth: null,
    },
    legal: {
      purpose: "다가구주택", category: "dagagu", structure: "철근콘크리트구조",
      archArea: 92.0, totArea: 276.0, farArea: 276.0, belowArea: 0,
      floorsAbove: 3, floorsBelow: 0, height: 9.6, units: 6,
      useAprDay: "1997-06-18",
      residentialArea: 276.0,
      unitExclusiveMax: null,
      violationMarked: false,
    },
    violations: [
      { id: "v1", type: "roofAdd", floor: "옥상(4층)", area: 38.5, height: 2.7, note: "옥상 무단증축 (주거)" },
      { id: "v2", type: "balcony", floor: "2", area: 6.2, note: "2층 발코니 새시 확장" },
      { id: "v3", type: "unitSplit", floor: "4", area: 0, units: 1, note: "옥탑 1가구 추가" },
    ],
    checks: {
      completedBy2023: true,
      exclusions: {},
      criteria: { landRight: true, roadAccess: true, safety: true, unitIncrease: true, noArrears: true },
      finePaidTimes: 0, finePaidAmount: 0,
      dandokOrdinanceCap: 165,
    },
    price: { stdPerM2: 750000 },
    sources: ["샘플(예시 값) — 대장·위반 모두 가상"],
  };
}

export function emptyProject() {
  const p = sampleProject();
  p.isSample = false;
  p.isExample = false;
  p.address = { jibunAddress: "", roadAddress: "", isSeoul: false };
  p.site = { area: 0, zone: "", roadWidth: 4, roadFrontage: 4, northSetback: 1.5 };
  p.legal = { purpose: "", category: "other", archArea: 0, totArea: 0, farArea: 0, floorsAbove: 1, floorsBelow: 0, height: 0, units: 1, violationMarked: false };
  p.violations = [];
  p.sources = [];
  return p;
}
