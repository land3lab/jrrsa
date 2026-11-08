// 양성이 — 브라우저에 공개해도 되는 설정만 돌려준다.
//  · VWORLD_KEY: 브이월드 배경지도(WMTS) 타일용. 브이월드 키는 등록 도메인으로 제한되므로 공개 사용이 정상 용법.
//  · SUPABASE_URL / SUPABASE_ANON_KEY: 로그인(외부 서버 저장·자동 로그인)용 공개 키 (RLS로 보호).
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(
    JSON.stringify({
      ok: true,
      vworldKey: process.env.VWORLD_KEY || null,
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
      lookup: {
        buildingHub: true,
        vworld: !!process.env.VWORLD_KEY,
        kakao: !!process.env.KAKAO_REST_KEY,
        juso: !!process.env.JUSO_KEY,
      },
    })
  );
};
