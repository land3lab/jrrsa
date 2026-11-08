// 양성이 — 3D 입체 모델 (양성화 전/현황/후)
// 좌표계: x = 동(+)/서(-), y = 높이, z = 남(+)/북(-). 대지 북측 경계선은 z = -D/2.
import * as THREE from "three";
import { OrbitControls } from "./../vendor/three/OrbitControls.js";
import { FLOOR_H, ROOF_ADD_H } from "./engine.js";
import { SUNLIGHT } from "./laws.js";

const C = {
  legal: 0xfff1d6, legalEdge: 0x1d2c5e, viol: 0xf28c38, kept: 0x2fb67c, cut: 0xe24a4a,
  site: 0xd9e4c8, siteEdge: 0x26397a, ground: 0xeef2fa, sun: 0x4a7bd8, road: 0xb8c0d6,
};

function box(w, h, d, color, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.75, metalness: 0.02,
    transparent: !!opts.opacity, opacity: opts.opacity ?? 1, depthWrite: !opts.opacity,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = !opts.opacity; mesh.receiveShadow = true;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: opts.edge ?? C.legalEdge, transparent: true, opacity: opts.edgeOpacity ?? 0.85 }));
  mesh.add(e);
  return mesh;
}

function textSprite(text, color = "#1D2C5E", bg = "rgba(255,255,255,.92)") {
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  const fs = 44;
  ctx.font = `800 ${fs}px Pretendard, 'Noto Sans KR', sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 30;
  cv.width = w; cv.height = fs + 26;
  ctx.font = `800 ${fs}px Pretendard, 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, w, cv.height, 16); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, 15, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  const s = 0.018;
  sp.scale.set(cv.width * s, cv.height * s, 1);
  return sp;
}

export function createView(el, { thumb = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !thumb, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, thumb ? 1.5 : 2));
  renderer.shadowMap.enabled = !thumb;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (el.tagName === "CANVAS") {
    // thumb: 전달받은 canvas 를 교체
    el.replaceWith(renderer.domElement);
    renderer.domElement.className = el.className;
  } else el.appendChild(renderer.domElement);
  const host = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  camera.position.set(28, 26, 34);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c3dd, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-12, 30, 22); // 남서쪽 하늘에서
  sun.castShadow = !thumb;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
  scene.add(sun);

  let controls = null;
  if (!thumb) {
    controls = new OrbitControls(camera, host);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 6; controls.maxDistance = 220;
  }

  const world = new THREE.Group();
  scene.add(world);
  let center = new THREE.Vector3(0, 4, 0);
  let auto = thumb;
  let lastSpan = 24;
  let raf = 0;

  function resize() {
    const r = host.parentElement ? host.parentElement.getBoundingClientRect() : host.getBoundingClientRect();
    const w = Math.max(50, thumb ? host.clientWidth || r.width : r.width);
    const h = Math.max(50, thumb ? host.clientHeight || 120 : r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function clear() {
    world.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
    world.clear();
  }

  // P: 입력, R: 분석결과, mode: 'before' | 'current' | 'after'
  function update(P, R, mode = "after") {
    clear();
    const L = R.L;
    const { W, D, bw, bd, s } = L;
    const north = -D / 2;
    const bx = 0, bz0 = north + s; // 건물 북측 면
    const bzC = bz0 + bd / 2;

    // 지면 + 도로(남측 가정) + 대지
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, D + 40), new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; world.add(ground);
    const roadW = Math.max(2, Number(P.site.roadWidth) || 4);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, roadW), new THREE.MeshStandardMaterial({ color: C.road, roughness: 1 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, -0.02, D / 2 + roadW / 2); road.receiveShadow = true; world.add(road);

    let siteShape;
    if (R.siteLocal && R.siteLocal.length > 2) {
      siteShape = new THREE.Shape(R.siteLocal.map(([x, z]) => new THREE.Vector2(x, -z)));
    } else {
      siteShape = new THREE.Shape([new THREE.Vector2(-W / 2, -D / 2), new THREE.Vector2(W / 2, -D / 2), new THREE.Vector2(W / 2, D / 2), new THREE.Vector2(-W / 2, D / 2)].map((v) => new THREE.Vector2(v.x, -v.y)));
    }
    const siteG = new THREE.ShapeGeometry(siteShape);
    const site = new THREE.Mesh(siteG, new THREE.MeshStandardMaterial({ color: C.site, roughness: 1, side: THREE.DoubleSide }));
    site.rotation.x = -Math.PI / 2; site.receiveShadow = true; world.add(site);
    const siteLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(siteShape.getPoints().map((p) => new THREE.Vector3(p.x, 0.02, -p.y))), new THREE.LineBasicMaterial({ color: C.siteEdge }));
    world.add(siteLine);

    // 북쪽 표시
    const nArrow = textSprite("N ↑ 정북", "#fff", "rgba(29,44,94,.9)");
    nArrow.position.set(-W / 2 - 1.5, 0.6, north - 1.5); world.add(nArrow);

    // 합법(대장) 매스 — 층별
    const floors = Math.max(1, Number(R.before.floors) || 1);
    const H0 = R.before.height;
    const fh = H0 / floors;
    for (let i = 0; i < floors; i++) {
      const m = box(bw, fh - 0.04, bd, C.legal);
      m.position.set(bx, fh * i + fh / 2, bzC);
      world.add(m);
    }

    const V = mode === "after" ? R.after.kept : (P.violations || []).map((v) => ({ ...v, keepArea: Number(v.area) || 0 }));
    const showViol = mode !== "before";
    let roofTop = H0;

    if (showViol) {
      for (const v of V) {
        const orig = Number(v.area) || 0;
        const keep = mode === "after" ? Number(v.keepArea) || 0 : orig;
        const cut = Math.max(0, orig - keep);
        const keptColor = mode === "after" ? C.kept : C.viol;
        if (v.type === "roofAdd" && orig > 0) {
          const h = Number(v.height) || ROOF_ADD_H;
          const depthAll = Math.min(bd, orig / bw);
          const wAll = orig / depthAll;
          if (mode === "after") {
            // 일조 보완: 북측에서 필요한 만큼 물러난 위치에 남김
            const req = SUNLIGHT.requiredNew(H0 + h);
            const back = R.sun.applies ? Math.max(0, req - s) : 0;
            const dKeep = keep / wAll;
            if (keep > 0.01) {
              const m = box(wAll, h, dKeep, keptColor); m.position.set(bx, H0 + h / 2, bz0 + back + dKeep / 2); world.add(m);
            }
            if (cut > 0.01) {
              const dCut = cut / wAll;
              const m = box(wAll, h, dCut, C.cut, { opacity: 0.22, edge: C.cut }); m.position.set(bx, H0 + h / 2, bz0 + dCut / 2); world.add(m);
              const t = textSprite(`철거 ${cut.toFixed(1)}㎡`, "#fff", "rgba(214,69,69,.92)"); t.position.set(bx, H0 + h + 1.2, bz0 + dCut / 2); world.add(t);
            }
          } else {
            const m = box(wAll, h, depthAll, keptColor); m.position.set(bx, H0 + h / 2, bz0 + depthAll / 2); world.add(m);
            const t = textSprite(`옥상 증축 ${orig}㎡`, "#fff", "rgba(229,115,28,.95)"); t.position.set(bx, H0 + h + 1.2, bz0 + depthAll / 2); world.add(t);
          }
          roofTop = Math.max(roofTop, H0 + h);
        } else if ((v.type === "sideAdd" || v.type === "annex") && orig > 0) {
          const fl = Math.max(1, Number(v.floors) || 1);
          const depth = Math.min(bd, Math.max(2, Math.sqrt(orig)));
          const wAll = orig / depth;
          const x0 = bw / 2;
          const wK = keep / depth, wC = cut / depth;
          for (let i = 0; i < fl; i++) {
            if (wK > 0.01) { const m = box(wK, fh - 0.04, depth, keptColor); m.position.set(x0 + wK / 2, fh * i + fh / 2, bzC + bd / 2 - depth / 2); world.add(m); }
            if (mode === "after" && wC > 0.01) { const m = box(wC, fh - 0.04, depth, C.cut, { opacity: 0.22, edge: C.cut }); m.position.set(x0 + wK + wC / 2, fh * i + fh / 2, bzC + bd / 2 - depth / 2); world.add(m); }
          }
          const t = textSprite(`${mode === "after" ? (cut > 0 ? `철거 ${cut.toFixed(1)}㎡` : "존치") : `수평증축 ${orig}㎡`}`, "#fff", mode === "after" && cut > 0 ? "rgba(214,69,69,.92)" : "rgba(229,115,28,.95)");
          t.position.set(x0 + wAll / 2, fh * fl + 1, bzC + bd / 2 - depth / 2); world.add(t);
        } else if ((v.type === "balcony" || v.type === "piloti") && orig > 0) {
          const flNo = Math.max(1, parseInt(v.floor, 10) || (v.type === "piloti" ? 1 : 2));
          const depth = v.type === "piloti" ? Math.min(bd, 4) : 1.3;
          const w = Math.min(bw, orig / depth);
          const y = fh * (flNo - 1) + fh / 2;
          if (v.type === "balcony") {
            if (keep > 0.01) { const m = box(w * keep / orig, fh - 0.1, depth, keptColor); m.position.set(bx - (w - w * keep / orig) / 2, y, bz0 + bd + depth / 2); world.add(m); }
            if (mode === "after" && cut > 0.01) { const m = box(w * cut / orig, fh - 0.1, depth, C.cut, { opacity: 0.22, edge: C.cut }); m.position.set(bx + w / 2 - (w * cut / orig) / 2, y, bz0 + bd + depth / 2); world.add(m); }
          } else {
            const m = box(w, fh - 0.06, depth, keep > 0 ? keptColor : C.cut, { opacity: keep > 0 ? 0.85 : 0.22, edge: keep > 0 ? C.legalEdge : C.cut }); m.position.set(bx, y, bz0 + bd - depth / 2 + 0.05); world.add(m);
          }
        } else if (v.type === "unitSplit" || v.type === "useChange") {
          const flNo = Math.max(1, parseInt(v.floor, 10) || 1);
          const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bw + 0.25, fh, bd + 0.25)), new THREE.LineBasicMaterial({ color: mode === "after" ? C.kept : C.viol }));
          ring.position.set(bx, fh * (flNo - 1) + fh / 2, bzC); world.add(ring);
          const t = textSprite(v.type === "unitSplit" ? `${flNo}층 세대분할` : `${flNo}층 용도변경`, "#fff", mode === "after" ? "rgba(47,182,124,.95)" : "rgba(229,115,28,.95)");
          t.position.set(bx - bw / 2 - 2.2, fh * (flNo - 1) + fh / 2, bzC); world.add(t);
        }
      }
    }

    // 일조 사선(정북) 한계면 — 개정 제61조: 1.5m(≤10m) / 5m(10~17m) / h/2(>17m)
    if (R.sun.applies) {
      const maxH = Math.max(roofTop + 4, 20);
      const prof = [[1.5, 0], [1.5, 10], [5, 10], [5, 17], [8.5, 17]];
      for (let d = 8.5; d <= maxH / 2 + 0.01; d += 0.5) prof.push([d, d * 2]);
      const pts = [];
      for (let i = 0; i < prof.length - 1; i++) {
        const [d1, h1] = prof[i], [d2, h2] = prof[i + 1];
        pts.push([d1, h1, d2, h2]);
      }
      const g = new THREE.BufferGeometry();
      const verts = [];
      const xL = -W / 2, xR = W / 2;
      for (const [d1, h1, d2, h2] of pts) {
        const z1 = north + d1, z2 = north + d2;
        verts.push(xL, h1, z1, xR, h1, z1, xR, h2, z2, xL, h1, z1, xR, h2, z2, xL, h2, z2);
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      const env = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: C.sun, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
      world.add(env);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(prof.map(([d, h]) => new THREE.Vector3(xL - 0.05, h, north + d))), new THREE.LineBasicMaterial({ color: C.sun }));
      world.add(line);
      const t = textSprite("일조 사선(개정 제61조)", "#fff", "rgba(74,123,216,.92)");
      t.position.set(xL - 1, 11.5, north + 3); world.add(t);
    }

    const label = { before: "양성화 전 (건축물대장)", current: "현황 (위반 포함)", after: "양성화 후 (권장안)" }[mode];
    const lt = textSprite(label, "#fff", mode === "after" ? "rgba(47,182,124,.95)" : mode === "current" ? "rgba(229,115,28,.95)" : "rgba(29,44,94,.92)");
    lt.position.set(0, roofTop + 3.6, bzC); world.add(lt);

    lastSpan = Math.max(W, D, roofTop) * 1.05 + 6;
    center = new THREE.Vector3(0, Math.min(roofTop / 2, 8), bzC * 0.5);
    if (controls) { controls.target.copy(center); }
    if (!controls || !update._placed) { fit(); update._placed = !thumb; }
    resize();
  }

  function fit() {
    const span = lastSpan;
    camera.position.set(center.x + span * 1.35, center.y + span * 1.15, center.z + span * 1.75);
    camera.lookAt(center);
    if (controls) { controls.target.copy(center); controls.update(); }
  }

  function zoom(f) {
    const dir = camera.position.clone().sub(controls ? controls.target : center);
    dir.multiplyScalar(f);
    camera.position.copy((controls ? controls.target : center).clone().add(dir));
  }

  let t0 = performance.now();
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!host.isConnected) return;
    if (auto) {
      const t = (performance.now() - t0) / 1000;
      const rad = lastSpan * 1.75;
      camera.position.set(center.x + Math.sin(t * 0.35) * rad, center.y + lastSpan * 1.1, center.z + Math.cos(t * 0.35) * rad);
      camera.lookAt(center);
    }
    controls?.update();
    renderer.render(scene, camera);
  }
  loop();
  const ro = new ResizeObserver(() => resize());
  ro.observe(host.parentElement || host);

  return { update, resize, zoom, fit: () => { update._placed = false; fit(); }, dom: host, setAuto: (a) => (auto = a) };
}
