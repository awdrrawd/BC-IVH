// ── auto-wired cross-module imports ──
import { _expandExpr, captureFaceImage, cycleExpression, saveExpression } from './character-fx.js';
import { CONFIG, DEFAULT_EXPRESSIONS, MOD_VER, setExpressionSets } from './config.js';
import { applyDepthLoop } from './depth.js';
import { IVH_LANGS, IVH_LANG_NAMES, ui } from './i18n.js';
import { WL_TOKENS } from './panel.js';
import { ivhConfirm } from './profile.js';
import { SOUND_DEFAULTS, SOUND_PRESETS, _sndNameCache, deleteLocalSound, playSoundEntry, uploadSoundFile } from './sound.js';
import { IVHDB, exportSettings, importSettings, publishSharedSettings, saveSettings } from './storage.js';
import { IVH_Z } from './zlayers.js';

// ════════════════════════════════════════
//  IVH module: preference.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  設定頁（PreferenceRegisterExtensionSetting）
    //  佈局：左側分頁鈕 / 中間內容區 / 右側 1350 說明框
    // ════════════════════════════════════════
    function waitForPreference() {
        return new Promise(resolve => {
            const check = () => {
                if (typeof PreferenceRegisterExtensionSetting === 'function' &&
                    typeof TranslationLanguage !== 'undefined') resolve();
                else setTimeout(check, 500);
            };
            check();
        });
    }

    // 分頁定義（key 對應繪製函式 _run_<key>）
    //  self   = 在「個人設定」（偏好頁）出現
    //  remote = 在「訪問別人」（profile 就地設定頁）出現
    //  remotePerm(remote) = 訪問模式下，依權限決定此分頁是否顯示（回傳 false 則隱藏）
    //  之後要擴充別人可遠端設定的項目，只要在此新增分頁並標 remote:true 即可。
    const IVH_TABS = [
        { key: 'basic',   label: () => ui('tab_basic'),   self: true,  remote: false },
        { key: 'effects', label: () => ui('tab_effects'), self: true,  remote: false },
        { key: 'texts',   label: () => ui('tab_texts'),   self: true,  remote: true,
          remotePerm: r => r && r.cats && r.cats.length > 0 },
        { key: 'expr',    label: () => ui('tab_expr'),    self: true,  remote: false },
        { key: 'sounds',  label: () => ui('tab_sounds'),  self: true,  remote: false },
        { key: 'about',   label: () => ui('tab_about'),   self: true,  remote: false },
    ];

    // 內容框（中間區）與卷軸視窗
    const FRAME_X = 475, FRAME_Y = 178, FRAME_W = 850, FRAME_H = 732;
    const CONTENT_X = 500;                 // 內容左緣
    const CONTENT_TOP = 200;               // 內容第一列基準 y
    const FRAME_BOT = FRAME_Y + FRAME_H;   // 視窗底

    const EXT = {
        activeTab: 'basic',
        hoverDesc: '',
        scroll: 0,
        _maxScroll: 0,
        _contentBottom: 0,
        _mid: [],          // 中間區互動控制 [{x,y,w,h,onClick}]
        _drag: null,       // 滑桿拖曳中 {x,w,min,max,step,key,save}
        _inputs: {},       // DOM 輸入框 id -> element
        _inputsUsed: null, // 本幀用到的 input id

        // ── 情境：'self'（個人偏好頁）/ 'remote'（就地訪問別人）──
        ctx: 'self',
        remote: null,      // remote 模式資料：{ C, name, cats:[{key,dictKey,editable,data:[]}], onSave, dirty }

        // 目前情境下可見的分頁（remote 再過 remotePerm 權限）
        _tabsFor() {
            return IVH_TABS.filter(t => t[this.ctx] && (this.ctx !== 'remote' || !t.remotePerm || t.remotePerm(this.remote)));
        },

        // ── 就地開啟訪問別人的設定頁（由 profile 按鈕呼叫）──
        openRemote(remoteData) {
            this.ctx = 'remote';
            this.remote = remoteData;
            const tabs = this._tabsFor();
            this.activeTab = tabs.length ? tabs[0].key : 'texts';
            this.scroll = 0;
            this.load();
        },
        closeRemote() {
            this._cleanup();
            this.ctx = 'self';
            this.remote = null;
            this.activeTab = 'basic';
            this.scroll = 0;
        },

        // ── 生命週期 ──
        load() {
            this.scroll = 0;
            this._bindCanvasEvents();
            // 開設定頁時重新公告：讓 $owner/$lover/$friend/$white 依目前關係即時更新對外白名單
            try { publishSharedSettings(); } catch (e) {}
        },
        unload() { this._cleanup(); },
        exit() { this.hoverDesc = ''; this._cleanup(); },
        _cleanup() {
            this._restoreExpr();
            this._unbindCanvasEvents();
            for (const id in this._inputs) { try { this._inputs[id].remove(); } catch {} }
            this._inputs = {};
            this._drag = null;
            if (this._demoEl) { try { this._demoEl.remove(); } catch {} this._demoEl = null; this._demoCur = ''; }
        },

        // ── canvas 事件（拖曳滑桿 / 滾輪卷軸）──
        _bindCanvasEvents() {
            if (this._bound) return;
            const cv = document.getElementById('MainCanvas') || document.querySelector('canvas');
            if (!cv) return;
            this._cv = cv;
            this._onDown  = e => this._handleDown(e);
            this._onMove  = e => this._handleMove(e);
            this._onUp    = e => this._handleUp(e);
            this._onWheel = e => this._handleWheel(e);
            cv.addEventListener('mousedown', this._onDown);
            window.addEventListener('mousemove', this._onMove);
            window.addEventListener('mouseup', this._onUp);
            cv.addEventListener('wheel', this._onWheel, { passive: false });
            this._bound = true;
        },
        _unbindCanvasEvents() {
            if (!this._bound || !this._cv) return;
            this._cv.removeEventListener('mousedown', this._onDown);
            window.removeEventListener('mousemove', this._onMove);
            window.removeEventListener('mouseup', this._onUp);
            this._cv.removeEventListener('wheel', this._onWheel);
            this._bound = false;
        },
        _evCoords(e) {
            const r = this._cv.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) / r.width  * 2000,
                y: (e.clientY - r.top)  / r.height * 1000,
            };
        },
        _handleDown(e) {
            const p = this._evCoords(e);
            // 命中卷軸 → 開始拖曳卷軸
            const sb = this._sb;
            if (sb && p.x >= sb.x - 6 && p.x <= sb.x + sb.w + 6 && p.y >= sb.trackTop && p.y <= sb.trackTop + sb.trackH) {
                const onThumb = p.y >= sb.thumbY && p.y <= sb.thumbY + sb.thumbH;
                this._sbDrag = { grab: onThumb ? (p.y - sb.thumbY) : sb.thumbH / 2 };
                this._applyScrollDrag(p.y);
                return;
            }
            // 命中滑桿 → 開始拖曳並立即跳到該位置
            for (const c of this._mid) {
                if (c.slider && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
                    this._drag = c.slider;
                    this._applyDrag(p.x);
                    return;
                }
            }
        },
        _handleMove(e) {
            if (this._sbDrag) { this._applyScrollDrag(this._evCoords(e).y); return; }
            if (!this._drag) return;
            this._applyDrag(this._evCoords(e).x);
        },
        _handleUp() {
            if (this._sbDrag) { this._sbDrag = null; return; }
            if (!this._drag) return;
            const s = this._drag; this._drag = null;
            if (s.save) s.save();
        },
        _applyScrollDrag(py) {
            const sb = this._sb; if (!sb || this._maxScroll <= 0) return;
            const thumbY = py - this._sbDrag.grab;
            const denom = sb.trackH - sb.thumbH;
            const ratio = denom > 0 ? (thumbY - sb.trackTop) / denom : 0;
            this.scroll = Math.max(0, Math.min(this._maxScroll, ratio * this._maxScroll));
        },
        _applyDrag(px) {
            const s = this._drag; if (!s) return;
            let t = (px - s.x) / s.w; t = Math.max(0, Math.min(1, t));
            let v = s.min + t * (s.max - s.min);
            v = Math.round(v / s.step) * s.step;
            v = Math.max(s.min, Math.min(s.max, parseFloat(v.toFixed(2))));
            s.set(v);
        },
        _handleWheel(e) {
            const p = this._evCoords(e);
            // 右側面板卷動（如音效庫）
            if (p.x >= 1350 && p.x <= 1900 && p.y >= 200 && p.y <= 900 && this._rmaxScroll > 0) {
                e.preventDefault();
                this._rscroll = Math.max(0, Math.min(this._rmaxScroll, (this._rscroll || 0) + (e.deltaY > 0 ? 50 : -50)));
                return;
            }
            if (p.x < FRAME_X || p.x > FRAME_X + FRAME_W || p.y < FRAME_Y || p.y > FRAME_BOT) return;
            if (this._maxScroll <= 0) return;
            e.preventDefault();
            this.scroll = Math.max(0, Math.min(this._maxScroll, this.scroll + (e.deltaY > 0 ? 60 : -60)));
        },

        // ── 主繪製 ──
        run() {
            this.hoverDesc = '';
            this._defaultDesc = '';   // 各分頁可設「常駐說明」，沒有 hover 時顯示
            this._demoKind = '';
            this._rmaxScroll = 0;
            this._mid = [];
            this._inputsUsed = new Set();

            const remote = this.ctx === 'remote';
            const tabs = this._tabsFor();
            // 標題 + 離開鈕
            DrawText(remote ? ui('remoteEditTitle', { name: this.remote?.name || '' })
                            : 'Immersive Voice Hypnosis  v' + MOD_VER,
                     950, 110, 'Black', '');
            DrawButton(1815, 75, 90, 90, '', 'White', 'Icons/Exit.png', ui('exit'));

            // 左上「IVH 啟用」主開關（僅個人設定）
            if (!remote) {
                DrawButton(150, 230, 300, 50,
                           CONFIG.enabled ? ui('enabledOn') : ui('enabledOff'),
                           CONFIG.enabled ? '#8E44A1' : 'White', '', '', false);
                if (MouseIn(150, 230, 300, 50)) this.hoverDesc = ui('enabledDesc');
            }

            // 左側分頁鈕（依情境過濾）
            tabs.forEach((tab, i) => {
                const y = 330 + i * 95;
                DrawButton(150, y, 300, 50, tab.label(),
                           this.activeTab === tab.key ? '#8E44A1' : 'White', '', '', false);
            });

            // 右側區（說明框；某些分頁改用它放編輯面板）
            DrawEmptyRect(1350, 200, 550, 700, 'White');
            const rightPanel = this['_right_' + this.activeTab];
            const hasRight = typeof rightPanel === 'function';
            if (!hasRight) DrawText(ui('info'), 1625, 235, 'Black', '');

            // 中間內容框 + 卷軸裁切
            DrawEmptyRect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H, '#888');
            MainCanvas.save();
            MainCanvas.beginPath();
            MainCanvas.rect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H);
            MainCanvas.clip();
            this._contentBottom = CONTENT_TOP;
            const drawer = this['_run_' + this.activeTab];
            if (typeof drawer === 'function') drawer.call(this);
            MainCanvas.restore();

            // 卷軸計算 + 軌道（可拖曳）
            this._maxScroll = Math.max(0, this._contentBottom - FRAME_BOT + 20);
            if (this._maxScroll > 0) {
                const trackTop = FRAME_Y + 4;
                const trackH = FRAME_H - 8;
                const thumbH = Math.max(40, trackH * (FRAME_H / (this._contentBottom - CONTENT_TOP + 40)));
                const thumbY = trackTop + (trackH - thumbH) * (this.scroll / this._maxScroll);
                const sbX = FRAME_X + FRAME_W - 17;
                DrawRect(sbX, trackTop, 14, trackH, '#333');
                DrawRect(sbX, thumbY, 14, thumbH, this._sbDrag ? '#ff80cc' : '#c060c0');
                this._sb = { x: sbX, w: 14, trackTop, trackH, thumbY, thumbH };
            } else { this._sb = null; if (this.scroll !== 0) this.scroll = 0; }

            // 右側：分頁編輯面板 或 說明文字＋動畫
            if (hasRight) {
                rightPanel.call(this);
                this._renderDemo('');   // 隱藏動畫
            } else {
                // hover 說明優先；沒有 hover 時顯示分頁常駐說明（標題說明常駐、停在其他標題時替換）
                const desc = this.hoverDesc || this._defaultDesc;
                if (desc)
                    DrawTextWrap(desc, 1370, 260, 510, 260, 'Black', undefined, 6);
                this._renderDemo(this._demoKind);
            }

            // 隱藏本幀未使用 / 卷出視窗的 DOM 輸入框
            for (const id in this._inputs) {
                if (!this._inputsUsed.has(id)) this._inputs[id].style.display = 'none';
            }
        },

        // ── 說明區動畫示範 ──
        _ensureDemoEl() {
            if (!this._demoEl) {
                const el = document.createElement('div');
                Object.assign(el.style, {
                    position: 'fixed', zIndex: IVH_Z.prefInput, pointerEvents: 'none',
                    overflow: 'hidden', borderRadius: '8px',
                    background: 'rgba(10,0,18,0.6)',
                    display: 'none',
                });
                document.body.appendChild(el);
                this._demoEl = el;
                this._demoCur = '';
            }
            return this._demoEl;
        },
        _renderDemo(kind) {
            const el = this._ensureDemoEl();
            if (!kind) { el.style.display = 'none'; this._demoCur = ''; return; }
            // 定位於說明框下半部（canvas 座標 1370,560 510×320）
            const cv = this._cv || document.getElementById('MainCanvas') || document.querySelector('canvas');
            if (!cv) { el.style.display = 'none'; return; }
            const r = cv.getBoundingClientRect();
            const sx = r.width / 2000, sy = r.height / 1000;
            el.style.display = '';
            el.style.left   = (r.left + 1370 * sx) + 'px';
            el.style.top    = (r.top  + 560  * sy) + 'px';
            el.style.width  = (510 * sx) + 'px';
            el.style.height = (320 * sy) + 'px';
            if (this._demoCur !== kind) { this._demoCur = kind; el.innerHTML = this._demoHTML(kind); }
        },
        _demoHTML(kind) {
            const W = (inner) => `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative">${inner}</div>`;
            switch (kind) {
                case 'hypnoSpiral': {
                    // 真正的阿基米德螺旋線（與實際效果一致）
                    const turns = 3, pts = 120; let d = '';
                    for (let i = 0; i <= turns * pts; i++) {
                        const a = (i / pts) * Math.PI * 2;
                        const r = (i / (turns * pts)) * 88;
                        const x = (r * Math.cos(a)).toFixed(1);
                        const y = (r * Math.sin(a)).toFixed(1);
                        d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
                    }
                    return W(`<svg viewBox="-100 -100 200 200" width="150" height="150" style="animation:ivhSpiralSpin 2.6s linear infinite;filter:drop-shadow(0 0 6px #ff66bb)">
                        <path d="${d}" fill="none" stroke="#ff88cc" stroke-width="3.5" stroke-linecap="round"/>
                        <circle cx="0" cy="0" r="5" fill="#ffe6f5"/>
                    </svg>`);
                }
                case 'hypnoWaves':
                    return W(['0s','0.6s','1.2s'].map(d=>`<div style="position:absolute;width:24px;height:24px;border:3px solid #ff88cc;border-radius:50%;animation:ivhDemoRing 1.8s ease-out ${d} infinite"></div>`).join(''));
                case 'pinkFlash':
                    return W(`<div style="width:200px;height:130px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,105,180,0.55) 30%,rgba(255,60,150,0.1) 100%);animation:ivhPinkPulse 2s ease-in-out infinite"></div>`);
                case 'vignette':
                    return W(`<div style="width:230px;height:150px;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,0.85) 100%);animation:ivhVignette 2.6s ease-in-out infinite"></div>`);
                case 'screenDistort':
                    return W(`<div style="font-size:54px;animation:ivhDemoDistort 1.8s ease-in-out infinite">🔮</div>`);
                case 'danmaku':
                    return W('催眠中…'.split('').map((c,i)=>`<span style="display:inline-block;font-size:30px;color:#ffd6eb;text-shadow:0 0 10px #ff50a0;animation:ivhWaveChar 1.6s ease-in-out ${i*90}ms infinite">${c}</span>`).join(''));
                case 'steamParticles':
                    return W(['0s','0.4s','0.8s','0.6s'].map((d,i)=>`<div style="position:absolute;left:50%;top:58%;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.55),transparent 70%);filter:blur(4px);animation:ivhBreath${i%3} 1.9s ease-out ${d} infinite"></div>`).join(''));
                case 'climax':
                    return W(`<div style="width:210px;height:140px;border-radius:8px;background:white;animation:ivhClimaxFlash 1.3s ease-out infinite"></div>`);
                case 'centerHeadshot':
                    return W(`<div style="width:120px;height:120px;border-radius:50%;border:3px solid #ff80cc;background:radial-gradient(circle,#3a1040,#1a0028);box-shadow:0 0 30px #ff66bb88;display:flex;align-items:center;justify-content:center;font-size:48px">🙂</div>`);
                case 'ghost':
                    return W(`<div style="position:relative;width:180px;height:180px">
                        <div style="position:absolute;left:18px;top:30px;width:90px;height:140px;border-radius:40px 40px 0 0;background:rgba(8,2,14,0.85);animation:ivhPinkPulse 2.4s ease-in-out infinite"></div>
                        <div style="position:absolute;left:70px;top:0;font-size:16px;color:#ffd6eb;text-shadow:0 0 8px #b050c8;animation:ivhWaveChar 1.8s ease-in-out infinite">好乖…</div>
                    </div>`);
                case 'figureBlur':
                    return W(`<div style="position:relative;width:200px;height:150px;border-radius:8px;background:repeating-linear-gradient(45deg,#5a3a6a,#5a3a6a 10px,#42284f 10px,#42284f 20px);filter:blur(5px);animation:ivhPinkPulse 2.4s ease-in-out infinite"></div>
                        <div style="position:absolute;width:70px;height:110px;border-radius:30px 30px 0 0;background:#caa6e6"></div>`);
                case 'chatlogBlur':
                    return W(`<div style="width:200px;animation:ivhPinkPulse 2.4s ease-in-out infinite">
                        ${[0,1,2,3].map(()=>`<div style="height:12px;margin:8px 0;border-radius:6px;background:#caa6e6;filter:blur(2.5px)"></div>`).join('')}
                    </div>`);
                case 'chatFade':
                    return W(`<div style="width:200px">
                        ${[0,1,2].map(i=>`<div style="height:13px;margin:9px 0;border-radius:6px;background:#caa6e6;animation:ivhChatEmerge 2.2s ease-out ${(i*0.55).toFixed(2)}s infinite"></div>`).join('')}
                    </div>`);
                default: {
                    const map = { expression:'😳', arousal:'💗', sound:'🔊', dualSound:'🔊', emoteEnabled:'📢' };
                    return W(`<div style="font-size:74px;opacity:0.9;animation:ivhPinkPulse 2.2s ease-in-out infinite">${map[kind]||'✨'}</div>`);
                }
            }
        },

        click() {
            const remote = this.ctx === 'remote';
            const tabs = this._tabsFor();
            if (MouseIn(1815, 75, 90, 90)) {
                if (remote) this.closeRemote();
                else if (typeof PreferenceExit === 'function') PreferenceExit();
                return;
            }
            if (!remote && MouseIn(150, 230, 300, 50)) { CONFIG.enabled = !CONFIG.enabled; saveSettings(); return; }
            for (let i = 0; i < tabs.length; i++) {
                if (MouseIn(150, 330 + i * 95, 300, 50)) {
                    if (this.activeTab !== tabs[i].key) {
                        if (this.activeTab === 'expr') this._restoreExpr();  // 離開表情分頁還原
                        this.activeTab = tabs[i].key; this.scroll = 0; this._rscroll = 0;
                    }
                    return;
                }
            }
            // 右側面板控制（不受內容框限制）
            for (const c of this._mid) {
                if (c.right && c.onClick && MouseIn(c.x, c.y, c.w, c.h)) { c.onClick(); return; }
            }
            // 中間區控制（須在內容框內，且非拖曳）
            if (MouseY < FRAME_Y || MouseY > FRAME_BOT) return;
            for (const c of this._mid) {
                if (!c.right && c.onClick && MouseIn(c.x, c.y, c.w, c.h)) { c.onClick(); return; }
            }
        },

        // 右側面板按鈕（絕對座標，不卷動）
        rbtn(x, y, w, h, label, color, desc, onClick) {
            DrawButton(x, y, w, h, label, color || 'White', '', '', false);
            if (desc && MouseIn(x, y, w, h)) this._rdesc = desc;
            this._mid.push({ x, y, w, h, onClick, right: true });
        },

        // 表情編輯預覽：在「克隆角色」上套表情並截臉
        //  → 完全不碰真實 Player，不會觸發 WCE 重新同步（避免連線速率問題）
        //  只在表情改變時重建（非每幀），CharacterLoadCanvas 非同步 → 多截幾次
        _ensureExprPreview(work) {
            if (!work) return;
            const key = JSON.stringify(work);
            if (key === this._exprPrevKey) return;
            this._exprPrevKey = key;
            try {
                const map = _expandExpr(work);
                const clone = Object.assign(Object.create(Object.getPrototypeOf(Player)), Player);
                clone.MemberNumber = -77777;
                clone.Appearance = Player.Appearance.map(a => {
                    const gn = a.Asset.Group.Name;
                    if (map[gn] === undefined) return a;
                    const na = Object.assign({}, a);
                    na.Property = Object.assign({}, a.Property);
                    na.Property.Expression = map[gn];
                    return na;
                });
                clone.Canvas = null; clone.CanvasBlink = null; clone.MustDraw = true;
                CharacterLoadCanvas(clone);
                const cap = () => captureFaceImage(img => { this._exprFaceImg = img; }, clone.Canvas);
                cap(); setTimeout(cap, 160); setTimeout(cap, 420);
            } catch (e) {}
        },
        // 不再改動真實 Player → 無需還原（保留空殼相容舊呼叫）
        _restoreExpr() { this._exprPrevKey = ''; this._exprFaceImg = null; },

        // ── 中間區繪製工具（cy 為內容座標，繪製時自動扣卷軸）──
        _y(cy) { return cy - this.scroll; },
        _track(cyBottom) { if (cyBottom > this._contentBottom) this._contentBottom = cyBottom; },

        // 純標題（不可按，hover 顯示說明）
        title(cy, text, desc) {
            const y = this._y(cy);
            const prev = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
            DrawTextFit(text, CONTENT_X, y, 260, 'Black', '');
            MainCanvas.textAlign = prev;
            this._track(cy + 20);
            if (desc && MouseIn(CONTENT_X, y - 20, 260, 40) && MouseY >= FRAME_Y && MouseY <= FRAME_BOT)
                this.hoverDesc = desc;
        },
        // 分隔標題（置中）
        sep(cy, text) {
            DrawText(text, 900, this._y(cy), 'Black', '');
            this._track(cy + 15);
        },
        // 一般按鈕（demoKind：hover 時在說明區下方顯示對應動畫）
        btn(cx, cy, w, h, label, color, desc, onClick, demoKind) {
            const y = this._y(cy);
            DrawButton(cx, y, w, h, label, color || 'White', '', '', false);
            this._track(cy + h);
            if (MouseIn(cx, y, w, h) && MouseY >= FRAME_Y && MouseY <= FRAME_BOT) {
                if (desc) this.hoverDesc = desc;
                if (demoKind) this._demoKind = demoKind;
            }
            this._mid.push({ x: cx, y, w, h, onClick });
        },
        // 開關按鈕（on=反紫）
        toggle(cx, cy, w, h, label, on, desc, onClick, demoKind) {
            this.btn(cx, cy, w, h, label, on ? '#8E44A1' : 'White', desc, onClick, demoKind);
        },
        // 滑桿（可拖曳；key 用於儲存）
        slider(cx, cy, w, val, min, max, step, desc, setFn, saveFn) {
            const y = this._y(cy);
            const t = (val - min) / (max - min);
            DrawRect(cx, y + 16, w, 6, '#666');
            DrawRect(cx, y + 16, Math.round(w * t), 6, '#c060c0');
            DrawRect(Math.round(cx + w * t) - 6, y + 6, 12, 26, 'White');
            this._track(cy + 40);
            if (desc && MouseIn(cx, y, w, 40) && MouseY >= FRAME_Y && MouseY <= FRAME_BOT) this.hoverDesc = desc;
            this._mid.push({ x: cx, y, w, h: 40,
                slider: { x: cx, w, min, max, step, set: setFn, save: saveFn } });
        },
        // DOM 輸入框（cy 內容座標；卷出視窗自動隱藏）
        input(id, cx, cy, w, h, value, opts) {
            opts = opts || {};
            this._inputsUsed.add(id);
            let el = this._inputs[id];
            if (!el) {
                el = document.createElement(opts.multiline ? 'textarea' : 'input');
                if (!opts.multiline) el.type = opts.type || 'text';
                Object.assign(el.style, {
                    position: 'fixed', zIndex: IVH_Z.prefInput, boxSizing: 'border-box',
                    background: '#301B3D', color: '#ffeeff',
                    border: '1px solid #b060c0', borderRadius: '4px',
                    padding: '2px 6px', fontFamily: 'monospace', outline: 'none',
                    resize: 'none',
                });
                if (opts.placeholder) el.placeholder = opts.placeholder;
                if (opts.readOnly) { el.readOnly = true; el.style.opacity = '0.55'; el.style.cursor = 'not-allowed'; }
                el.addEventListener('keydown', ev => ev.stopPropagation());
                // 滑鼠停在輸入框上時，若框本身不需捲動或已到邊界，把滾輪交給設定頁卷軸
                el.addEventListener('wheel', (ev) => {
                    const canScroll = el.scrollHeight > el.clientHeight + 1;
                    const atTop = el.scrollTop <= 0, atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                    if ((!canScroll || (ev.deltaY < 0 && atTop) || (ev.deltaY > 0 && atBot)) && this._maxScroll > 0) {
                        ev.preventDefault();
                        this.scroll = Math.max(0, Math.min(this._maxScroll, this.scroll + (ev.deltaY > 0 ? 60 : -60)));
                    }
                }, { passive: false });
                el.addEventListener('input',  () => { if (opts.onChange) opts.onChange(el.value); });
                el.addEventListener('change', () => { if (opts.onChange) opts.onChange(el.value); });
                el.addEventListener('blur',   () => { if (opts.onChange) opts.onChange(el.value); });
                document.body.appendChild(el);
                this._inputs[id] = el;
            }
            if (document.activeElement !== el) el.value = value;
            const y = this._y(cy);
            this._track(cy + h);
            // 卷出視窗 → 隱藏
            if (y < FRAME_Y || y + h > FRAME_BOT) { el.style.display = 'none'; return; }
            const r = this._cv ? this._cv.getBoundingClientRect()
                               : (document.getElementById('MainCanvas') || document.querySelector('canvas')).getBoundingClientRect();
            const sx = r.width / 2000, sy = r.height / 1000;
            el.style.display = '';
            el.style.left   = (r.left + cx * sx) + 'px';
            el.style.top    = (r.top  + y  * sy) + 'px';
            el.style.width  = (w * sx) + 'px';
            el.style.height = (h * sy) + 'px';
            el.style.fontSize = Math.round(20 * sy) + 'px';
        },

        // 原生下拉選單（點開即有卷軸）；options = [[value,label],...]
        select(id, cx, cy, w, h, value, options, onChange) {
            this._inputsUsed.add(id);
            let el = this._inputs[id];
            if (!el) {
                el = document.createElement('select');
                Object.assign(el.style, {
                    position: 'fixed', zIndex: IVH_Z.prefInput, boxSizing: 'border-box',
                    background: '#8E44A1', color: '#ffffff',
                    border: '1px solid #b060c0', borderRadius: '4px',
                    padding: '2px 6px', fontFamily: 'sans-serif', outline: 'none', cursor: 'pointer',
                });
                el.addEventListener('keydown', ev => ev.stopPropagation());
                el.addEventListener('change', () => { if (onChange) onChange(el.value); });
                document.body.appendChild(el);
                this._inputs[id] = el;
            }
            const sig = options.map(o => o[0] + ':' + o[1]).join('|');
            if (el._sig !== sig) {
                el._sig = sig; el.innerHTML = '';
                for (const [val, label] of options) {
                    const o = document.createElement('option');
                    o.value = val; o.textContent = label;
                    o.style.background = '#301B3D'; o.style.color = '#ffffff';
                    el.appendChild(o);
                }
            }
            if (document.activeElement !== el) el.value = value;
            const y = this._y(cy);
            this._track(cy + h);
            if (y < FRAME_Y || y + h > FRAME_BOT) { el.style.display = 'none'; return; }
            const r = this._cv ? this._cv.getBoundingClientRect()
                               : (document.getElementById('MainCanvas') || document.querySelector('canvas')).getBoundingClientRect();
            const sx = r.width / 2000, sy = r.height / 1000;
            el.style.display = '';
            el.style.left   = (r.left + cx * sx) + 'px';
            el.style.top    = (r.top  + y  * sy) + 'px';
            el.style.width  = (w * sx) + 'px';
            el.style.height = (h * sy) + 'px';
            el.style.fontSize = Math.round(20 * sy) + 'px';
        },

        // 深度效果層定義
        // ════════ 基本設定 ════════
        _run_basic() {
            const prev = MainCanvas.textAlign;
            // 依標註間距排版：RED=20（群組間）、GREEN=10（次群組）、BLUE=5（同群組相鄰列）
            //  每列依「上一列控制底部 + 間距 + 本列控制頂端相對基準的位移」推算標題基準 ty
            const RED = 20, GREEN = 10, BLUE = 5;
            const TH = 18;       // 標題文字半高（估）
            const CTRL_X = 700;  // 所有控制欄統一左緣（避免深度區與標籤太擠）
            let ty, bottom;

            // ── 群組 1：催眠強度（slider 在 ty-17、value/title 約 ±18）──
            ty = 226;
            this.title(ty, ui('intensity'), ui('intensityD'));
            this.slider(700, ty - 17, 380, CONFIG.intensity, 0.1, 3.0, 0.1, ui('intensityD'),
                v => { CONFIG.intensity = v; }, () => saveSettings());
            DrawText(CONFIG.intensity.toFixed(1), 1130, this._y(ty), 'Black', '');
            bottom = ty + TH;

            const numRight = (v, ty2) => { const _p = MainCanvas.textAlign; MainCanvas.textAlign = 'left'; DrawText(String(v), 1130, this._y(ty2), 'Black', ''); MainCanvas.textAlign = _p; };

            // ── 群組 2：興奮值（0~20）──
            ty = bottom + RED + 17;
            this.title(ty, ui('arousalStepLabel'), ui('arousalStepD'));
            this.slider(700, ty - 17, 380, CONFIG.arousalStep, 0, 20, 1, ui('arousalStepD'),
                v => { CONFIG.arousalStep = Math.round(v); }, () => saveSettings());
            numRight(CONFIG.arousalStep, ty);
            bottom = ty + TH;

            // ── 群組 3：催眠值（側邊開/關 + 語音/深度兩個值）──
            ty = bottom + RED + 22;
            this.title(ty, ui('hypnoLabel'), ui('hypnoD'));
            this.toggle(CTRL_X, ty - 20, 116, 40, CONFIG.hypnoEnabled ? ui('on') : ui('off'), CONFIG.hypnoEnabled, ui('hypnoD'),
                () => { CONFIG.hypnoEnabled = !CONFIG.hypnoEnabled; saveSettings(); });
            bottom = ty + 20;

            ty = bottom + BLUE + 17;
            this.title(ty, ui('hypnoVoiceLabel'), ui('hypnoVoiceD'));
            this.slider(700, ty - 17, 380, CONFIG.hypnoVoiceStep, 0, 20, 1, ui('hypnoVoiceD'),
                v => { CONFIG.hypnoVoiceStep = Math.round(v); }, () => saveSettings());
            numRight(CONFIG.hypnoVoiceStep, ty);
            bottom = ty + TH;

            ty = bottom + BLUE + 17;
            this.title(ty, ui('hypnoDepthLabel'), ui('hypnoDepthD'));
            this.slider(700, ty - 17, 380, CONFIG.hypnoDepthStep, 0, 10, 1, ui('hypnoDepthD'),
                v => { CONFIG.hypnoDepthStep = Math.round(v); }, () => saveSettings());
            numRight(CONFIG.hypnoDepthStep, ty);
            bottom = ty + TH;

            // ── 群組 4：催眠深度（開/關 + 間隔 + 扁平效果自由勾選）──
            ty = bottom + RED + 22;
            this.title(ty, ui('depthMax'), ui('depthMaxD'));
            this.toggle(CTRL_X, ty - 20, 116, 40, CONFIG.depthEnabled ? ui('on') : ui('off'), CONFIG.depthEnabled, ui('depthMaxD'),
                () => { CONFIG.depthEnabled = !CONFIG.depthEnabled; saveSettings(); applyDepthLoop(); });
            bottom = ty + 20;

            // 循環時間
            ty = bottom + BLUE + 17;
            this.title(ty, ui('interval'), ui('intervalD'));
            this.input('ivh-interval', CTRL_X, ty - 17, 110, 42, String(CONFIG.depthIntervalMin),
                { type: 'number', onChange: val => {
                    let n = parseInt(val, 10); if (isNaN(n)) n = CONFIG.depthIntervalMin;
                    CONFIG.depthIntervalMin = Math.max(1, Math.min(99, n));
                    saveSettings(); applyDepthLoop();
                }});
            {
                const _p = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
                DrawTextFit(ui('minutes'), 830, this._y(ty), 150, 'Black', '');
                MainCanvas.textAlign = _p;
            }
            bottom = ty + 25;

            // 扁平效果勾選（3 欄，自由勾選）
            const fxName = { smoke:'fx_smoke', pant:'fx_pant', chatDanmaku:'fx_danmaku', ghost:'fx_ghost',
                             figureBlur:'fx_figblur', sfx:'fx_sfx', chatlogBlur:'fx_chatblur', fade:'fx_fade' };
            const demoMap = { smoke:'pinkFlash', pant:'steamParticles', chatDanmaku:'danmaku',
                              ghost:'ghost', figureBlur:'figureBlur', chatlogBlur:'chatlogBlur', sfx:'sound', fade:'chatFade' };
            const dKeys = ['smoke','chatDanmaku','ghost','figureBlur','sfx','fade','chatlogBlur','pant'];
            const DE = CONFIG.depthEffects || (CONFIG.depthEffects = {});
            this.title(bottom + GREEN, ui('depthEffects'), ui('depthEffectsHint'));
            const gy = bottom + GREEN + 32;
            dKeys.forEach((k, i) => {
                const cx = CTRL_X + (i % 3) * 122, cy = gy + Math.floor(i / 3) * 45;
                this.toggle(cx, cy, 116, 40, ui(fxName[k]), !!DE[k], ui(fxName[k] + 'D'),
                    () => { DE[k] = !DE[k]; saveSettings(); }, demoMap[k]);
            });
            bottom = gy + Math.ceil(dKeys.length / 3) * 45;

            // ── 看到他人喘氣（放在深度與允許編輯之間；toggle 在 ty-22、h44；與上方 RED）──
            ty = bottom + RED + 22;
            this.title(ty, ui('seeOthersPant'), ui('seeOthersPantD'));
            // 比照深度重的「喘氣」鈕：X = CTRL_X + 122、大小 116×40
            this.toggle(CTRL_X + 122, ty - 20, 116, 40, CONFIG.seeOthersPant ? ui('on') : ui('off'),
                CONFIG.seeOthersPant, ui('seeOthersPantD'),
                () => { CONFIG.seeOthersPant = !CONFIG.seeOthersPant; saveSettings(); });
            bottom = ty + 20;

            // ── 群組 3：允許編輯對象（標題列；與上方 RED）──
            ty = bottom + RED + TH;
            this.title(ty, ui('editPermTitle'), ui('editPermTitleD'));
            bottom = ty + TH;

            // 三類權限列（toggle 在 cy、h44；列間 BLUE → pitch 49）：與上方 GREEN
            const em = CONFIG.editModes || (CONFIG.editModes = { catalyst: 'off', status: 'off', trigger: 'off' });
            const setEdit = (cat, m) => { em[cat] = m; saveSettings(); publishSharedSettings(); };
            const COLS = [['off', ui('editOff')], ['whitelist', ui('whitelist')], ['any', ui('editAny')]];
            const CP = 44 + BLUE;           // 權限列 pitch = 49
            const cdy = bottom + GREEN;     // 三類列起點
            [['catalyst', 'sec_hypnoText'], ['status', 'sec_statusMsg'], ['trigger', 'sec_triggerWords'], ['wake', 'sec_wakeWord'], ['response', 'sec_hypnoResponse'], ['allowed', 'allowedPhrasesLabel']].forEach(([cat, lbKey], ri) => {
                const cy = cdy + ri * CP;
                const p2 = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
                DrawTextFit(ui(lbKey), CONTENT_X, this._y(cy + 30), 150, 'Black', '');
                MainCanvas.textAlign = p2;
                this._track(cy + 44);
                COLS.forEach(([m, lb], ci) => {
                    this.toggle(CTRL_X + ci * 124, cy, 118, 44, lb, (em[cat] || 'off') === m, null,
                        () => setEdit(cat, m));
                });
            });
            bottom = cdy + 5 * CP + 44;     // 6 類權限列底（catalyst/status/trigger/wake/response/allowed）

            // 白名單（input 在 ty-17、h42；與上方 RED）
            ty = bottom + RED + 17;
            this.title(ty, ui('whitelist'), ui('whitelistD'));
            this.input('ivh-whitelist', CTRL_X, ty - 17, 480, 42, (CONFIG.whitelist || []).join(', '),
                { placeholder: ui('whitelistPh'), onChange: val => {
                    // 保留 $owner / $lover / $friend / $white 代號，其餘取數字
                    CONFIG.whitelist = val.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
                        .map(s => /^\d+$/.test(s) ? Number(s) : s)
                        .filter(s => typeof s === 'number' || WL_TOKENS.includes(s));
                    saveSettings();
                    publishSharedSettings();   // 名單改動要即時重新公告，否則對方拿到的是舊白名單
                }});
            bottom = ty + 25;

            // ── 群組 4：語言（select 在 ty-17、h44；與上方 RED）──
            ty = bottom + RED + 17;
            this.title(ty, ui('language'), ui('languageD'));
            this.select('ivh-lang', CTRL_X, ty - 17, 240, 44, CONFIG.lang || 'auto',
                IVH_LANGS.map(l => [l, IVH_LANG_NAMES[l] || l]),
                v => { CONFIG.lang = v; saveSettings(); });
            bottom = ty + 27;

            // ── 群組 5：匯出 / 匯入（button 在 ty、h45；置中；與上方 GREEN）──
            ty = bottom + GREEN;
            const BW = 230, BGAP = 20;
            const expX = Math.round(900 - (BW * 2 + BGAP) / 2);  // 內容框中心 900 → 置中
            const impX = expX + BW + BGAP;
            this.btn(expX, ty, BW, 45, ui('export'), 'White', ui('exportD'), () => exportSettings());
            this.btn(impX, ty, BW, 45, ui('import'), 'White', ui('importD'), () => importSettings());
            this._track(ty + 45 + 10);

            MainCanvas.textAlign = prev;
        },

        // ════════ 效果設定 ════════
        _effectToggles() {
            // [cfg key, emoji, 名稱 i18n key]
            return [
                ['pinkFlash',      '🌸', 'ev_pinkFlash'],
                ['hypnoSpiral',    '🌀', 'ev_hypnoSpiral'],
                ['hypnoWaves',     '〰️', 'ev_hypnoWaves'],
                ['screenDistort',  '🔮', 'ev_screenDistort'],
                ['vignette',       '🌑', 'ev_vignette'],
                ['danmaku',        '💬', 'ev_danmaku'],
                ['steamParticles', '💨', 'ev_steam'],
                ['expression',     '😳', 'ev_expression'],
                ['chatFade',       '👁', 'ev_chatFade'],
                ['climax',         '💥', 'ev_climax'],
                ['sound',          '🔊', 'ev_sound'],
                ['centerHeadshot', '🖼', 'ev_headshot'],
                ['dualSound',      '🔊', 'ev_dualSound'],
                ['emoteEnabled',   '📢', 'ev_emote'],
            ];
        },
        _run_effects() {
            this._defaultDesc = ui('effectsHint');   // 常駐說明
            this.title(232, ui('tab_effects'), ui('effectsHint'));
            const list = this._effectToggles();
            list.forEach(([key, emoji, nameKey], i) => {
                const col = i % 2, row = (i - col) / 2;
                const cx  = 500 + col * 410;
                const cy  = 285 + row * 54;
                this.toggle(cx, cy, 390, 44, emoji + ' ' + ui(nameKey), !!CONFIG[key], ui(nameKey + 'D'),
                    () => { CONFIG[key] = !CONFIG[key]; saveSettings(); }, key);
            });
            // 高潮觸發模式（特殊：orgasm / always）
            const cyM = 285 + Math.ceil(list.length / 2) * 54 + 12;
            this.title(cyM + 22, ui('climaxMode'), ui('climaxModeD'));
            this.toggle(700, cyM, 200, 44,
                CONFIG.climaxMode === 'always' ? ui('climaxEvery') : ui('climaxOrgasm'),
                CONFIG.climaxMode === 'always', null,
                () => { CONFIG.climaxMode = CONFIG.climaxMode === 'always' ? 'orgasm' : 'always'; saveSettings(); });
        },

        // ════════ 文本設定 ════════
        _run_texts() {
            if (this.ctx === 'remote') return this._run_texts_remote();
            this._defaultDesc = ui('textsHint');   // 常駐說明
            // 逐段往下排（title 佔 28、段間留 GAP），避免固定座標互相遮住
            const GAP = 30;
            let cy = 228;
            this.title(cy, ui('tab_texts'), ui('textsHint')); cy += 42;

            const seg = (labelKey, descKey, id, value, h, opts) => {
                this.title(cy, ui(labelKey), ui(descKey));
                this.input(id, 500, cy + 28, 800, h, value, opts);
                cy += 28 + h + GAP;
            };
            seg('sec_hypnoText', 'hypnoTextD', 'ivh-texts', (CONFIG.customTexts || []).join('\n'), 130,
                { multiline: true, placeholder: ui('hypnoTextPh'), onChange: val => { CONFIG.customTexts = val.split('\n').map(s => s.trim()).filter(Boolean); saveSettings(); } });
            seg('sec_statusMsg', 'statusMsgD', 'ivh-emotes', (CONFIG.emoteList || []).join('\n'), 110,
                { multiline: true, placeholder: ui('statusMsgPh'), onChange: val => { CONFIG.emoteList = val.split('\n').map(s => s.trim()).filter(Boolean); saveSettings(); } });
            seg('sec_triggerWords', 'triggerWordsD', 'ivh-triggers', (CONFIG.triggerWords || []).join('\n'), 90,
                { multiline: true, placeholder: ui('triggerWordsPh'), onChange: val => { CONFIG.triggerWords = val.split('\n').map(s => s.trim()).filter(Boolean); saveSettings(); } });
            // 清醒詞（單行；房內任何人說出→立即清醒）
            seg('sec_wakeWord', 'wakeWordD', 'ivh-wake', CONFIG.wakeWord || '', 44,
                { placeholder: ui('wakeWordPh'), onChange: val => { CONFIG.wakeWord = val.trim(); saveSettings(); } });
            // 催眠回應（強控中說話有機會被替換成其中一句）
            seg('sec_hypnoResponse', 'hypnoResponseD', 'ivh-response', (CONFIG.responseList || []).join('\n'), 100,
                { multiline: true, placeholder: ui('hypnoResponsePh'), onChange: val => { CONFIG.responseList = val.split('\n').map(s => s.trim()).filter(Boolean); saveSettings(); } });
            // 允許說的話（強控中整句符合就照說、不陷入思考）
            seg('allowedPhrasesLabel', 'allowedPhrasesD', 'ivh-allowed', (CONFIG.allowedPhrases || []).join('\n'), 100,
                { multiline: true, placeholder: ui('allowedPhrasesPh'), onChange: val => { CONFIG.allowedPhrases = val.split('\n').map(s => s.trim()).filter(Boolean); saveSettings(); } });

            this._track(cy + 20);   // 底部留白
        },
        // 文本設定右側：說明照畫在說明框；還原預設放「內容框右上角」（不在說明位、固定不捲動）
        _right_texts() {
            const desc = this.hoverDesc || this._defaultDesc;
            if (desc) DrawTextWrap(desc, 1370, 260, 510, 540, 'Black', undefined, 6);
            if (this.ctx !== 'remote')
                this.rbtn(1090, 186, 200, 48, ui('restoreDefault'), '#8C6046', ui('textsResetD'), () => this._resetTexts());
        },
        _resetTexts() {
            ivhConfirm(ui('confirmTextsReset'), () => {
                CONFIG.customTexts   = ui('defaultTexts').split('\n').map(s => s.trim()).filter(Boolean);
                CONFIG.emoteList     = ui('defaultEmotes').split('\n').map(s => s.trim()).filter(Boolean);
                CONFIG.triggerWords  = [];
                CONFIG.responseList  = ui('defaultResponses').split('\n').map(s => s.trim()).filter(Boolean);
                try { document.activeElement && document.activeElement.blur(); } catch {}
                saveSettings(); publishSharedSettings();
            });
        },
        // ════════ 文本設定（訪問別人：就地編輯，依權限唯讀/可編輯，儲存即送出）════════
        _run_texts_remote() {
            const r = this.remote;
            if (!r) { this.closeRemote(); return; }
            this._defaultDesc = ui('remoteEditHint');
            this.title(228, ui('tab_texts'), ui('remoteEditHint'));
            let cy = 286;
            r.cats.forEach(c => {
                this.title(cy, c.label + (c.editable ? '' : ' 🔒'), c.editable ? '' : ui('profileEditNoPerm'));
                this.input('ivh-rtext-' + c.key, 500, cy + 30, 800, 120, (c.data || []).join('\n'),
                    { multiline: true, readOnly: !c.editable,
                      placeholder: c.editable ? ui('hypnoTextPh') : '',
                      onChange: c.editable
                          ? (val => { c.data = val.split('\n').map(s => s.trim()).filter(Boolean); r.dirty = true; })
                          : null });
                cy += 178;
            });
            this._track(cy);
            // 儲存並送出（僅在有可編輯分類時顯示）
            if (r.cats.some(c => c.editable)) {
                this.btn(500, cy + 6, 320, 50, ui('remoteEditSave'), '#21872F', '',
                    () => {
                        try { document.activeElement && document.activeElement.blur(); } catch {}
                        try { r.onSave && r.onSave(r.cats); } catch (e) {}
                        this.closeRemote();
                    });
                this._track(cy + 60);
            }
        },
        // ════════ 表情設定（最多 10 組）════════
        //  右側為一個「工作中表情」編輯區；點名稱→載入右側；點某列「保存」→把右側內容存到那一組
        _exprWorkFrom(s) {
            return s
                ? { Eyebrows: s.Eyebrows ?? null, Eyes: s.Eyes ?? null, Mouth: s.Mouth ?? null, Blush: s.Blush ?? null }
                : (() => { const c = saveExpression(); return { Eyebrows: c.Eyebrows, Eyes: c.Eyes, Mouth: c.Mouth, Blush: c.Blush }; })();
        },
        _run_expr() {
            const sets = CONFIG.expressionSets || [];
            if (!this._exprWork) this._exprWork = this._exprWorkFrom(sets[0]);

            this.title(228, ui('tab_expr'), '');

            // 統一欄位：名稱列填滿左側，保存／刪除靠右對齊（右緣 1300）
            const E_R = 1300, E_BW = 132, E_GAP = 8;
            const E_DEL_X  = E_R - E_BW;                 // 刪除
            const E_SAVE_X = E_DEL_X - E_GAP - E_BW;     // 保存
            const E_NAME_W = E_SAVE_X - 16 - CONTENT_X;  // 名稱列寬（到保存前留 16）
            sets.forEach((set, i) => {
                const cy = 300 + i * 52;
                const nm = ui('expr_item', { n: i + 1 });
                this.btn(CONTENT_X, cy, E_NAME_W, 46, nm, 'White', null,
                    () => { this._exprWork = this._exprWorkFrom(set); this._exprPrevKey = ''; });
                this.btn(E_SAVE_X, cy, E_BW, 46, ui('save'), '#21872F', null,
                    () => ivhConfirm(ui('confirmReplace', { name: nm }), () => {
                        const w = this._exprWork;
                        sets[i] = { Eyebrows: w.Eyebrows, Eyes: w.Eyes, Mouth: w.Mouth, Blush: w.Blush };
                        saveSettings(); setExpressionSets(CONFIG.expressionSets);
                    }));
                this.btn(E_DEL_X, cy, E_BW, 46, ui('delete'), '#872626', null,
                    () => ivhConfirm(ui('confirmDelete', { name: nm }), () => {
                        this._restoreExpr(); sets.splice(i, 1);
                        saveSettings(); setExpressionSets(CONFIG.expressionSets);
                    }));
            });

            const cyB = 300 + sets.length * 52 + 14;
            if (sets.length < 10) {
                this.btn(CONTENT_X, cyB, 300, 46, ui('expr_add'), '#8E44A1', null, () => {
                        const w = this._exprWork;
                        sets.push({ Eyebrows: w.Eyebrows, Eyes: w.Eyes, Mouth: w.Mouth, Blush: w.Blush });
                        saveSettings(); setExpressionSets(CONFIG.expressionSets);
                    });
            }
            // 還原預設靠右對齊（與保存／刪除欄同一右緣）
            this.btn(E_R - 180, cyB, 180, 46, ui('restoreDefault'), '#8C6046', null,
                () => ivhConfirm(ui('confirmReset'), () => {
                    CONFIG.expressionSets = DEFAULT_EXPRESSIONS.map(e => ({ ...e }));
                    setExpressionSets(CONFIG.expressionSets); saveSettings();
                }));
            // 說明文字（放最底；表情數 ≥8 時隱藏，避免太擠；過長自動換行）
            if (sets.length < 8) {
                DrawTextWrap(ui('expr_hint'), CONTENT_X, this._y(cyB + 60), 820, 60, 'Black', undefined, 4);
                this._track(cyB + 110);
            } else {
                this._track(cyB + 60);
            }
        },

        // 右側：工作中表情編輯（四部位 ◀值▶、即時臉部預覽）
        _right_expr() {
            const work = this._exprWork || (this._exprWork = this._exprWorkFrom(null));
            DrawText(ui('expr_edit'), 1625, 235, 'Black', '');

            // 四部位 ◀ 值 ▶
            const GROUPS = [['Eyebrows', ui('eyebrows')], ['Eyes', ui('eyes')], ['Mouth', ui('mouth')], ['Blush', ui('blush')]];
            GROUPS.forEach(([g, lb], i) => {
                const y = 290 + i * 62;
                const p2 = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
                DrawTextFit(lb, 1370, y + 28, 110, 'Black', '');
                MainCanvas.textAlign = p2;
                this.rbtn(1490, y, 52, 52, '◀', 'White', null, () => cycleExpression(work, g, -1));
                const v = work[g] == null ? ui('exprNone') : String(work[g]);
                DrawButton(1546, y, 244, 52, v, '#2a1030', '', '', true);
                this.rbtn(1794, y, 52, 52, '▶', 'White', null, () => cycleExpression(work, g, 1));
            });

            // 即時臉部預覽（本地套用後截 Player 臉）
            this._ensureExprPreview(work);
            // 預覽框置中於右側面板（1350~1900，寬 550）：左右邊距相等
            const bs = 315, bx = Math.round(1350 + (550 - bs) / 2), by = 568;
            DrawRect(bx, by, bs, bs, 'rgba(20,5,30,0.6)');
            DrawEmptyRect(bx, by, bs, bs, '#8E44A1');
            if (this._exprFaceImg) {
                try { MainCanvas.drawImage(this._exprFaceImg, bx, by, bs, bs); } catch (e) {}
            } else {
                DrawText(ui('previewLoading'), bx + bs / 2, by + bs / 2, '#555', '');
            }
        },

        // 音效分類（順序：催眠 / 催眠2 / 高潮 / 深度）
        _soundCats() {
            // [cat, 標籤 i18n key, 最大數]
            return [['hypno', 'sndCat_hypno', 5], ['voice', 'sndCat_voice', 3], ['climax', 'sndCat_climax', 5], ['depth', 'sndCat_depth', 3]];
        },
        // ════════ 音效設定 ════════
        _run_sounds() {
            this.title(226, ui('tab_sounds'), ui('soundsHint'));
            const DEFAULTS = SOUND_DEFAULTS;   // 各分類預設音效
            const LX = 580;        // 欄位左緣
            // 按鈕靠右對齊（右緣 1300）：其他 / ✕ / ▶ / 上傳，輸入框填滿至按鈕前
            const S_R = 1300;
            const S_OTHER_X = S_R - 70;          // 其他 1230
            const S_CLR_X   = S_OTHER_X - 44;    // ✕   1186
            const S_PLAY_X  = S_CLR_X   - 44;    // ▶   1142
            const S_UP_X    = S_PLAY_X  - 62;    // 上傳 1080
            const FIELD_W   = S_UP_X - 20 - LX;  // 輸入框寬（到上傳前留 20）= 480
            let cy = 286;
            this._soundCats().forEach(([cat, lbKey, max], ci) => {
                const lb = ui(lbKey);
                if (ci > 0) cy += 10;   // 各大類標題上多 10px 間距
                this.sep(cy, `── ${ui('sndSlotHead', { name: lb, max })} ──`);
                cy += 26;
                if (!CONFIG.sounds[cat]) CONFIG.sounds[cat] = [];
                for (let i = 0; i < max; i++) {
                    const entry = CONFIG.sounds[cat][i] || '';
                    const def   = (DEFAULTS[cat] || [])[i] || '';
                    const isIdb = entry.startsWith('idb:');
                    const rowY  = cy;
                    const p2 = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
                    DrawTextFit(lb + (i + 1), CONTENT_X, this._y(rowY + 24), 70, 'Black', '');
                    MainCanvas.textAlign = p2;
                    if (isIdb) {
                        const name = _sndNameCache[entry.slice(4)] || ui('sndLocalName');
                        const p3 = MainCanvas.textAlign; MainCanvas.textAlign = 'left';
                        DrawTextFit('🎵 ' + name, LX + 5, this._y(rowY + 24), FIELD_W - 10, '#1a7a2a', '');
                        MainCanvas.textAlign = p3;
                    } else {
                        const ph = def ? ui('sndDefaultPh', { file: def.split('/').pop() }) : ui('sndUnsetPh');
                        this.input('ivh-snd-' + cat + i, LX, rowY + 2, FIELD_W, 40, entry,
                            { placeholder: ph, onChange: v => { CONFIG.sounds[cat][i] = v.trim(); saveSettings(); } });
                    }
                    this.btn(S_UP_X, rowY, 58, 44, ui('upload'), '#8E44A1', null,
                        () => uploadSoundFile(cat, i));
                    this.btn(S_PLAY_X, rowY, 40, 44, '▶', '#2d5a5a', null,
                        () => { const e = entry || def; if (e) playSoundEntry(e, 0.9, true); });
                    this.btn(S_CLR_X, rowY, 40, 44, '✕', '#872626', null,
                        () => { CONFIG.sounds[cat][i] = ''; saveSettings(); });
                    const picked = this._sndPick && this._sndPick.cat === cat && this._sndPick.i === i;
                    this.btn(S_OTHER_X, rowY, 70, 44, ui('other'), picked ? '#8E44A1' : '#465980', null,
                        () => { this._sndPick = picked ? null : { cat, i, label: lb + (i + 1) }; });
                    cy += 50;
                }
            });
            this._track(cy + 10);
        },

        // 右側：音效庫（預設＋本機）；可指派給「其他」選中的格子，或直接試聽。可卷動。
        _right_sounds() {
            DrawText(ui('snd_lib'), 1625, 230, 'Black', '');
            const pick = this._sndPick;

            // 載入本機上傳清單（一次）
            if (!this._localLoaded) {
                this._localLoaded = true; this._localSnd = [];
                IVHDB.getAll('sounds').then(list => {
                    this._localSnd = list || [];
                    (list || []).forEach(r => { _sndNameCache[r.id] = r.name; });
                });
            }

            // 兩大類：預設 / 本機（key 穩定、label 顯示用）
            const groups = [['preset', ui('snd_preset'), SOUND_PRESETS.map(p => ({ entry: p.url, name: p.name }))]];
            if (this._localSnd && this._localSnd.length)
                groups.push(['local', ui('snd_local'), this._localSnd.map(r => ({ entry: 'idb:' + r.id, name: r.name }))]);

            // 清單視窗（可卷動；比原本短 20px）
            const LX = 1368, LW = 484, LY0 = 256, LBOT = 818, ROW = 38, HEAD = 30;
            let contentH = 0;
            groups.forEach(([, , items]) => { contentH += HEAD + items.length * ROW + 6; });
            this._rmaxScroll = Math.max(0, contentH - (LBOT - LY0));
            this._rscroll = Math.max(0, Math.min(this._rmaxScroll, this._rscroll || 0));

            MainCanvas.save();
            MainCanvas.beginPath(); MainCanvas.rect(1358, LY0 - 2, 540, LBOT - LY0 + 4); MainCanvas.clip();
            let y = LY0 - this._rscroll;
            groups.forEach(([key, label, items]) => {
                const isLocal = key === 'local';
                DrawText('── ' + label + ' ──', 1610, y + 16, '#8E44A1', ''); y += HEAD;
                items.forEach(it => {
                    if (y >= LY0 - ROW && y <= LBOT) {
                        const nameW = isLocal ? LW - 46 : LW;   // 本機保留右側刪除鈕空間
                        this.rbtn(LX, y, nameW, ROW - 6, it.name, '#2a1a40', null, () => {
                            if (pick) { CONFIG.sounds[pick.cat][pick.i] = it.entry; saveSettings(); this._sndPick = null; }
                            else playSoundEntry(it.entry, 0.9, true);
                        });
                        if (isLocal) {
                            this.rbtn(LX + LW - 40, y, 40, ROW - 6, '✕', '#872626', null,
                                () => deleteLocalSound(it.entry.slice(4)));
                        }
                    }
                    y += ROW;
                });
                y += 6;
            });
            MainCanvas.restore();

            // 卷軸
            if (this._rmaxScroll > 0) {
                const trackH = LBOT - LY0;
                const thumbH = Math.max(40, trackH * (trackH / contentH));
                const thumbY = LY0 + (trackH - thumbH) * (this._rscroll / this._rmaxScroll);
                DrawRect(1882, LY0, 12, trackH, '#333');
                DrawRect(1882, thumbY, 12, thumbH, '#c060c0');
            }

            // 說明（往上 10px；hover 到按鈕顯示該說明，否則預設；超框自動換行）
            const descText = this.hoverDesc
                || (pick ? ui('snd_assignTo', { label: pick.label }) : ui('snd_pickHint'));
            DrawTextWrap(descText, 1365, 840, 515, 48, 'Black', undefined, 4);
        },
        _run_about() {
            this.sep(240, 'IVH — Immersive Voice Hypnosis  v' + MOD_VER);
            this.sep(292, ui('about_author'));
            // 說明：給足寬度與行數，避免壅擠（其他語言較長）
            DrawTextWrap(ui('about_dev'), 505, 330, 790, 190, 'Black', undefined, 7);
            // ── 下方：素材列表 + 回報按鈕 ──
            this.sep(600, ui('about_assets'));
            this.sep(640, '音源：びたちー素材館');
            this.sep(675, 'Pincree');
            this.sep(710, 'pixabay');
            this.btn(740, 760, 320, 56, ui('about_report'), '#465980', '',
                () => { try { window.open('https://github.com/awdrrawd/liko-Plugin-Repository/issues', '_blank'); } catch (e) {} });
            this._track(840);
        },
    };


export {
    waitForPreference,
    IVH_TABS,
    FRAME_X,
    FRAME_Y,
    FRAME_W,
    FRAME_H,
    CONTENT_X,
    CONTENT_TOP,
    FRAME_BOT,
    EXT,
};
