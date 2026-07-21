// ==UserScript==
// @name         HSC - Hypnotic Slave Club - 本地版
// @name:zh      沉浸式聲音催眠效果 - 本地開發
// @namespace    https://likulisu.dev/
// @version     1.0.2
// @description  HSC 本地開發載入器（從 vite preview 讀取，npm run dev，port 5174）
// @author       莉柯莉絲(Likolisu)
// @supportURL   https://github.com/awdrrawd/BC-HSC
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @icon         https://raw.githubusercontent.com/awdrrawd/liko-tool-Image-storage/refs/heads/main/Images/LOGO_2.png
// @grant        none
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/gh/awdrrawd/liko-Plugin-Repository@main/Plugins/expand/bcmodsdk.js
// ==/UserScript==

window.Liko = window.Liko ?? {};
if (window.Liko.HSC) {
    console.warn('🐈‍⬛ [HSC] ⚠️ 已載入，略過重複匯入。');
} else {
    window.Liko.HSC = 'loading';
    import(`http://localhost:5174/assets/main.js?v=${Date.now()}`)
        .catch(e => console.error('🐈‍⬛ [HSC] 本地載入失敗（vite preview 有開嗎？）:', e));
}

// Local dev loader: reads the bundle from the local vite preview server.
// The ?v= timestamp busts the cache so every reload picks up the latest build.
// Run ` npm run dev ` , then reload BC.
