// ════════════════════════════════════════
//  HSC module: styles.js
//  (auto-split from Liko - HSC.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  CSS
    // ════════════════════════════════════════
    function injectStyles() {
        if (document.getElementById('hsc-styles')) return;
        const style = document.createElement('style');
        style.id = 'hsc-styles';
        style.textContent = `
            @keyframes hscPinkPulse {
                0%   { opacity: 0; }
                12%  { opacity: 1; }
                65%  { opacity: 0.85; }
                100% { opacity: 0; }
            }
            @keyframes hscVignette {
                0%   { opacity: 0; }
                15%  { opacity: 1; }
                70%  { opacity: 0.9; }
                100% { opacity: 0; }
            }
            @keyframes hscSpiralSpin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            @keyframes hscWaveExpand {
                0%   { width: 10px; height: 10px; opacity: 1; }
                80%  { opacity: 0.4; }
                100% { width: 220px; height: 220px; opacity: 0; }
            }
            @keyframes hscSteamRise0 {
                0%   { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.85; }
                50%  { transform: translateY(-55px) translateX(8px) scale(1.2); opacity: 0.5; }
                100% { transform: translateY(-110px) translateX(15px) scale(0.4); opacity: 0; }
            }
            @keyframes hscSteamRise1 {
                0%   { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.8; }
                50%  { transform: translateY(-50px) translateX(-10px) scale(1.3); opacity: 0.45; }
                100% { transform: translateY(-105px) translateX(-18px) scale(0.3); opacity: 0; }
            }
            @keyframes hscSteamRise2 {
                0%   { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.9; }
                40%  { transform: translateY(-40px) translateX(4px) scale(1.1); opacity: 0.6; }
                100% { transform: translateY(-115px) translateX(-5px) scale(0.35); opacity: 0; }
            }
            @keyframes hscClimaxFlash {
                0%   { opacity: 0; }
                8%   { opacity: 0.85; background: white; }
                30%  { opacity: 0.5; background: rgba(255,100,150,0.7); }
                60%  { opacity: 0.2; }
                100% { opacity: 0; }
            }
            @keyframes hscClimaxShake {
                0%   { transform: translate(0,0) rotate(0deg); }
                15%  { transform: translate(-6px, 4px) rotate(-0.8deg); }
                30%  { transform: translate(5px, -4px) rotate(0.6deg); }
                45%  { transform: translate(-4px, 3px) rotate(-0.5deg); }
                60%  { transform: translate(4px, -2px) rotate(0.4deg); }
                75%  { transform: translate(-2px, 2px) rotate(-0.2deg); }
                100% { transform: translate(0,0) rotate(0deg); }
            }
            @keyframes hscBreath0 {
                0%   { transform: translate(0,0) scale(0.5); opacity: 0; }
                20%  { opacity: 0.9; }
                100% { transform: translate(-34px, 30px) scale(2.1); opacity: 0; }
            }
            @keyframes hscBreath1 {
                0%   { transform: translate(0,0) scale(0.5); opacity: 0; }
                20%  { opacity: 0.9; }
                100% { transform: translate(34px, 30px) scale(2.1); opacity: 0; }
            }
            @keyframes hscBreath2 {
                0%   { transform: translate(0,0) scale(0.55); opacity: 0; }
                25%  { opacity: 0.85; }
                100% { transform: translate(4px, 44px) scale(1.9); opacity: 0; }
            }
            @keyframes hscDemoRing {
                0%   { width: 24px; height: 24px; opacity: 0.95; }
                100% { width: 200px; height: 200px; opacity: 0; }
            }
            @keyframes hscDemoDistort {
                0%   { transform: rotate(0deg) scale(1);     filter: blur(0px); }
                50%  { transform: rotate(8deg) scale(0.92);  filter: blur(2px); }
                100% { transform: rotate(0deg) scale(1);     filter: blur(0px); }
            }
            @keyframes hscWaveChar {
                0%   { transform: translateY(0px); }
                25%  { transform: translateY(-5px); }
                50%  { transform: translateY(0px); }
                75%  { transform: translateY(3px); }
                100% { transform: translateY(0px); }
            }
            @keyframes hscPant {
                0%   { transform: translate(-50%,-50%) scale(0.35); opacity: var(--a0, 0.5); }
                70%  { opacity: calc(var(--a0, 0.5) * 0.45); }
                100% { transform: translate(calc(-50% + var(--dx, 0px)), calc(-50% + var(--dy, -45px))) scale(var(--sc, 2.4)); opacity: 0; }
            }
            @keyframes hscChatEmerge {
                0%   { opacity: 0; filter: blur(6px); transform: translateY(7px); }
                60%  { opacity: 0.85; filter: blur(1.5px); }
                100% { opacity: 1; filter: blur(0); transform: translateY(0); }
            }
            .hsc-chat-emerge { animation: hscChatEmerge 2.2s ease-out both; }
        `;
        document.head.appendChild(style);
    }


export {
    injectStyles,
};
