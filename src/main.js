// ════════════════════════════════════════
//  HSC entry (bundled by vite → assets/main.js)
//  Loader (loader.user.js / loader.local.user.js) dynamically imports this file.
//  Modules are grouped by area under ./<category>/:
//    core/    — config, storage, hooks, lifecycle (core-init), commands
//    i18n/    — i18n, l10n
//    util/    — util, text, geometry, icons, zlayers, calibrate (shared helpers/tools)
//    ui/      — panel, preference, profile, styles
//    hypno/   — hypno (state), hypno-speech, hypno-anim, hypno-orb
//    effects/ — one effect per file: pink-flash, vignette, spiral, waves, distort,
//               danmaku, breath, climax; plus atmosphere, crowd, censor, depth,
//               character-fx, state-fx, sound, run (orchestration)
// ════════════════════════════════════════

import { MOD_VER, CONFIG } from './core/config.js';
import { triggerVoiceEffect } from './util/util.js';
import { loadSettings, saveSettings, exportSettings, importSettings } from './core/storage.js';
import { handleHSCCommand } from './core/commands.js';
import { currentDepthLevel, runDepthEffect } from './effects/depth.js';
import { getHypnoValue, isForced, wake } from './hypno/hypno.js';
import { playHypnoAnim } from './hypno/hypno-anim.js';
import { EXT } from './ui/preference.js';
import { l10nTest } from './i18n/l10n.js';
import { initialize } from './core/core-init.js';

// 對外唯一入口：window.Liko.HSC（版本 + API 合併為同一物件；loader 先設 'loading'）
//  相容：仍可用 window.Liko.HSC 判斷是否載入（物件為 truthy）、用 .version 取版本。
window.Liko = window.Liko ?? {};
window.Liko.HSC = {
    version: MOD_VER,
    // 立即觸發一次催眠效果（真實觸發，會發狀態訊息／廣播）
    trigger: (text = '[Voice]') => triggerVoiceEffect(String(text), false),
    // 測試觸發（不發訊息、不廣播）
    test: (text = '[Voice] test') => triggerVoiceEffect(String(text), true),
    // 觸發背景深度效果
    runDepth: (level) => runDepthEffect(level || currentDepthLevel() || 1),
    // 執行 /hsc 子指令（如 'setting' / 'show' / 'help'）
    command: (sub = '') => handleHSCCommand(`/hsc ${sub}`.trim()),
    // 供其他插件檢測：HSC 是否正在 profile 就地設定頁（類似 bcx.inBcxSubscreen()）
    inSubscreen: () => EXT.ctx === 'remote' && !!EXT.remote,
    // 催眠值（0~100）/ 是否強控中 / 立即清醒
    hypno: () => getHypnoValue(),
    isForced: () => isForced(),
    wake: () => wake(),
    // 直接播一次符咒儀式動畫（測試用，免催到 100%）
    anim: () => playHypnoAnim(),
    // 設定存取
    getConfig: () => CONFIG,
    save: () => saveSettings(true),
    reload: () => loadSettings(),
    exportSettings,
    importSettings,
    // POC：發一條亂碼訊息並夾帶翻譯標記（驗證接收端在地化）
    l10nTest: (key) => l10nTest(key),
};

initialize();
