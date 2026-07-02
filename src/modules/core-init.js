// ── auto-wired cross-module imports ──
import { hookChatInput, printChat } from './commands.js';
import { MOD_VER, modApi, setModApi } from './config.js';
import { _depthTimer, applyDepthLoop, hookGhostDraw, setDepthTimer } from './depth.js';
import { hookAtmosphere, hookDrawCharacter, hookOrgasmStage } from './hooks.js';
import { hookHypnoSpeech } from './hypno-speech.js';
import { startHypnoDecay } from './hypno.js';
import { ensureI18n, ui } from './i18n.js';
import { _domObserver, removePanel, setDomObserver, setupDOMObserver } from './panel.js';
import { hookProfileButton, hookRemoteEdit, registerPreferenceScreen } from './profile.js';
import { IVHDB, loadSettings, publishSharedSettings, waitForExtensionSettings } from './storage.js';
import { injectStyles } from './styles.js';
import { clearBCXCache } from './util.js';

// ════════════════════════════════════════
//  IVH module: core-init.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
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
        console.log(`🐈‍⬛ [IVH] ⌛ 初始化 v${MOD_VER}...`);
        injectStyles();

        const sdkReady  = await waitForBcModSdk();
        const gameReady = await waitForGame();

        if (!gameReady) {
            console.error('🐈‍⬛ [IVH] ❌ 遊戲載入逾時');
            return;
        }

        // 先載入 i18n（讓預設文本等依語言產生），再等 ExtensionSettings
        await ensureI18n();
        await waitForExtensionSettings();
        // 還原設定 + 開啟本地 DB + 對外公告
        loadSettings();
        await IVHDB.open();
        publishSharedSettings();
        registerPreferenceScreen();
        applyDepthLoop();
        startHypnoDecay();     // 催眠值每 12 秒 -1

        if (sdkReady) {
            try {
                setModApi(bcModSdk.registerMod({
                    name:       'liko - IVH',
                    fullName:   "liko's Immersive Voice Hypnosis",
                    version:    MOD_VER,
                    repository: '沉浸式催眠效果 | Immersive Voice Hypnosis',
                }));
            } catch (e) {
                console.warn('🐈‍⬛ [IVH] ⚠️ registerMod 失敗，進入相容模式:', e.message);
            }

            if (modApi) {
                try {
                    modApi.onUnload(() => {
                        if (_domObserver)      { _domObserver.disconnect(); setDomObserver(null); }
                        if (_fallbackInterval) { clearInterval(_fallbackInterval); _fallbackInterval = null; }
                        if (_depthTimer)       { clearInterval(_depthTimer); setDepthTimer(null); }
                        removePanel();
                        const overlay = document.getElementById('ivh-overlay');
                        if (overlay) overlay.remove();
                        const styles = document.getElementById('ivh-styles');
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
        waitForChatRoom();
        console.log(`🐈‍⬛ [IVH] ✅ 初始化完成 v${MOD_VER}`);

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
