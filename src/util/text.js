// ════════════════════════════════════════
//  HSC util: 文字工具
//  wrapDanmakuText — 自動換行：每 fullWidth 個全形字（半形算半寬）換一行。
//  彈幕、主台詞、耳邊句子共用。
// ════════════════════════════════════════

export function wrapDanmakuText(text, fullWidth = 12) {
    // 判斷全形字（CJK、全形標點等）= 2 寬度；半形 = 1 寬度
    const charWidth = (ch) => {
        const code = ch.codePointAt(0);
        // CJK 統一漢字、全形符號、片假名、平假名
        if ((code >= 0x1100 && code <= 0x115F) ||
            (code >= 0x2E80 && code <= 0x9FFF) ||
            (code >= 0xA000 && code <= 0xA4CF) ||
            (code >= 0xAC00 && code <= 0xD7AF) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE10 && code <= 0xFE1F) ||
            (code >= 0xFE30 && code <= 0xFE4F) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6)) return 2;
        return 1;
    };
    const halfLimit = fullWidth * 2; // 半形字元上限
    // 先依既有換行（$n / \n 已由 resolveMe 轉成真正換行）切段，逐段再自動換行
    const wrapSeg = (seg) => {
        const lines = [];
        let cur = '', curW = 0;
        for (const ch of [...seg]) {
            const w = charWidth(ch);
            if (curW + w > halfLimit) { lines.push(cur); cur = ch; curW = w; }
            else                      { cur += ch; curW += w; }
        }
        if (cur || lines.length === 0) lines.push(cur);  // 保留空行
        return lines;
    };
    return String(text).split('\n').flatMap(wrapSeg).join('\n');
}
