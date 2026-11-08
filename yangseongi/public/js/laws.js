// 양성이 — 법령 기준 데이터 (국가법령정보센터 원문 대조 검증: 2026-11-08 기준)
// 숫자를 바꿀 때는 반드시 아래 출처 조문을 다시 확인한다.

export const LAW_CHECKED_AT = "2026-11-08";

// ─────────────────────────────────────────────────────────────
// 1) 특정건축물 정리에 관한 특별조치법 (법률 제21820호, 2026.6.16 공포, 2026.12.17 시행)
//    부칙 제2조: 시행일부터 18개월간 효력 → 2028.6.16까지 신고 접수분 적용(부칙 제3조)
// ─────────────────────────────────────────────────────────────
export const SPECIAL_ACT = {
  name: "특정건축물 정리에 관한 특별조치법",
  lawNo: "법률 제21820호",
  promulgated: "2026-06-16",
  effective: "2026-12-17",
  expires: "2028-06-16", // 시행일부터 18개월 (부칙 제2조)
  completedBy: "2023-12-31", // 제3조① 사실상 완공 기준일
  residentialRatioMin: 0.5, // 제2조①2 연면적 50% 이상 주거용
  caps: {
    dasedae_unitExclusive: 85, // 제3조①1 다세대 세대당 전용 85㎡ 이하
    dandok_total: 165, // 제3조①2가 단독 연면적 165㎡ 이하(다가구 제외)
    dandok_total_ordinanceMax: 330, // 제3조①2가 단서: 165~330㎡ 조례 위임 (미제정 시 165㎡, 부칙 제4조)
    dagagu_total: 660, // 제3조①2나 다가구 연면적 660㎡ 이하
  },
  roadMinWidth: 3, // 제6조①2: 건축법 제44·46·47조 적용 시 도로 최소너비 3m
  penaltyTimes: 5, // 제9조: 이행강제금 5회분 과태료
  exclusions: [
    { key: "urbanFacility", label: "도시·군계획시설 부지", basis: "제3조②1" },
    { key: "greenbelt", label: "개발제한구역 (지정 전 건축분 제외)", basis: "제3조②2" },
    { key: "military", label: "군사기지·군사시설 보호구역 (지정 전 건축분 등 제외)", basis: "제3조②3" },
    { key: "roadBuffer", label: "도로법상 접도구역", basis: "제3조②4" },
    { key: "urbanDev", label: "도시개발구역 (사업 지장 없으면 제외)", basis: "제3조②5" },
    { key: "renewal", label: "정비구역 (사업 지장 없으면 제외)", basis: "제3조②6" },
    { key: "forest", label: "보전산지", basis: "제3조②7" },
    { key: "disaster", label: "상습재해구역·환경정비구역", basis: "제3조②8" },
    { key: "priorApproval", label: "과거 특조법으로 사용승인 후 소유권 변동 없음", basis: "제3조③" },
  ],
  approvalCriteria: [
    { key: "landRight", label: "자기 소유 대지(또는 사용승낙·국공유지)", basis: "제6조①1" },
    { key: "roadAccess", label: "건축법 제44조(접도 2m)·제46·47조(건축선) 위반 없음 — 도로 최소너비 3m 적용", basis: "제6조①2" },
    { key: "safety", label: "구조안전·위생·방화·인근 일조권 등에 현저한 지장 없음", basis: "제6조①2" },
    { key: "unitIncrease", label: "세대·가구 증가 대수선/근생→주택 사용 시 건축법 제49·50·52조, 소방시설법 제12조 준수", basis: "제6조①3" },
    { key: "noArrears", label: "과태료·이행강제금 체납 없음 (1년 내 완납 조건부 가능)", basis: "제6조①4" },
  ],
};

// ─────────────────────────────────────────────────────────────
// 2) 건축법 제61조① 일조 등의 확보를 위한 높이 제한 (정북방향 이격)
//    개정: 법률 제21880호(2026.8.11 공포), 제61조① 개정규정은 공포 후 3개월 → 2026.11.12 시행
//    부칙 제4조: 시행 이후 건축허가 신청(심의 신청 포함)·건축신고 분부터 적용
//    종전(건축법 시행령 제86조①): 10m 이하 1.5m / 10m 초과 높이의 1/2
// ─────────────────────────────────────────────────────────────
export const SUNLIGHT = {
  newEffective: "2026-11-12",
  basisNew: "건축법 제61조① (법률 제21880호, 2026.11.12 시행)",
  basisOld: "건축법 시행령 제86조① (종전 기준)",
  zonesApplied: ["제1종전용주거지역", "제2종전용주거지역", "제1종일반주거지역", "제2종일반주거지역", "제3종일반주거지역"],
  // 각 부분 높이 h(m)에 필요한 정북 인접대지경계선 이격거리(m)
  requiredNew(h) {
    if (h <= 10) return 1.5;
    if (h <= 17) return 5;
    return h / 2;
  },
  requiredOld(h) {
    return h <= 10 ? 1.5 : h / 2;
  },
  // 이격거리 d 에서 허용되는 최대 높이
  maxHeightNew(d) {
    if (d < 1.5) return 0;
    if (d < 5) return 10;
    return Math.max(17, 2 * d);
  },
  maxHeightOld(d) {
    if (d < 1.5) return 0;
    return Math.max(10, 2 * d);
  },
};

// ─────────────────────────────────────────────────────────────
// 3) 용도지역별 건폐율·용적률
//    법정 상한: 국토계획법 시행령 제84조①, 제85조① (2026.9.18 시행본)
//    서울: 서울특별시 도시계획 조례 제44조(건폐율), 제48조(용적률) (2026.7.13 시행본)
//    그 외 지자체는 조례가 다르므로 법정 상한을 기본값으로 쓰고 사용자가 고칠 수 있게 한다.
// ─────────────────────────────────────────────────────────────
export const ZONES = {
  "제1종전용주거지역": { bcr: 50, far: 100, seoulBcr: 50, seoulFar: 100 },
  "제2종전용주거지역": { bcr: 50, far: 150, seoulBcr: 40, seoulFar: 120 },
  "제1종일반주거지역": { bcr: 60, far: 200, seoulBcr: 60, seoulFar: 150 },
  "제2종일반주거지역": { bcr: 60, far: 250, seoulBcr: 60, seoulFar: 200 },
  "제3종일반주거지역": { bcr: 50, far: 300, seoulBcr: 50, seoulFar: 250 },
  "준주거지역": { bcr: 70, far: 500, seoulBcr: 60, seoulFar: 400 },
  "중심상업지역": { bcr: 90, far: 1500, seoulBcr: 60, seoulFar: 1000 },
  "일반상업지역": { bcr: 80, far: 1300, seoulBcr: 60, seoulFar: 800 },
  "근린상업지역": { bcr: 70, far: 900, seoulBcr: 60, seoulFar: 600 },
  "유통상업지역": { bcr: 80, far: 1100, seoulBcr: 60, seoulFar: 600 },
  "전용공업지역": { bcr: 70, far: 300, seoulBcr: 60, seoulFar: 200 },
  "일반공업지역": { bcr: 70, far: 350, seoulBcr: 60, seoulFar: 200 },
  "준공업지역": { bcr: 70, far: 400, seoulBcr: 60, seoulFar: 400 },
  "보전녹지지역": { bcr: 20, far: 80, seoulBcr: 20, seoulFar: 50 },
  "생산녹지지역": { bcr: 20, far: 100, seoulBcr: 20, seoulFar: 50 },
  "자연녹지지역": { bcr: 20, far: 100, seoulBcr: 20, seoulFar: 50 },
  "보전관리지역": { bcr: 20, far: 80 },
  "생산관리지역": { bcr: 20, far: 80 },
  "계획관리지역": { bcr: 40, far: 100 },
  "농림지역": { bcr: 20, far: 80 },
  "자연환경보전지역": { bcr: 20, far: 80 },
};

export function zoneLimits(zone, isSeoul) {
  const z = ZONES[zone];
  if (!z) return null;
  if (isSeoul && z.seoulBcr != null) {
    return { bcr: z.seoulBcr, far: z.seoulFar, source: "서울특별시 도시계획 조례 제44조·제48조" };
  }
  return { bcr: z.bcr, far: z.far, source: "국토계획법 시행령 제84조·제85조 (법정 상한 — 해당 시·군 조례 확인 필요)" };
}

// ─────────────────────────────────────────────────────────────
// 4) 이행강제금 — 건축법 제80조①, 시행령 제115조의3①
//    건폐율·용적률 초과, 무허가·무신고 신축/증축:
//      시가표준액(㎡) × 50% × 위반면적 × 비율
//    비율: 건폐율 초과 80% / 용적률 초과 90% / 무허가 100% / 무신고 70% (조례로 60%까지 낮출 수 있음)
//    연면적 60㎡ 이하 주거용(공동주택은 세대면적 기준): 1/2 범위에서 조례로 감경
//    그 밖의 위반(용도변경 등): 시가표준액 × 10% 범위 (제80조①2)
//    ※ 2026.8.11 개정(2027.2.12 시행): 영리·상습 가중 50~100%, 반복부과 의무화·다음 연도부터 가중
// ─────────────────────────────────────────────────────────────
export const FINE = {
  basis: "건축법 제80조①, 시행령 제115조의3①",
  rate: { bcr: 0.8, far: 0.9, noPermit: 1.0, noReport: 0.7 },
  smallResidentialArea: 60,
};

export const VIOLATION_TYPES = {
  roofAdd: { label: "옥상·최상층 무단증축", fineKey: "noPermit", affects: ["far", "height", "sun"], residential: true },
  sideAdd: { label: "수평 무단증축 (건폐율 증가)", fineKey: "bcr", affects: ["bcr", "far"], residential: true },
  balcony: { label: "발코니·베란다 무단 확장/새시 증축", fineKey: "noReport", affects: ["far"], residential: true },
  piloti: { label: "필로티·주차장 무단 실내화", fineKey: "far", affects: ["far", "parking"], residential: true },
  unitSplit: { label: "세대·가구 무단 분할 (대수선)", fineKey: "other", affects: ["units"], residential: true },
  useChange: { label: "근린생활시설 → 주택 무단 용도변경", fineKey: "other", affects: ["use"], residential: true },
  annex: { label: "대지 내 가설·부속 건축물 (창고·컨테이너 등)", fineKey: "noReport", affects: ["bcr", "far"], residential: false },
};

export const LAW_SOURCES = [
  { title: "특정건축물 정리에 관한 특별조치법", detail: "법률 제21820호 · 2026.6.16 공포 · 2026.12.17 시행 · 18개월 한시 (2028.6.16까지)", url: "https://www.law.go.kr/법령/특정건축물정리에관한특별조치법" },
  { title: "건축법 제61조 (일조 높이제한)", detail: "법률 제21880호 · 2026.8.11 공포 · 제61조①은 2026.11.12 시행 — 10m 이하 1.5m / 10~17m 5m / 17m 초과 h/2", url: "https://www.law.go.kr/법령/건축법/제61조" },
  { title: "건축법 제79조·제80조 (위반건축물·이행강제금)", detail: "제80조②⑤ 개정분은 2027.2.12 시행 (가중 50~100%, 반복부과 의무화)", url: "https://www.law.go.kr/법령/건축법/제80조" },
  { title: "건축법 시행령 제115조의3", detail: "이행강제금 비율 — 건폐율 80% · 용적률 90% · 무허가 100% · 무신고 70%", url: "https://www.law.go.kr/법령/건축법시행령/제115조의3" },
  { title: "건축법 시행령 별표 15", detail: "그 밖의 위반 이행강제금 — 무단 용도변경·세대 증설 대수선·일조 위반 등 시가표준액 10%, 사용승인 전 사용 2%", url: "https://www.law.go.kr/법령/건축법시행령" },
  { title: "건축법 시행령 제86조", detail: "종전 일조 기준 및 공동주택 채광 이격 (제86조③)", url: "https://www.law.go.kr/법령/건축법시행령/제86조" },
  { title: "국토계획법 시행령 제84조·제85조", detail: "용도지역별 건폐율·용적률 법정 상한", url: "https://www.law.go.kr/법령/국토의계획및이용에관한법률시행령/제84조" },
  { title: "서울특별시 도시계획 조례 제44조·제48조", detail: "서울 용도지역별 건폐율·용적률 (2026.7.13 시행본)", url: "https://www.law.go.kr/자치법규/서울특별시도시계획조례" },
];
