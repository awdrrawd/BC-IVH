// ════════════════════════════════════════
//  IVH entry (bundled by vite → assets/main.js)
//  Loader (loader.user.js / loader.local.user.js) dynamically imports this file.
//  Splits the former single-file userscript into ./modules/*.js.
// ════════════════════════════════════════

import { MOD_VER, CONFIG } from './modules/config.js';
import { triggerVoiceEffect } from './modules/util.js';
import { loadSettings, saveSettings, exportSettings, importSettings } from './modules/storage.js';
import { handleIVHCommand } from './modules/commands.js';
import { currentDepthLevel, runDepthEffect } from './modules/depth.js';
import { getHypnoValue, isForced, wake } from './modules/hypno.js';
import { EXT } from './modules/preference.js';
import { initialize } from './modules/core-init.js';

// 對外唯一入口：window.Liko.IVH（版本 + API 合併為同一物件；loader 先設 'loading'）
//  相容：仍可用 window.Liko.IVH 判斷是否載入（物件為 truthy）、用 .version 取版本。
window.Liko = window.Liko ?? {};
window.Liko.IVH = {
    version: MOD_VER,
    // 立即觸發一次催眠效果（真實觸發，會發狀態訊息／廣播）
    trigger: (text = '[Voice]') => triggerVoiceEffect(String(text), false),
    // 測試觸發（不發訊息、不廣播）
    test: (text = '[Voice] test') => triggerVoiceEffect(String(text), true),
    // 觸發背景深度效果
    runDepth: (level) => runDepthEffect(level || currentDepthLevel() || 1),
    // 執行 /ivh 子指令（如 'setting' / 'show' / 'help'）
    command: (sub = '') => handleIVHCommand(`/ivh ${sub}`.trim()),
    // 供其他插件檢測：IVH 是否正在 profile 就地設定頁（類似 bcx.inBcxSubscreen()）
    inSubscreen: () => EXT.ctx === 'remote' && !!EXT.remote,
    // 催眠值（0~100）/ 是否強控中 / 立即清醒
    hypno: () => getHypnoValue(),
    isForced: () => isForced(),
    wake: () => wake(),
    // 設定存取
    getConfig: () => CONFIG,
    save: () => saveSettings(true),
    reload: () => loadSettings(),
    exportSettings,
    importSettings,
};

initialize();
