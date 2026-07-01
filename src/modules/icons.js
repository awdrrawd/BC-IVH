// ════════════════════════════════════════
//  IVH module: icons.js
//  註冊按鈕圖示：IVH-iconW（白底用）/ IVH-iconB（黑底用）
//  圖檔放在 public/，隨 build 部署到 bundle 根目錄；用 import.meta.url 解析出網址，
//  本地 vite preview 與 GitHub Pages 皆適用。
// ════════════════════════════════════════

// 依 bundle（assets/main.js）位置，解析出同層根目錄的素材網址。
export function assetUrl(path) {
    const url = new URL(import.meta.url);
    url.pathname = url.pathname.replace(/\/assets\/[^/]+$/, `/${String(path).replace(/^\//, '')}`);
    url.search = '';
    return url.toString();
}

// 白底按鈕用（深色線稿）
export const IVH_ICON_W = assetUrl('IVH-iconW.png');
// 黑底按鈕用（白色線稿）
export const IVH_ICON_B = assetUrl('IVH-iconB.png');

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

// 依按鈕背景色挑正確的圖示網址。
export function ivhIconFor(bgColor) {
    return isLightColor(bgColor) ? IVH_ICON_W : IVH_ICON_B;
}

// ── BC 沒有主題色判定，改由我們自己取樣畫布背景 ──
// 取樣 MainCanvas 指定矩形（BC 畫布座標 0~2000 × 0~1000）的幾個點，
// 以感知亮度平均判斷偏暗/偏亮。結果快取 ~800ms，避免每幀 getImageData 成本。
let _bgSampleCache = { key: '', dark: false, ts: 0 };
export function sampleCanvasIsDark(x, y, w, h) {
    try {
        const now = Date.now();
        const key = `${x | 0},${y | 0},${w | 0},${h | 0}`;
        if (_bgSampleCache.key === key && now - _bgSampleCache.ts < 800) return _bgSampleCache.dark;
        // MainCanvas 是 2D context（本身就有 getImageData）；退而用 canvas 元素取 context
        const ctx = (typeof MainCanvas !== 'undefined' && MainCanvas && typeof MainCanvas.getImageData === 'function')
            ? MainCanvas
            : (document.getElementById('MainCanvas')?.getContext?.('2d'));
        if (!ctx) return false;
        const pts = [[x + 3, y + 3], [x + w - 3, y + 3], [x + w / 2, y + h / 2], [x + 3, y + h - 3], [x + w - 3, y + h - 3]];
        let sum = 0, n = 0;
        for (const [px, py] of pts) {
            const d = ctx.getImageData(Math.max(0, px | 0), Math.max(0, py | 0), 1, 1).data;
            if (d[3] < 8) continue; // 略過全透明
            sum += 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
            n++;
        }
        const dark = n ? (sum / n) < 140 : false;
        _bgSampleCache = { key, dark, ts: now };
        return dark;
    } catch { return false; }
}

// 依「按鈕實際所在畫布背景」自動選圖：暗底 → B，亮底 → W。
export function ivhIconForButton(x, y, w, h) {
    return sampleCanvasIsDark(x, y, w, h) ? IVH_ICON_B : IVH_ICON_W;
}

// ── 判定「當前 UI 主題色」是否過深 ──
// 主題染色的原因很多；優先讀主題插件設的 CSS 變數（BC 官方推薦的 Themed-BC 會設
// --tmd-element = 當前按鈕色），讀不到再退而取樣畫布上方選單帶。都失敗則預設亮底。
export function ivhThemeIsDark() {
    try {
        const cs = getComputedStyle(document.documentElement);
        // Themed-BC 主色 + 幾個常見的變數名（各主題插件命名不一，盡量涵蓋）
        for (const v of ['--tmd-element', '--tmd-elementHover', '--element', '--button-color', '--bce-color']) {
            const c = cs.getPropertyValue(v).trim();
            if (c) return !isLightColor(c);
        }
    } catch { /* 無法讀 CSS 變數 */ }
    // 退而取樣畫布上方中央選單帶（BC 會用 crossOrigin=anonymous，Pages 有 CORS，通常可讀）
    try { return sampleCanvasIsDark(760, 60, 480, 120); } catch { return false; }
}

// 依當前主題深淺選圖（給不易取樣座標的按鈕，如偏好頁註冊鈕）
export function ivhIconForTheme() {
    return ivhThemeIsDark() ? IVH_ICON_B : IVH_ICON_W;
}
