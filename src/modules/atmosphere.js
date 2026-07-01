// ════════════════════════════════════════
//  IVH module: atmosphere.js
//  催眠氛圍：模糊 + 淡紫染色。改用 BC 原生繪圖管線（hook Player.GetBlurLevel /
//  GetTints，見 hooks.js），BC 會在它自己的繪製 pass 幫我們把「其他角色＋房間背景」
//  模糊/染色，玩家自己(IsPlayer)不受影響；我們自己畫的背後人影是畫到暫存 context
//  再合成，也不吃 MainCanvas.filter，所以「世界糊、自己清晰、人影清晰」自然成立。
//
//  取代舊的 depthFigureBlur（截圖→blur→toDataURL→疊 <img>）：近乎零成本、位置自動
//  正確、且尊重玩家的 AllowBlur / AllowTints 設定（關掉就不強制，保護低效能機器）。
// ════════════════════════════════════════

import { CONFIG } from './config.js';

// 以「開始時間 + 持續時間」控制，讀取時即時算出淡入/淡出係數（0~1），
// BC 每幀都會重讀 → 免費做出平滑淡入淡出。
let _atmStart = 0;
let _atmDur = 0;
let _blurMax = 0;     // 最大模糊 px
let _tintOn = false;

// durationMs 對齊當次催眠時長；未來長時間催眠傳更長值即可，模糊/染色就持續更久。
export function activateHypnoAtmosphere(durationMs, { blur = true, tint = true, level = 3 } = {}) {
    _atmStart = Date.now();
    _atmDur = Math.max(300, durationMs | 0);
    _blurMax = blur ? level : 0;
    _tintOn = !!tint;
}
export function clearHypnoAtmosphere() { _atmStart = 0; _atmDur = 0; _blurMax = 0; _tintOn = false; }

function _allowBlur() { try { return Player?.GraphicsSettings?.AllowBlur !== false; } catch { return true; } }
function _allowTints() { try { return Player?.ImmersionSettings?.AllowTints !== false; } catch { return true; } }

// 淡入 600ms / 維持 / 淡出 800ms，回傳 0~1 係數
function _factor() {
    if (_atmDur <= 0) return 0;
    const el = Date.now() - _atmStart;
    if (el < 0 || el >= _atmDur) return 0;
    const fadeIn = Math.min(1, el / 600);
    const fadeOut = Math.min(1, (_atmDur - el) / 800);
    return Math.min(fadeIn, fadeOut);
}

// 給 hook Player.GetBlurLevel 用：回傳目前該疊加的模糊 px（0 = 不模糊）
export function ivhBlurLevel() {
    if (!CONFIG.enabled || _blurMax <= 0 || !_allowBlur()) return 0;
    const f = _factor();
    return f > 0 ? +(_blurMax * f).toFixed(2) : 0;
}

// 給 hook Player.GetTints 用：回傳目前的淡紫染色（null = 不染）
export function ivhTintColor() {
    if (!CONFIG.enabled || !_tintOn || !_allowTints()) return null;
    const f = _factor();
    if (f <= 0) return null;
    // 淡淡的紫（最高 a≈0.14，隨淡入淡出縮放）
    return { r: 150, g: 40, b: 200, a: +(0.14 * f).toFixed(3) };
}
