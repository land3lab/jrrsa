// 양성이 — 2D 지도 (Leaflet): 필지·건물·위반부·일조 이격선 표시, 확대/축소, 지도에서 대상 선택
/* global L */
import { SUNLIGHT } from "./laws.js";

const M_PER_DEG = 111320;

export function toLatLng(origin, x, z) {
  const lat = origin.lat - z / M_PER_DEG;
  const lng = origin.lng + x / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180));
  return [lat, lng];
}
export function toLocal(origin, lat, lng) {
  const z = (origin.lat - lat) * M_PER_DEG;
  const x = (lng - origin.lng) * M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180);
  return [x, z];
}

export function createMap(el, { onPick, vworldKey } = {}) {
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  // 휴대폰: 한 손가락은 페이지 스크롤, 두 손가락으로 지도 이동·확대 (dragging 끔 → touch-action: pan-x pan-y)
  const map = L.map(el, { zoomControl: false, attributionControl: true, maxZoom: 21, dragging: !touch, tap: false }).setView([37.4784, 126.9516], 18);
  if (touch) {
    const hint = L.DomUtil.create("div", "map-hint", el);
    hint.textContent = "두 손가락으로 지도 이동·확대";
    let t = 0;
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) { hint.classList.add("on"); clearTimeout(t); t = setTimeout(() => hint.classList.remove("on"), 1200); }
    }, { passive: true });
  }
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
  const layers = { "일반지도": osm };
  if (vworldKey) {
    const base = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Base/{z}/{y}/{x}.png`, { maxZoom: 21, maxNativeZoom: 19, attribution: "© VWorld" });
    const sat = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Satellite/{z}/{y}/{x}.jpeg`, { maxZoom: 21, maxNativeZoom: 19, attribution: "© VWorld" });
    const hyb = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Hybrid/{z}/{y}/{x}.png`, { maxZoom: 21, maxNativeZoom: 19 });
    layers["브이월드"] = base;
    layers["항공사진"] = L.layerGroup([sat, hyb]);
    base.addTo(map);
  } else osm.addTo(map);
  L.control.layers(layers, null, { position: "bottomright" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

  const g = L.layerGroup().addTo(map);
  let lastBounds = null;
  let picking = false;

  map.on("click", (e) => {
    if (!picking) return;
    picking = false;
    el.style.cursor = "";
    onPick && onPick(e.latlng);
  });

  function poly(origin, pts, style) {
    return L.polygon(pts.map(([x, z]) => toLatLng(origin, x, z)), style);
  }
  function rect(origin, x1, z1, x2, z2, style) {
    return poly(origin, [[x1, z1], [x2, z1], [x2, z2], [x1, z2]], style);
  }

  function update(P, R, mode = "after") {
    g.clearLayers();
    const origin = R.origin;
    if (!origin) return;
    const { W, D, bw, bd, s } = R.L;
    const north = -D / 2;
    const bz0 = north + s;

    // 필지
    const sitePts = R.siteLocal && R.siteLocal.length > 2 ? R.siteLocal : [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    const site = poly(origin, sitePts, { color: "#1D2C5E", weight: 3, fillColor: "#C9D7A8", fillOpacity: 0.35, dashArray: R.siteLocal ? null : "6 4" });
    site.bindTooltip(`대지 ${P.site.area}㎡ ${R.siteLocal ? "" : "(형상 추정)"}`, { className: "lbl", direction: "top" });
    g.addLayer(site);

    // 정북 일조 이격선 (1.5m / 5m)
    if (R.sun.applies) {
      const lines = [[1.5, "1.5m (h≤10m)"], [5, "5m (10<h≤17m)"]];
      for (const [d, t] of lines) {
        const ln = L.polyline([toLatLng(origin, -W / 2, north + d), toLatLng(origin, W / 2, north + d)], { color: "#4A7BD8", weight: 2, dashArray: "5 5" });
        ln.bindTooltip(`일조 이격 ${t}`, { className: "lbl", permanent: false });
        g.addLayer(ln);
      }
    }

    // 건물(대장)
    const b = rect(origin, -bw / 2, bz0, bw / 2, bz0 + bd, { color: "#1D2C5E", weight: 2, fillColor: "#FFF1D6", fillOpacity: 0.95 });
    b.bindTooltip(`대장 건축면적 ${R.before.arch}㎡ · ${R.before.floors}층`, { className: "lbl", direction: "center" });
    g.addLayer(b);

    if (mode !== "before") {
      const V = mode === "after" ? R.after.kept : (P.violations || []).map((v) => ({ ...v, keepArea: Number(v.area) || 0 }));
      for (const v of V) {
        const orig = Number(v.area) || 0;
        if (!orig) continue;
        const keep = Number(v.keepArea) || 0;
        const cut = Math.max(0, orig - keep);
        const keptStyle = { color: mode === "after" ? "#1E9E6A" : "#E5731C", weight: 2, fillColor: mode === "after" ? "#2FB67C" : "#F28C38", fillOpacity: 0.75 };
        const cutStyle = { color: "#D64545", weight: 2, dashArray: "4 4", fillColor: "#E24A4A", fillOpacity: 0.2 };
        if (v.type === "roofAdd") {
          const dAll = Math.min(bd, orig / bw), wAll = orig / dAll;
          if (mode === "after") {
            const back = R.sun.applies ? Math.max(0, SUNLIGHT.requiredNew(R.before.height + (Number(v.height) || 2.7)) - s) : 0;
            const dK = keep / wAll, dC = cut / wAll;
            if (dK > 0.01) g.addLayer(rect(origin, -wAll / 2, bz0 + back, wAll / 2, bz0 + back + dK, keptStyle).bindTooltip(`옥상 존치 ${keep.toFixed(1)}㎡`, { className: "lbl" }));
            if (dC > 0.01) g.addLayer(rect(origin, -wAll / 2, bz0, wAll / 2, bz0 + dC, cutStyle).bindTooltip(`옥상 철거 ${cut.toFixed(1)}㎡`, { className: "lbl", permanent: true, direction: "top" }));
          } else {
            g.addLayer(rect(origin, -wAll / 2, bz0, wAll / 2, bz0 + dAll, keptStyle).bindTooltip(`옥상 무단증축 ${orig}㎡`, { className: "lbl", permanent: true, direction: "top" }));
          }
        } else if (v.type === "sideAdd" || v.type === "annex") {
          const depth = Math.min(bd, Math.max(2, Math.sqrt(orig)));
          const wK = keep / depth, wC = cut / depth;
          const z2 = bz0 + bd, z1 = z2 - depth;
          if (wK > 0.01) g.addLayer(rect(origin, bw / 2, z1, bw / 2 + wK, z2, keptStyle).bindTooltip(`수평증축 ${mode === "after" ? "존치 " + keep.toFixed(1) : orig}㎡`, { className: "lbl", permanent: mode !== "after" }));
          if (mode === "after" && wC > 0.01) g.addLayer(rect(origin, bw / 2 + wK, z1, bw / 2 + wK + wC, z2, cutStyle).bindTooltip(`철거 ${cut.toFixed(1)}㎡`, { className: "lbl", permanent: true }));
        } else if (v.type === "balcony") {
          const depth = 1.3, w = Math.min(bw, orig / depth);
          g.addLayer(rect(origin, -w / 2, bz0 + bd, w / 2, bz0 + bd + depth, keep > 0 ? keptStyle : cutStyle).bindTooltip(`발코니 확장 ${orig}㎡`, { className: "lbl" }));
        }
      }
    }

    const tag = { before: "양성화 전", current: "현황", after: "양성화 후" }[mode];
    g.addLayer(L.marker(toLatLng(origin, 0, north - 2.5), { opacity: 0, interactive: false }).bindTooltip(`N↑ ${tag}`, { permanent: true, className: "lbl", direction: "top" }));

    lastBounds = site.getBounds().pad(0.6);
  }

  return {
    map,
    update,
    fit() { if (lastBounds) map.fitBounds(lastBounds, { maxZoom: 20 }); },
    zoom(d) { d > 0 ? map.zoomIn() : map.zoomOut(); },
    pick() { picking = true; el.style.cursor = "crosshair"; },
    invalidate() { setTimeout(() => map.invalidateSize(), 50); },
  };
}
