// 양성이 — 건축물대장 파일 자동 확인: 이미지(OCR) · PDF(텍스트/스캔·비밀번호) · 문서(txt/html/xml)
import { parseRegister } from "./parse.js";

let pdfjs = null;
async function loadPdf() {
  if (pdfjs) return pdfjs;
  pdfjs = await import("../vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  return pdfjs;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error("스크립트를 불러오지 못했습니다: " + src));
    document.head.appendChild(s);
  });
}

let worker = null;
async function ocr(image, onProgress) {
  await loadScript(new URL("../vendor/tesseract/tesseract.min.js", import.meta.url).href);
  if (!worker) {
    worker = await window.Tesseract.createWorker(["kor", "eng"], 1, {
      workerPath: new URL("../vendor/tesseract/worker.min.js", import.meta.url).href,
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      logger: (m) => {
        if (m.status === "recognizing text") onProgress?.(0.4 + m.progress * 0.6, "글자 인식 중");
        else if (m.progress != null) onProgress?.(m.progress * 0.4, "OCR 엔진 준비 중 (처음 1회 약 10~20초)");
      },
    });
  }
  const { data } = await worker.recognize(image);
  return data.text || "";
}

// 이미지 전처리: 너무 크면 줄이고, 흑백·대비 강화 → 인식률 향상
async function prep(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  const ctx = cv.getContext("2d");
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = y > 175 ? 255 : y < 95 ? 0 : (y - 95) * 3.2;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// askPassword(reason) → Promise<string|null>
export async function readFile(file, { onProgress, askPassword } = {}) {
  const name = (file.name || "").toLowerCase();
  const type = file.type || "";
  let text = "";
  let method = "";
  const pageTexts = [];

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const lib = await loadPdf();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.getDocument({ data, isEvalSupported: false, cMapUrl: new URL("../vendor/pdfjs/cmaps/", import.meta.url).href, cMapPacked: true });
    task.onPassword = async (update, reason) => {
      const wrong = reason === lib.PasswordResponses.INCORRECT_PASSWORD;
      const pw = await askPassword?.(wrong ? "비밀번호가 맞지 않습니다. 다시 입력해 주세요." : "이 건축물대장 PDF는 비밀번호로 보호되어 있습니다.");
      if (pw == null) { task.destroy(); return; }
      update(pw);
    };
    const doc = await task.promise;
    onProgress?.(0.1, `PDF ${doc.numPages}쪽 읽는 중`);
    const pages = Math.min(doc.numPages, 6);
    for (let i = 1; i <= pages; i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      const startLen = text.length;
      let line = "";
      let lastY = null;
      for (const it of tc.items) {
        const y = it.transform?.[5];
        if (lastY != null && Math.abs(y - lastY) > 4) { text += line + "\n"; line = ""; }
        line += it.str + " ";
        lastY = y;
      }
      text += line + "\n";
      pageTexts.push(text.slice(startLen));
    }
    method = "PDF 텍스트";
    if (text.replace(/\s/g, "").length < 60) {
      // 스캔본 PDF → 페이지를 그려서 OCR
      text = "";
      pageTexts.length = 0;
      for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 2.2 });
        const cv = document.createElement("canvas");
        cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        const t = await ocr(cv, (p, m) => onProgress?.((i - 1 + p) / Math.min(doc.numPages, 3), `${i}쪽 ${m}`));
        pageTexts.push(t);
        text += t + "\n";
      }
      method = "PDF 스캔 OCR";
    }
  } else if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|heic)$/.test(name)) {
    onProgress?.(0.02, "이미지 준비 중");
    const cv = await prep(file);
    text = await ocr(cv, onProgress);
    method = "이미지 OCR";
  } else {
    text = await file.text();
    if (/<[a-z][\s\S]*>/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      text = doc.body ? doc.body.innerText || doc.body.textContent : text;
    }
    method = "문서 텍스트";
  }
  onProgress?.(1, "항목 분석 중");
  const parsed = parseRegister(text);
  if (!pageTexts.length) pageTexts.push(text);
  // 값이 몇 쪽에 있는지 (원본 대조용)
  const pageOf = {};
  for (const [k, v] of Object.entries(parsed.fields)) {
    if (typeof v !== "number") continue;
    const sv = String(v);
    const i = pageTexts.findIndex((t) => t.replace(/,/g, "").includes(sv));
    if (i >= 0) pageOf[k] = i + 1;
  }
  return { text, method, pages: pageTexts, pageOf, fileName: file.name, ...parsed };
}
