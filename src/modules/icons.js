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
