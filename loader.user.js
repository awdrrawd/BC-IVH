// ==UserScript==
// @name         HSC - Hypnotic Slave Club
// @name:zh      沉浸式聲音催眠效果
// @namespace    https://likulisu.dev/
// @version      1.0.2
// @description  收到 [Voice] 訊息時觸發深度催眠視覺效果，支援 /hsc 指令
// @author       莉柯莉絲(Likolisu)
// @supportURL   https://github.com/awdrrawd/BC-HSC
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @icon         https://raw.githubusercontent.com/awdrrawd/liko-tool-Image-storage/refs/heads/main/Images/LOGO_2.png
// @grant        none
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/gh/awdrrawd/liko-Plugin-Repository@main/Plugins/expand/bcmodsdk.js
// ==/UserScript==

// Thin loader: pulls the built HSC bundle from GitHub Pages and lets it run.
// Source & modules live at https://github.com/awdrrawd/BC-HSC (built by CI to /assets/main.js).
window.Liko = window.Liko ?? {};
if (window.Liko.HSC) {
    console.warn('🐈‍⬛ [HSC] ⚠️ 已載入，略過重複匯入。');
} else {
    // Reserve the flag immediately so a second loader instance bails out here.
    //window.Liko.HSC = 'loading';
    import(`https://awdrrawd.github.io/BC-HSC/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('🐈‍⬛ [HSC] 載入失敗:', e));
}
