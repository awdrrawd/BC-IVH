// ════════════════════════════════════════
//  HSC module: icons.js
//  註冊按鈕圖示：HSC-iconW（白底用）/ HSC-iconB（黑底用）
//  圖檔放在 public/，隨 build 部署到 bundle 根目錄；用 import.meta.url 解析出網址，
//  本地 vite preview 與 GitHub Pages 皆適用。
// ════════════════════════════════════════

// 依 bundle（assets/main.js）位置，解析出同層根目錄的素材網址（= GitHub Pages 回退來源）。
export function assetUrl(path) {
    const url = new URL(import.meta.url);
    url.pathname = url.pathname.replace(/\/assets\/[^/]+$/, `/${String(path).replace(/^\//, '')}`);
    url.search = '';
    return url.toString();
}

// ── 圖片來源：CDN 優先（jsDelivr）──
// 理由：jsDelivr 全球節點、對中國較穩，且每次都送 Access-Control-Allow-Origin: *；
//  BC 原生 DrawGetImage 會先用 crossOrigin='anonymous' 載入，但「載入失敗兩次後會拿掉
//  crossOrigin 重載」（Drawing.js DrawGetImageOnError）→ 一旦失敗過就變成無 CORS 圖，
//  畫到 MainCanvas 就汙染整張畫布。來源越穩、ACAO 越確定，被汙染的機率越低。
// public/ 是 build 時由 Images/ Sound/ Translation/ 生成（未提交 repo），jsDelivr 直接指向 repo 來源。
const CDN_ROOT = 'https://cdn.jsdelivr.net/gh/awdrrawd/BC-HSC@main/';

// 邏輯路徑 → CDN 網址。圖片在 repo 的 Images/；Sound/、Translation/ 保留原子目錄。
//  （對照：Pages 由 copy-assets 把 Images/* 攤平到根目錄，故 assetUrl 用裸檔名即 Pages 圖。）
export function cdnUrl(logical) {
    const p = String(logical).replace(/^\//, '');
    if (/^(Sound|Translation)\//i.test(p)) return CDN_ROOT + p;
    return CDN_ROOT + 'Images/' + p;
}
// 圖片 CDN 網址（傳檔名，例：'HSC-iconW.png'）
export function imageUrl(name) { return cdnUrl(String(name).replace(/^\//, '')); }
// 音源 CDN 網址（傳 'Sound/' 之後的檔名，或空字串取基底）
export function soundUrl(name) { return cdnUrl('Sound/' + String(name).replace(/^\//, '')); }

// CDN 網址 → 對應的 Pages 網址（回退用）；非本 CDN 網址原樣回傳。
export function toPagesUrl(url) {
    const s = String(url);
    if (!s.startsWith(CDN_ROOT)) return s;
    const rel = s.slice(CDN_ROOT.length).replace(/^Images\//, '');   // 圖片在 Pages 根目錄
    return assetUrl(rel);
}

// fetch（CDN 優先）+ 失效回退 Pages：CDN 非 2xx 或連線失敗時，改抓對應的 Pages 網址。
//  給音源等「用 fetch 取二進位 / 文字」的資源用（圖片走 loadHscImage，不走這裡）。
export async function fetchAsset(url, init) {
    try {
        const r = await fetch(url, init);
        if (r.ok) return r;
        const fb = toPagesUrl(url);
        return (fb !== url) ? fetch(fb, init) : r;
    } catch (e) {
        const fb = toPagesUrl(url);
        if (fb !== url) return fetch(fb, init);
        throw e;
    }
}

// 建立一張「CORS 乾淨、CDN 優先、失效回退 Pages」的 Image。
//  與 BC 不同：crossOrigin 全程保留，寧可載不出來也不退成無 CORS（那會汙染畫布）。
//  onReady(img) 於成功載入後呼叫（沿用舊有 onload 旗標寫法）。
export function loadHscImage(name, onReady) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let stage = 0;   // 0=CDN 中 / 1=已回退 Pages / 2=放棄
    img.addEventListener('load', () => { try { onReady && onReady(img); } catch (e) {} });
    img.addEventListener('error', () => {
        if (stage === 0) { stage = 1; img.src = assetUrl(name); }   // CDN 失敗 → Pages（仍保留 crossOrigin）
        else { stage = 2; }                                          // 都失敗 → 放棄，維持乾淨
    });
    img.src = imageUrl(name);
    return img;
}

// 白底按鈕用（深色線稿）／黑底按鈕用（白色線稿）：網址走 CDN。
export const HSC_ICON_W = imageUrl('HSC-iconW.png');
export const HSC_ICON_B = imageUrl('HSC-iconB.png');

// 預先用「永不放棄 crossOrigin」的方式載入兩個按鈕圖，塞進 BC 的圖片快取（DrawCacheImage）。
//  這樣 DrawImageResize(HSC_ICON_*) 與偏好頁註冊鈕的 Image() 都會重用這份乾淨圖，
//  不會走到 BC「失敗後拿掉 crossOrigin」的路徑而汙染 MainCanvas。
(function _registerCleanIcons() {
    try {
        // DrawCacheImage 為 BC Drawing.js 的頂層 Map；同一全域環境可直接取用。
        if (typeof DrawCacheImage === 'undefined' || !DrawCacheImage || typeof DrawCacheImage.set !== 'function') return;
        DrawCacheImage.set(HSC_ICON_W, loadHscImage('HSC-iconW.png'));
        DrawCacheImage.set(HSC_ICON_B, loadHscImage('HSC-iconB.png'));
    } catch (e) { /* 取不到 BC 快取 → 交回 BC 原生載入（多半仍為 crossOrigin） */ }
})();

// 粗略判斷 DrawButton 背景色是否為淺色（→ 用白底圖 W；深色 → 用黑底圖 B）。
// 接受 'White' / 'Black' / '#ccc' / '#8E44A1' / 'rgb(...)' 等寫法。
export function isLightColor(color) {
    try {
        const c = String(color || '').trim().toLowerCase();
        if (!c) return true;
        const named = { white: 255, black: 0, gray: 128, grey: 128, silver: 192 };
        if (c in named) return named[c] >= 128;
        let r, g, b;
        if (c[0] === '#') {
            let h = c.slice(1);
            if (h.length === 3) h = h.split('').map(x => x + x).join('');
            r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
        } else {
            const m = c.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
            if (!m) return true;
            r = +m[1]; g = +m[2]; b = +m[3];
        }
        if ([r, g, b].some(v => Number.isNaN(v))) return true;
        // 感知亮度（ITU-R BT.601）
        return (0.299 * r + 0.587 * g + 0.114 * b) >= 140;
    } catch { return true; }
}

// 重用的離屏取樣畫布（willReadFrequently）：把要取樣的像素畫進來再讀，
//  不對 BC 的 MainCanvas 直接 getImageData（那個 context 由 BC 建立、補不上旗標，
//  頻繁讀取會噴「Multiple readback ... willReadFrequently」）——與 ColorAPI 同一套做法。
let _sampleCv = null, _sampleCtx = null;
function _sampleStripCtx(n) {
    if (!_sampleCv) {
        _sampleCv = document.createElement('canvas');
        _sampleCtx = _sampleCv.getContext('2d', { willReadFrequently: true });
    }
    if (_sampleCv.width !== n || _sampleCv.height !== 1) { _sampleCv.width = n; _sampleCv.height = 1; }
    return _sampleCtx;
}

// ── BC 沒有主題色判定，改由我們自己取樣畫布背景 ──
// 取樣 MainCanvas 指定矩形（BC 畫布座標 0~2000 × 0~1000）的幾個點，
// 以感知亮度平均判斷偏暗/偏亮。結果快取 ~800ms，避免頻繁取樣。
let _bgSampleCache = { key: '', dark: false, ts: 0 };
export function sampleCanvasIsDark(x, y, w, h) {
    try {
        const now = Date.now();
        const key = `${x | 0},${y | 0},${w | 0},${h | 0}`;
        if (_bgSampleCache.key === key && now - _bgSampleCache.ts < 800) return _bgSampleCache.dark;
        // 取 canvas 元素（drawImage 的來源）：MainCanvas 是 2D context，其 .canvas 即元素。
        const el = (typeof MainCanvas !== 'undefined' && MainCanvas && MainCanvas.canvas)
            ? MainCanvas.canvas
            : document.getElementById('MainCanvas');
        if (!el) return false;
        const pts = [[x + 3, y + 3], [x + w - 3, y + 3], [x + w / 2, y + h / 2], [x + 3, y + h - 3], [x + w - 3, y + h - 3]];
        // 把每個取樣點各畫 1px 進離屏的一橫排，再一次讀回（單次 readback、且讀取端具 willReadFrequently）
        const sctx = _sampleStripCtx(pts.length);
        sctx.clearRect(0, 0, pts.length, 1);
        pts.forEach(([px, py], i) => {
            sctx.drawImage(el, Math.max(0, px | 0), Math.max(0, py | 0), 1, 1, i, 0, 1, 1);
        });
        const { data } = sctx.getImageData(0, 0, pts.length, 1);
        let sum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 8) continue; // 略過全透明
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            n++;
        }
        const dark = n ? (sum / n) < 140 : false;
        _bgSampleCache = { key, dark, ts: now };
        return dark;
    } catch { return false; }
}

// ── 載入共用 ColorAPI（BC_ThemeColorCheck）──
// 與引擎同機制：PCM 或同作者其他插件已載入則自動略過（防重載旗標 __Sys_ColorAPI__）。
// 非阻塞；載入完成前 hscThemeIsDark() 會先用內建 fallback，之後改用 ColorAPI。
let _colorApiLoading = null;
export function ensureColorAPI() {
    if (typeof window !== 'undefined' && window.Liko?.__Sys_ColorAPI__) return Promise.resolve();
    if (_colorApiLoading) return _colorApiLoading;
    const url = assetUrl('Translation/BC_ThemeColorCheck.js') + '?t=' + Date.now();
    _colorApiLoading = fetch(url)
        .then(r => { if (!r.ok) throw new Error(`[HSC] ColorAPI ${r.status}`); return r.text(); })
        .then(code => { new Function(code)(); })
        .catch(e => { _colorApiLoading = null; console.warn('🐈‍⬛ [HSC] ColorAPI 載入失敗，改用內建判斷:', e.message); });
    return _colorApiLoading;
}

// ── 判定「當前 UI 主題色」是否過深 ──
// 交給共用 ColorAPI（BC_ThemeColorCheck）判斷實際畫布背景色；ColorAPI 未就緒時才退回
// 內建邏輯（讀主題插件 CSS 變數 → 取樣畫布上方選單帶）。都失敗則預設亮底。
//
// 結果快取 60 秒：profile 按鈕每幀都會呼叫本函式；主題正常不會一直變，沒必要每幀重算。
//  快取後對畫布的取樣頻率極低（~1 次/分），效能與 console 都清爽。
//  代價：切換主題後圖示明暗最多 60 秒才更新（可接受；要更即時就把 THEME_TTL 調小）。
const THEME_TTL = 60000;
let _themeDarkCache = { val: false, ts: 0 };
export function hscThemeIsDark() {
    const now = Date.now();
    if (_themeDarkCache.ts && now - _themeDarkCache.ts < THEME_TTL) return _themeDarkCache.val;
    const val = _computeThemeIsDark();
    _themeDarkCache = { val, ts: now };
    return val;
}
function _computeThemeIsDark() {
    // 1) 優先由 BC_ThemeColorCheck 判斷（讀畫布上方選單帶實際顏色 → isDark）
    const ColorAPI = (typeof window !== 'undefined') ? window.Liko?.__Sys_ColorAPI__ : null;
    if (ColorAPI) {
        try {
            const color = ColorAPI.getCanvasColor({ x: 1000, y: 110, size: 8 });
            if (color) { const d = ColorAPI.isDark(color); if (d !== null) return d; }
        } catch { /* 落到下方 fallback */ }
    }
    // 2) fallback：主題插件 CSS 變數
    try {
        const cs = getComputedStyle(document.documentElement);
        for (const v of ['--tmd-element', '--tmd-elementHover', '--element', '--button-color', '--bce-color']) {
            const c = cs.getPropertyValue(v).trim();
            if (c) return !isLightColor(c);
        }
    } catch { /* 無法讀 CSS 變數 */ }
    // 3) fallback：自行取樣畫布上方中央選單帶
    try { return sampleCanvasIsDark(760, 60, 480, 120); } catch { return false; }
}

// 依當前主題深淺選圖（給不易取樣座標的按鈕，如偏好頁註冊鈕）
export function hscIconForTheme() {
    return hscThemeIsDark() ? HSC_ICON_B : HSC_ICON_W;
}
