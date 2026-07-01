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
import { initialize } from './modules/core-init.js';

// 對外公告版本（沿用舊行為：window.Liko.IVH = 版本字串；loader 先設 'loading'）
window.Liko = window.Liko ?? {};
window.Liko.IVH = MOD_VER;

// 對外 API：方便測試、其他插件連動（唯讀取用 / 主動觸發）
window.Liko.IVHApi = {
    version: MOD_VER,
    // 立即觸發一次催眠效果（真實觸發，會發狀態訊息／廣播）
    trigger: (text = '[Voice]') => triggerVoiceEffect(String(text), false),
    // 測試觸發（不發訊息、不廣播）
    test: (text = '[Voice] test') => triggerVoiceEffect(String(text), true),
    // 觸發背景深度效果（1~3；預設用目前深度等級）
    runDepth: (level) => runDepthEffect(level || currentDepthLevel() || 1),
    // 執行 /ivh 子指令（如 'setting' / 'show' / 'help'）
    command: (sub = '') => handleIVHCommand(`/ivh ${sub}`.trim()),
    // 設定存取
    getConfig: () => CONFIG,
    save: () => saveSettings(true),
    reload: () => loadSettings(),
    exportSettings,
    importSettings,
};

initialize();
