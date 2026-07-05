// ── auto-wired cross-module imports ──
import { CONFIG } from '../core/config.js';

// ════════════════════════════════════════
//  HSC module: geometry.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  時間設定
    // ════════════════════════════════════════
    const BASE_EFFECT_DURATION  = 5000;
    const BASE_PINK_DURATION    = 3000;
    const BASE_WAVE_DURATION    = 3500;
    const BASE_DANMAKU_DURATION = 5000;
    const SPIRAL_DURATION       = 5500;
    const DISTORT_DURATION      = 1200;
    const VIGNETTE_DURATION     = 4500;
    const STEAM_COUNT           = 14;

    // ════════════════════════════════════════
    //  BC 畫布常數
    // ════════════════════════════════════════
    const BC_CANVAS_W = 2000;
    const BC_CANVAS_H = 1000;
    const DANMAKU_X_MIN = 30;
    const DANMAKU_X_MAX = 750;
    const DANMAKU_Y_MIN = 60;
    const DANMAKU_Y_MAX = 780;

    // ════════════════════════════════════════
    //  玩家座標
    // ════════════════════════════════════════
    const playerDrawPos = { x: 0, y: 0, zoom: 1, valid: false, isKneeling: false, isProne: false };
    // 各角色（含玩家）最近一次的繪製座標：{ [MemberNumber]: { x, y, zoom, t } }，由 DrawOverlay hook 每幀更新
    const _charDrawPos = {};

    // ════════════════════════════════════════
    //  畫布快取
    // ════════════════════════════════════════
    let _cachedRect   = null;
    let _cachedScaleX = 1;
    let _cachedScaleY = 1;

    function refreshCanvasCache() {
        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
        if (!canvas) { _cachedRect = null; return; }
        _cachedRect   = canvas.getBoundingClientRect();
        _cachedScaleX = _cachedRect.width  / BC_CANVAS_W;
        _cachedScaleY = _cachedRect.height / BC_CANVAS_H;
    }

    function bcToScreen(bcX, bcY) {
        if (!_cachedRect) return { x: window.innerWidth * 0.25, y: window.innerHeight * 0.25 };
        return {
            x: _cachedRect.left + bcX * _cachedScaleX,
            y: _cachedRect.top  + bcY * _cachedScaleY,
        };
    }

    // ════════════════════════════════════════
    //  頭部 / 嘴部位置（直接用 BC 繪製公式，任何身高姿勢都正確）
    //  asset 空間：寬 500、高 1000；頭部約 (250, headAY)、嘴約 (250, mouthAY)
    //  螢幕BC座標 = cellXY + Zoom * (Offset + assetCoord * HeightRatio)
    //    XOffset = 500*(1-HeightRatio)/2
    //    YOffset = 1000*(1-HeightRatio)*HeightRatioProportion - HeightModifier*HeightRatio
    //  HeightModifier/HeightRatioProportion 已涵蓋跪/趴等姿勢（pose OverrideHeight）
    // ════════════════════════════════════════
    const HEAD_OFFSET = {
        headAY:  160,  // 頭部中心 asset Y（螺旋對準處）
        mouthAY: 250,  // 嘴部 asset Y（喘氣氣團處）
        x:       0,    // 水平微調（asset 單位）
        yExtra:  0,    // 螢幕 Y 微調（像素）
    };
    // 人物身上喘氣的 Y 微調（像素，往上 70）。自身與「看到他人喘氣」共用，確保兩端位置一致。
    const BODY_PANT_DY = -70;
    const DEPTH_PANT_EXTRA = 30;   // 深度喘氣再往下 30

    // 把角色 asset 座標 (ax, ay) 轉成 BC 畫布座標（預設玩家；可傳入其他角色與其繪製座標）
    //  身高/姿勢偏移優先用 BC 原生 CharacterAppearance[XY]Offset（含 ForceUpButton 等邊界，
    //  最聰明也最不會與 BC 脫節）；舊版沒有這兩個函數時才退回本地公式。
    function bodyAssetToBc(ax, ay, C = Player, dp = playerDrawPos) {
        const ratio = (typeof C?.HeightRatio === 'number') ? C.HeightRatio : 1;
        const prop  = (typeof C?.HeightRatioProportion === 'number') ? C.HeightRatioProportion : 1;
        const hMod  = (typeof C?.HeightModifier === 'number') ? C.HeightModifier : 0;
        const xOff  = (typeof CharacterAppearanceXOffset === 'function')
            ? CharacterAppearanceXOffset(C, ratio) : 500 * (1 - ratio) / 2;
        const yOff  = (typeof CharacterAppearanceYOffset === 'function')
            ? CharacterAppearanceYOffset(C, ratio) : 1000 * (1 - ratio) * prop - hMod * ratio;
        const z     = dp.zoom;
        return {
            x: dp.x + z * (xOff + ax * ratio),
            y: dp.y + z * (yOff + ay * ratio),
        };
    }

    // ── DrawCharacter 記錄的「真實繪製座標」（含 ECHO 貼貼等活動造成的 X 位移）──
    //  overlay(ChatRoomCharacterViewDrawOverlay) 的座標不含這類活動位移；DrawCharacter
    //  才是角色最終畫上去的位置（面部識別障礙就是靠它、位置永遠正確）。
    const _charAnchor = {};   // { member: {x, y, zoom, t} }

    // ★ 專用定位函數：取角色 asset 座標 (ax, ay) 的「BC 畫布座標」。
    //   優先用 DrawCharacter 記錄（含活動 X 位移），退回 overlay 座標。
    //   offX/offY 為 BC 畫布座標的額外偏移，供各效果做最終位置校正（喘氣/符咒高度…）。
    //   回傳 { x, y, zoom } 或 null。所有需要「貼在角色身上」的效果都應改用這個。
    function getBodyAnchorBc(C, ax, ay, offX = 0, offY = 0) {
        const member = (C && C.MemberNumber != null) ? C.MemberNumber : null;
        const isMe = member != null && typeof Player !== 'undefined' && Player && member === Player.MemberNumber;
        const a = (member != null) ? _charAnchor[member] : null;
        const fresh = a && (Date.now() - a.t < 1000);
        const dp = fresh ? a : (isMe ? playerDrawPos : (member != null ? _charDrawPos[member] : null));
        if (!dp || dp.valid === false || typeof dp.x !== 'number') return null;
        const bc = bodyAssetToBc(ax, ay, C || Player, dp);
        return { x: bc.x + offX, y: bc.y + offY, zoom: dp.zoom };
    }
    // 同上但回傳「螢幕像素座標」（offX/offY 為螢幕像素偏移），給 DOM 效果（喘氣等）用。
    function getBodyAnchorScreen(C, ax, ay, offX = 0, offY = 0) {
        const bc = getBodyAnchorBc(C, ax, ay, 0, 0);
        if (!bc) return null;
        const s = bcToScreen(bc.x, bc.y);
        return { x: s.x + offX, y: s.y + offY, zoom: bc.zoom };
    }

    // 其他角色嘴部螢幕座標（給「看到他人喘氣」用）
    function otherCharMouthScreenPos(C, dp) {
        const bc = bodyAssetToBc(250 + HEAD_OFFSET.x, HEAD_OFFSET.mouthAY, C, dp);
        const s  = bcToScreen(bc.x, bc.y);
        s.y += HEAD_OFFSET.yExtra;
        return s;
    }

    // 判斷玩家是否在目前顯示的頁面（用 ChatRoomCharacterViewOffset 直接判斷）
    // BC 每列顯示 5 人（上排 5、下排 5，共 10 人），offset 指向第一個顯示的角色 index
    function isPlayerOnCurrentPage() {
        try {
            if (typeof ChatRoomCharacter === 'undefined' || !Array.isArray(ChatRoomCharacter)) return true;
            const myIdx = ChatRoomCharacter.findIndex(c => c?.MemberNumber === Player?.MemberNumber);
            if (myIdx < 0) return true; // 找不到就不擋
            const total = ChatRoomCharacter.length;
            if (total <= 5) return true; // 5人以下不分頁，永遠顯示
            const offset = (typeof ChatRoomCharacterViewOffset !== 'undefined') ? ChatRoomCharacterViewOffset : 0;
            // BC 一個「畫面」顯示最多 10 人（上排 5 + 下排 5）
            return myIdx >= offset && myIdx < offset + 10;
        } catch { return true; }
    }

    // ignoreHeadshot=true → 強制用「人物身上」座標（給深度喘氣用，不受中央頭像影響）
    function getPlayerHeadScreenPos(ignoreHeadshot) {
        // 中央頭像模式：螺旋等效果以畫面左半中心為基準（對齊中央頭像，Y 往下 50）
        if (!ignoreHeadshot && CONFIG.centerHeadshot) return bcToScreen(500, 410);
        // 玩家不在目前顯示頁 → 回到畫面正中間
        if (!isPlayerOnCurrentPage()) return bcToScreen(500, 500);
        if (!playerDrawPos.valid || !_cachedRect) {
            if (!_cachedRect) return { x: window.innerWidth * 0.25, y: window.innerHeight * 0.15 };
            return { x: _cachedRect.left + _cachedRect.width * 0.25, y: _cachedRect.top + _cachedRect.height * 0.12 };
        }
        const bc = bodyAssetToBc(250 + HEAD_OFFSET.x, HEAD_OFFSET.headAY);
        const s  = bcToScreen(bc.x, bc.y);
        s.y += HEAD_OFFSET.yExtra;
        return s;
    }

    // 嘴部螢幕座標（喘氣氣團用）
    function getPlayerMouthScreenPos(ignoreHeadshot) {
        if (!ignoreHeadshot && CONFIG.centerHeadshot) return bcToScreen(500, 480);
        if (!isPlayerOnCurrentPage()) return bcToScreen(500, 560);
        if (!playerDrawPos.valid || !_cachedRect) {
            const h = getPlayerHeadScreenPos(ignoreHeadshot);
            return { x: h.x, y: h.y + 40 };
        }
        const bc = bodyAssetToBc(250 + HEAD_OFFSET.x, HEAD_OFFSET.mouthAY);
        const s  = bcToScreen(bc.x, bc.y);
        s.y += HEAD_OFFSET.yExtra;
        return s;
    }

export {
    BASE_EFFECT_DURATION,
    BASE_PINK_DURATION,
    BASE_WAVE_DURATION,
    BASE_DANMAKU_DURATION,
    SPIRAL_DURATION,
    DISTORT_DURATION,
    VIGNETTE_DURATION,
    STEAM_COUNT,
    BC_CANVAS_W,
    BC_CANVAS_H,
    DANMAKU_X_MIN,
    DANMAKU_X_MAX,
    DANMAKU_Y_MIN,
    DANMAKU_Y_MAX,
    playerDrawPos,
    _charDrawPos,
    _cachedRect,
    _cachedScaleX,
    _cachedScaleY,
    refreshCanvasCache,
    bcToScreen,
    HEAD_OFFSET,
    BODY_PANT_DY,
    DEPTH_PANT_EXTRA,
    bodyAssetToBc,
    _charAnchor,
    getBodyAnchorBc,
    getBodyAnchorScreen,
    otherCharMouthScreenPos,
    isPlayerOnCurrentPage,
    getPlayerHeadScreenPos,
    getPlayerMouthScreenPos,
};
