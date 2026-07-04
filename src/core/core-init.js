// ── auto-wired cross-module imports ──
import { hookChatInput, printChat } from './commands.js';
import { ES_KEY, MOD_VER, modApi, setModApi } from './config.js';
import { _depthTimer, applyDepthLoop, hookGhostDraw, setDepthTimer } from '../effects/depth.js';
import { hookAtmosphere, hookDrawCharacter, hookOrgasmStage } from './hooks.js';
import { hookHypnoSpeech } from '../hypno/hypno-speech.js';
import { startHypnoDecay, restoreHypnoState } from '../hypno/hypno.js';
import { ensureI18n, ui } from '../i18n/i18n.js';
import { hookCensor } from '../effects/censor.js';
import { hookL10n } from '../i18n/l10n.js';
import { updateCrowd } from '../effects/crowd.js';
import { isForced } from '../hypno/hypno.js';
import { stopHypnoAnim, updateHeadTalisman } from '../hypno/hypno-anim.js';
import { _domObserver, removePanel, setDomObserver, setupDOMObserver } from '../ui/panel.js';
import { hookProfileButton, hookRemoteEdit, registerPreferenceScreen } from '../ui/profile.js';
import { HSCDB, loadSettings, publishSharedSettings, waitForExtensionSettings } from './storage.js';
import { injectStyles } from '../ui/styles.js';
import { clearBCXCache } from '../util/util.js';

// ════════════════════════════════════════
//  HSC module: core-init.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  等待工具
    // ════════════════════════════════════════
    function waitForBcModSdk(timeout = 30000) {
        const start = Date.now();
        return new Promise(resolve => {
            const check = () => {
                if (typeof bcModSdk !== 'undefined' && bcModSdk?.registerMod) resolve(true);
                else if (Date.now() - start > timeout) resolve(false);
                else setTimeout(check, 100);
            };
            check();
        });
    }

    function waitForGame(timeout = 30000) {
        const start = Date.now();
        return new Promise(resolve => {
            const check = () => {
                if (
                    typeof Player !== 'undefined' &&
                    typeof CharacterSetFacialExpression === 'function' &&
                    typeof ChatRoomCharacter !== 'undefined'
                ) resolve(true);
                else if (Date.now() - start > timeout) resolve(false);
                else setTimeout(check, 100);
            };
            check();
        });
    }

    let _fallbackInterval = null;
    let _screenGuard = null;

    // 離開 ChatRoom（切到 profile/偏好/更衣室等任何非聊天室畫面）→ 清掉所有暫態疊加特效。
    //  例外：人臉／名稱識別障礙是繪圖 hook 自行判斷畫面，不在 overlay 內，不受此清除影響。
    function clearTransientEffects() {
        try { updateCrowd(false); } catch (e) {}
        try { stopHypnoAnim(); } catch (e) {}
        try { updateHeadTalisman(); } catch (e) {}   // 非 ChatRoom → want=false → 收起
        const overlay = document.getElementById('hsc-overlay');
        if (overlay) overlay.innerHTML = '';
        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
        if (canvas) { canvas.style.transform = ''; canvas.style.filter = ''; }
    }

    function waitForChatRoom() {
        if (typeof CurrentScreen !== 'undefined' && CurrentScreen === 'ChatRoom') {
            setupDOMObserver();
            return;
        }
        if (modApi) {
            let started = false;
            modApi.hookFunction('ChatRoomRun', 0, (args, next) => {
                const result = next(args);
                if (!started) {
                    started = true;
                    clearBCXCache();
                    setTimeout(setupDOMObserver, 500);
                    // 進房間時關係已同步 → 重新公告白名單($friend/$white 等才會即時)
                    setTimeout(() => { try { publishSharedSettings(); } catch (e) {} }, 800);
                    // 若離開時仍在強控 → 回到房間重新顯示人群／頭上符咒（若啟用）
                    setTimeout(() => { try { if (isForced()) { updateCrowd(true); updateHeadTalisman(); } } catch (e) {} }, 900);
                }
                return result;
            });
            modApi.hookFunction('ChatRoomLeave', 0, (args, next) => {
                const result = next(args);
                if (_domObserver) { _domObserver.disconnect(); setDomObserver(null); }
                removePanel();
                clearBCXCache();
                started = false; // 允許下次進房間重建
                return result;
            });
        } else {
            _fallbackInterval = setInterval(() => {
                if (typeof CurrentScreen !== 'undefined' && CurrentScreen === 'ChatRoom') {
                    clearInterval(_fallbackInterval);
                    _fallbackInterval = null;
                    setTimeout(setupDOMObserver, 500);
                }
            }, 1000);
        }
    }

    // ════════════════════════════════════════
    //  初始化
    // ════════════════════════════════════════
    async function initialize() {
        console.log(`🐈‍⬛ [HSC] ⌛ 初始化 v${MOD_VER}...`);
        injectStyles();

        const sdkReady  = await waitForBcModSdk();
        const gameReady = await waitForGame();

        if (!gameReady) {
            console.error('🐈‍⬛ [HSC] ❌ 遊戲載入逾時');
            return;
        }

        // 先載入 i18n（讓預設文本等依語言產生），再等 ExtensionSettings
        await ensureI18n();
        await waitForExtensionSettings();
        // ★ 先把伺服器公告的上次催眠狀態存起來（要在 publishSharedSettings 覆寫前先讀）
        let _savedHypno = null;
        try { _savedHypno = Player?.OnlineSharedSettings?.[ES_KEY]?.hypno || null; } catch (e) {}
        // 還原設定 + 開啟本地 DB + 對外公告
        loadSettings();
        await HSCDB.open();
        publishSharedSettings();
        registerPreferenceScreen();
        applyDepthLoop();
        startHypnoDecay();     // 催眠值每 12 秒 -1
        // 登入還原：依上次公告的催眠進度，還原自己的狀態（與他人一致；不重播儀式、不再發旁白）
        try {
            const hs = _savedHypno;
            console.log('🐈‍⬛ [HSC] 登入還原催眠狀態:', hs);
            if (hs && ((hs.v || 0) > 0 || hs.f)) restoreHypnoState(hs.v, hs.f);
        } catch (e) {}
        // 資料保險：頁面關閉/重整前，強制送出 BC 帳號更新佇列。
        //  BC 的 ServerAccountUpdate 對 OnlineSharedSettings 等是 debounce ~2 秒且「沒有 unload flush」，
        //  關頁/重連若落在這 2 秒內，剛改的資料就永遠不會送出 → 看起來像被清空。這裡補上 flush。
        try {
            if (typeof window !== 'undefined' && !window._hscUnloadFlush) {
                window._hscUnloadFlush = () => { try { if (typeof ServerAccountUpdate?.SyncToServer === 'function') ServerAccountUpdate.SyncToServer(); } catch (e) {} };
                window.addEventListener('pagehide', window._hscUnloadFlush);
                window.addEventListener('beforeunload', window._hscUnloadFlush);
            }
        } catch (e) {}

        if (sdkReady) {
            try {
                setModApi(bcModSdk.registerMod({
                    name:       'liko - HSC',
                    fullName:   "liko's Hypnotic Slave Club",
                    version:    MOD_VER,
                    repository: '沉浸式催眠效果 | Hypnotic Slave Club',
                }));
            } catch (e) {
                console.warn('🐈‍⬛ [HSC] ⚠️ registerMod 失敗，進入相容模式:', e.message);
            }

            if (modApi) {
                try {
                    modApi.onUnload(() => {
                        if (_domObserver)      { _domObserver.disconnect(); setDomObserver(null); }
                        if (_fallbackInterval) { clearInterval(_fallbackInterval); _fallbackInterval = null; }
                        if (_screenGuard)      { clearInterval(_screenGuard); _screenGuard = null; }
                        try { stopHypnoAnim(); updateHeadTalisman(); } catch (e) {}
                        if (_depthTimer)       { clearInterval(_depthTimer); setDepthTimer(null); }
                        removePanel();
                        const overlay = document.getElementById('hsc-overlay');
                        if (overlay) overlay.remove();
                        const styles = document.getElementById('hsc-styles');
                        if (styles) styles.remove();
                        const canvas = document.getElementById('MainCanvas') || document.querySelector('canvas');
                        if (canvas) { canvas.style.filter = ''; canvas.style.transform = ''; }
                    });
                } catch (e) {
                    // 舊版 bcModSdk 不支援 onUnload，忽略即可
                }
            }
        }

        hookDrawCharacter();
        hookGhostDraw();
        hookAtmosphere();      // 催眠模糊/染色（BC 原生繪圖）
        hookOrgasmStage();
        hookProfileButton();
        hookRemoteEdit();
        hookChatInput();       // 只掛 keydown 保底，CommandCombine 在進房間後才註冊
        hookHypnoSpeech();     // 強控中攔截說話
        hookL10n();            // 在地化訊息：接收端依自己語言替換夾帶標記的訊息
        hookCensor();          // 面部/名稱識別障礙（強控中看不清他人臉與名字）
        waitForChatRoom();
        // 邊緣觸發：只在「離開 ChatRoom 的那一刻」清一次暫態特效，
        //  絕不在房內輪詢清除（避免誤清正在播放的特效）。
        if (!_screenGuard) {
            let _lastScreen = (typeof CurrentScreen !== 'undefined') ? CurrentScreen : '';
            _screenGuard = setInterval(() => {
                const cur = (typeof CurrentScreen !== 'undefined') ? CurrentScreen : '';
                if (_lastScreen === 'ChatRoom' && cur !== 'ChatRoom') clearTransientEffects();
                _lastScreen = cur;
            }, 400);
        }
        console.log(`🐈‍⬛ [HSC] ✅ 初始化完成 v${MOD_VER}`);

        // 進入房間後顯示載入提示（一次性）
        let _loadedNotified = false;
        const _loadCheck = setInterval(() => {
            if (typeof CurrentScreen === 'undefined' || CurrentScreen !== 'ChatRoom') return;
            clearInterval(_loadCheck);
            if (_loadedNotified) return;
            _loadedNotified = true;
            setTimeout(() => {
                printChat(ui('loaded', { v: MOD_VER }));
            }, 1000);
        }, 500);
    }


export {
    waitForBcModSdk,
    waitForGame,
    waitForChatRoom,
    initialize,
};
