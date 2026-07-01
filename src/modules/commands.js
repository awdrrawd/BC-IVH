// ── auto-wired cross-module imports ──
import { CONFIG, MOD_VER, PREF_ID } from './config.js';
import { currentDepthLevel, runDepthEffect } from './depth.js';
import { openCalibratePanel } from './effects.js';
import { triggerClimaxEffect } from './effects2.js';
import { refreshCanvasCache } from './geometry.js';
import { ui } from './i18n.js';
import { _panel, buildPanel, removePanel } from './panel.js';
import { T, triggerVoiceEffect } from './util.js';

// ════════════════════════════════════════
//  IVH module: commands.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  /ivh 指令系統
    // ════════════════════════════════════════
    // timeoutMs: 若 > 0，訊息在 N 毫秒後自動淡出移除
    function printChat(text, timeoutMs = 0) {
        try {
            const log = document.getElementById('TextAreaChatLog');
            if (!log) throw new Error('no log');
            const el = document.createElement('div');
            el.className = 'ChatMessage ChatMessageLocalMessage';
            Object.assign(el.style, {
                background:   'rgba(53,0,155,0.18)',
                borderLeft:   '3px solid rgb(162,71,255)',
                padding:      '4px 8px',
                margin:       '2px 0',
                color:        'rgb(162,71,255)',
                fontSize:     '0.92em',
                fontFamily:   'inherit',
                whiteSpace:   'pre-wrap',
                transition:   'opacity 0.5s ease',
            });
            el.innerHTML = '<span style="opacity:0.6;font-size:0.85em">🌀 IVH</span>　' + text.split('\n').join('<br>');
            log.appendChild(el);
            log.scrollTop = log.scrollHeight;
            if (timeoutMs > 0) {
                setTimeout(() => {
                    el.style.opacity = '0';
                    setTimeout(() => el.remove(), 500);
                }, timeoutMs);
            }
            return;
        } catch(e) {}
        try {
            if (typeof ChatRoomMessage === 'function') {
                ChatRoomMessage({
                    Type:    'LocalMessage',
                    Sender:  Player.MemberNumber,
                    Content: `<font color="#ffb3d9">🌀 [IVH] ${text}</font>`,
                });
                return;
            }
        } catch(e2) {}
    }

    function handleIVHCommand(input) {
        const parts = input.trim().split(/\s+/);
        if (parts[0].toLowerCase() !== '/ivh') return false;

        const sub = (parts[1] ?? '').toLowerCase();

        if (!sub || sub === 'help') {
            printChat(ui('help', { v: MOD_VER }));
            return true;
        }

        if (sub === 'test') {
            const testText = parts.slice(2).join(' ') || '你的意識正在沉睡…放鬆，放鬆…';
            triggerVoiceEffect(testText, true);
            printChat(`🌀 [IVH] 觸發測試效果：「${testText}」`);
            return true;
        }

        if (sub === 'setting' || sub === 'settings') {
            try {
                if (typeof PreferenceSubscreenExtensionsOpen === 'function') {
                    PreferenceSubscreenExtensionsOpen(PREF_ID);
                } else {
                    printChat(ui('cantOpenSettings'));
                }
            } catch (e) {
                printChat('⚠️ ' + T('開啟設定頁失敗','Failed to open settings') + ': ' + e.message);
            }
            return true;
        }

        if (sub === 'climax') {
            triggerClimaxEffect(CONFIG.intensity);
            printChat('💥 [IVH] 高潮特效測試觸發');
            return true;
        }

        if (sub === 'depth') {
            const lv = Math.max(1, Math.min(3, parseInt(parts[2], 10) || currentDepthLevel() || 1));
            refreshCanvasCache();
            runDepthEffect(lv);
            printChat(`🌀 [IVH] 深度效果測試（等級 ${lv}）— 目前為最小版，完整幽靈低語等效果尚未實作`);
            return true;
        }

        if (sub === 'calibrate') {
            openCalibratePanel();
            return true;
        }



        if (sub === 'show') {
            const chatContainer = document.getElementById('TextAreaChatLog') ||
                  document.querySelector('.ChatLog');
            if (!chatContainer) { printChat('⚠️ ' + T('找不到聊天框','Chat box not found')); return true; }
            // 已開啟則關閉並重建（避免殘留舊面板而無法操作）
            if (_panel) removePanel();
            buildPanel(chatContainer);
            return true;
        }



        printChat(ui('cmdUnknown', { sub }));
        return true;
    }

    // ════════════════════════════════════════
    //  Hook 聊天室輸入攔截
    //  策略1: CommandCombine（最佳，與其他插件共存）
    //  策略2: window.ChatRoomSendChat 覆寫（fallback）
    //  策略3: keydown Enter 攔截（最後手段）
    // ════════════════════════════════════════
    function tryRegisterCommand() {
        try {
            if (typeof CommandCombine === 'function') {
                CommandCombine([{
                    Tag: 'ivh',
                    Description: '[IVH] 沉浸式催眠效果指令（/ivh help 查看說明）',
                    Action: (text) => {
                        // CommandCombine 傳入的是去掉 /ivh 後的部分
                        handleIVHCommand('/ivh ' + (text ?? ''));
                    },
                }]);
                return true;
            }
        } catch (e) {
            console.warn('🐈‍⬛ [IVH] CommandCombine 註冊失敗:', e.message);
        }
        return false;
    }

    const _origChatRoomSendChat = window.ChatRoomSendChat;
    function setupSendChatFallback() {
        if (typeof window.ChatRoomSendChat !== 'function') return;
        window.ChatRoomSendChat = function () {
            try {
                const val = ElementValue('InputChat');
                if (typeof val === 'string' && val.trim().startsWith('/ivh')) {
                    handleIVHCommand(val.trim());
                    ElementValue('InputChat', '');
                    return;
                }
            } catch (e) {}
            return _origChatRoomSendChat.apply(this, arguments);
        };
    }

    function setupKeydownFallback() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const input = document.getElementById('InputChat') || document.querySelector('textarea[id*="Chat"]');
            if (!input) return;
            const val = input.value.trim();
            if (!val.startsWith('/ivh')) return;
            handleIVHCommand(val);
            e.preventDefault();
            e.stopPropagation();
            input.value = '';
        }, true);
    }

    // 指令只需要註冊一次
    let _cmdRegistered = false;

    function registerCommandOnce() {
        if (_cmdRegistered) return;
        _cmdRegistered = true;

        if (tryRegisterCommand()) return;

        if (typeof window.ChatRoomSendChat === 'function') {
            setupSendChatFallback();
            return;
        }

        setupKeydownFallback();
    }

    // hookChatInput 只負責掛 keydown 保底（不等 CommandCombine）
    // 真正的 CommandCombine 註冊在進房間後的 setupDOMObserver 一起做
    function hookChatInput() {
        setupKeydownFallback();
    }


export {
    printChat,
    handleIVHCommand,
    tryRegisterCommand,
    setupSendChatFallback,
    setupKeydownFallback,
    registerCommandOnce,
    hookChatInput,
    _origChatRoomSendChat,
};
