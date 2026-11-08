// 양성이 — 로그인(외부 서버 저장 · 자동 재연결)과 분석 기록 저장
// 서버: Supabase (SUPABASE_URL / SUPABASE_ANON_KEY 를 Vercel 환경변수로 설정하면 활성화)
//  - 계정·세션은 Supabase Auth 서버에 저장되고, 이 기기에는 갱신 토큰만 남아 다음 실행 때 자동 로그인된다.
//  - 비밀번호는 Supabase 서버에서 해시로만 보관된다. 이 앱은 정부24·세움터 비밀번호를 저장하지 않는다.
// 서버 미설정 시: 기록은 이 기기(localStorage)에만 저장한다.

const LOCAL_KEY = "ysg.cases.v1";
let sb = null;
let user = null;
const listeners = new Set();

export const auth = {
  get enabled() { return !!sb; },
  get user() { return user; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function emit() { listeners.forEach((f) => f(user)); }

export async function initAuth(cfg) {
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return false;
  try {
    const mod = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    sb = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "ysg.auth" },
    });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; emit(); });
    emit();
    return true;
  } catch (e) {
    console.warn("로그인 서버 연결 실패", e);
    sb = null;
    return false;
  }
}

export async function signIn(email, password) {
  if (!sb) throw new Error("로그인 서버가 설정되지 않았습니다.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  if (!sb) throw new Error("로그인 서버가 설정되지 않았습니다.");
  const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function magicLink(email) {
  if (!sb) throw new Error("로그인 서버가 설정되지 않았습니다.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { if (sb) await sb.auth.signOut(); user = null; emit(); }

function localList() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}

export async function saveCase(title, payload) {
  const item = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title, payload, created_at: new Date().toISOString() };
  if (sb && user) {
    const { error } = await sb.from("ys_cases").insert({ user_id: user.id, title, payload });
    if (error) throw error;
    return "server";
  }
  const list = localList();
  list.unshift(item);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 50)));
  return "local";
}

export async function listCases() {
  if (sb && user) {
    const { data, error } = await sb.from("ys_cases").select("id,title,payload,created_at").order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data.map((d) => ({ ...d, where: "server" }));
  }
  return localList().map((d) => ({ ...d, where: "local" }));
}

export async function deleteCase(c) {
  if (c.where === "server" && sb) { await sb.from("ys_cases").delete().eq("id", c.id); return; }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(localList().filter((x) => x.id !== c.id)));
}
