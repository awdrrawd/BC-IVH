// ── auto-wired cross-module imports ──
import { ivhBlurLevel, ivhTintColor } from './atmosphere.js';
import { CONFIG, modApi } from './config.js';
import { triggerPinkFlash } from './effects.js';
import { triggerClimaxEffect } from './effects2.js';
import { _charDrawPos, playerDrawPos } from './geometry.js';
import { effectScale } from './util.js';

// ════════════════════════════════════════
//  IVH module: hooks.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  Hook ChatRoomCharacterViewDrawOverlay
    //  參考 LT 的 rpIcon 邏輯：
    //  CharX/CharY/Zoom 已是 BC 計算好的最終座標
    //  包含 HeightRatio/XOffset/YOffset/翻頁偏移，完全正確
    // ════════════════════════════════════════
    function hookDrawCharacter() {
        if (!modApi) return;
        try {
            modApi.hookFunction('ChatRoomCharacterViewDrawOverlay', 1, (args, next) => {
                const result = next(args);
                const [character, charX, charY, zoom] = args;
                // 記錄每個角色的最新繪製座標（給「看到他人喘氣」定位用）
                if (character?.MemberNumber != null) {
                    _charDrawPos[character.MemberNumber] = { x: charX, y: charY, zoom, t: Date.now() };
                }
                // 用 MemberNumber 比對，比 IsPlayer() 更可靠
                const isMe = character?.MemberNumber != null &&
                      Player?.MemberNumber != null &&
                      character.MemberNumber === Player.MemberNumber;
                if (isMe) {
                    // 座標每幀更新
                    playerDrawPos.x     = charX;
                    playerDrawPos.y     = charY;
                    playerDrawPos.zoom  = zoom;
                    playerDrawPos.valid = true;
                    // 姿勢也每幀更新（不放在座標變化判斷內，避免姿勢變化被漏掉）
                    playerDrawPos.isKneeling = typeof character.IsKneeling === 'function' && character.IsKneeling();
                    playerDrawPos.isProne    = !!(
                        character.ActivePose?.some(p =>
                                                   ['Hogtied','AllFours','Suspension','SuspensionHogtied'].includes(p)
                                                  ) ||
                        Object.values(character.DrawPoseMapping || character.PoseMapping || {}).some(p =>
                                                                                                     ['Hogtied','AllFours','Suspension','SuspensionHogtied'].includes(p)
                                                                                                    )
                    );
                }
                return result;
            });
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] ⚠️ ChatRoomCharacterViewDrawOverlay hook 失敗:', e.message);
        }
    }

    // ════════════════════════════════════════
    //  催眠氛圍 hook：模糊 + 淡紫染色（用 BC 原生繪圖管線）
    //   - Player.GetBlurLevel → BC 會據此模糊「其他角色＋房間背景」，玩家自己不受影響
    //   - Player.HasTints/GetTints → 同理對世界疊一層淡紫
    //  只在催眠氛圍啟用時疊加（見 atmosphere.js），平時完全 next(args) 不影響原值。
    // ════════════════════════════════════════
    function hookAtmosphere() {
        if (!modApi) return;
        try {
            modApi.hookFunction('Player.GetBlurLevel', 4, (args, next) => {
                const base = next(args) || 0;
                const add = ivhBlurLevel();
                return add > base ? add : base;
            });
            modApi.hookFunction('Player.HasTints', 4, (args, next) => {
                return ivhTintColor() ? true : next(args);
            });
            modApi.hookFunction('Player.GetTints', 4, (args, next) => {
                const base = next(args) || [];
                const t = ivhTintColor();
                return t ? base.concat([t]) : base;
            });
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] 氛圍 hook 失敗:', e.message);
        }
    }

    // ════════════════════════════════════════
    //  Hook OrgasmStage：偵測玩家進入 Stage 2（真正高潮）
    //  不依賴 [Voice] 觸發，任何高潮都可以觸發破片特效
    // ════════════════════════════════════════
    let _lastOrgasmStage = 0;
    let _climaxCooldown  = false;  // 防止同一次高潮重複觸發

    function hookOrgasmStage() {
        if (!modApi) return;

        const orgasmHandler = (args, next) => {
            const result = next(args);
            const [C] = args;
            if (C && typeof C.IsPlayer === 'function' && C.IsPlayer()
                && typeof CurrentScreen !== 'undefined' && CurrentScreen === 'ChatRoom') {
                if (CONFIG.climax && !_climaxCooldown) {
                    _climaxCooldown = true;
                    const scale = effectScale();
                    setTimeout(() => {
                        triggerClimaxEffect(scale);
                        triggerPinkFlash();
                    }, 400);
                    setTimeout(() => { _climaxCooldown = false; }, 8000);
                }
            }
            return result;
        };

        // 嘗試多個 BC 版本中可能存在的高潮函數名，靜默嘗試，失敗就用輪詢
        const orgasmFnCandidates = [
            'ActivityOrgasm',
            'ActivityOrgasmStart',
            'ActivityOrgasmPrepare',
        ];
        let orgasmHooked = false;
        for (const fn of orgasmFnCandidates) {
            try {
                modApi.hookFunction(fn, 0, orgasmHandler);
                orgasmHooked = true;
                break;
            } catch { /* 函數不存在，試下一個 */ }
        }
        if (!orgasmHooked) {
            _hookOrgasmPoll();
        }
    }

    // fallback：每 500ms 輪詢 OrgasmStage
    function _hookOrgasmPoll() {
        setInterval(() => {
            if (!CONFIG.climax || _climaxCooldown) return;
            if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') {
                _lastOrgasmStage = Player?.ArousalSettings?.OrgasmStage ?? 0;
                return;
            }
            const stage = Player?.ArousalSettings?.OrgasmStage ?? 0;
            if (stage >= 2 && _lastOrgasmStage < 2) {
                _climaxCooldown = true;
                const scale = effectScale();
                setTimeout(() => {
                    triggerClimaxEffect(scale);
                    triggerPinkFlash();
                }, 400);
                setTimeout(() => { _climaxCooldown = false; }, 8000);
            }
            _lastOrgasmStage = stage;
        }, 500);
    }


export {
    hookDrawCharacter,
    hookAtmosphere,
    hookOrgasmStage,
    _hookOrgasmPoll,
};
