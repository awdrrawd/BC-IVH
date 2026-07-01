// ── auto-wired cross-module imports ──
import { printChat } from './commands.js';
import { CONFIG } from './config.js';
import { assetUrl } from './icons.js';
import { EXT } from './preference.js';
import { IVHDB, saveSettings } from './storage.js';
import { T } from './util.js';

// ════════════════════════════════════════
//  IVH module: sound.js
//  (auto-split from Liko - IVH.main.user.js; imports added below)
// ════════════════════════════════════════

    // ════════════════════════════════════════
    //  聲音系統
    //  音源系統：預載 GitHub 音源，有快取才播放
    //  載入失敗 → 本地聊天訊息提示（10秒後自動消失）
    //  音源來自 https://www.pincree.jp/
    // ════════════════════════════════════════
    // 音源自我裝載：與 bundle 同源（正式站 = BC-IVH Pages，本地 = vite preview）。
    // 檔案放 Sound/，build 前由 copy-assets 複製到 public/Sound/ 一併部署。
    const SND_BASE = assetUrl('Sound/');

    // 內建音效庫（唯一一份；「其他」可從這裡挑選，依類別分組）
    const SOUND_PRESETS = [
        { url: SND_BASE + 'groan-KitakamiTsubasa01_pincree_.mp3',        cat: '催眠', name: '呻吟1' },
        { url: SND_BASE + 'groan-KitakamiTsubasa02_pincree_.mp3',        cat: '催眠', name: '呻吟2' },
        { url: SND_BASE + 'groan-KitakamiTsubasa03_pincree_.mp3',        cat: '催眠', name: '呻吟3' },
        { url: SND_BASE + 'groan-KitakamiTsubasa04_pincree_.mp3',        cat: '催眠', name: '呻吟4' },
        { url: SND_BASE + 'cum-KitakamiTsubasa_pincree_.mp3',            cat: '高潮', name: '高潮' },
        { url: SND_BASE + 'short-Heartbeat_vita-chi_.mp3',               cat: '短音', name: '心跳' },
        { url: SND_BASE + 'short-Whip-universfield_pixabay_.mp3',        cat: '短音', name: '鞭打' },
        { url: SND_BASE + 'short-Whip2-universfield_pixabay_.mp3',       cat: '短音', name: '鞭打2' },
        { url: SND_BASE + 'long-Whips-dragon-studio_pixabay_.mp3',       cat: '長音', name: '連續鞭打' },
        { url: SND_BASE + 'short-WindChime-wingsoarstudio_pixabay_.mp3', cat: '短音', name: '風鈴' },
        { url: SND_BASE + 'short-Bell-soundreality_pixabay_.mp3',        cat: '短音', name: '鍾聲' },
        { url: SND_BASE + 'short-BeepTone_vita-chi.mp3',                 cat: '短音', name: 'Beep音' },
        { url: SND_BASE + 'short-Pointer_vita-chi_.mp3',                 cat: '短音', name: '指針' },
        { url: SND_BASE + 'long-Pointers_vita-chi_.mp3',                 cat: '長音', name: '連續指針' },
    ];

    // 各分類的內建預設音效（空格時生效；effect 播放也以此後備）
    const SOUND_DEFAULTS = {
        hypno:  SOUND_PRESETS.filter(p => p.cat === '催眠').map(p => p.url),  // 呻吟 ×4
        voice:  [SND_BASE + 'short-Heartbeat_vita-chi_.mp3'],                 // 催眠2＝心跳
        climax: [SND_BASE + 'cum-KitakamiTsubasa_pincree_.mp3'],              // 高潮
        depth:  [SND_BASE + 'long-Pointers_vita-chi_.mp3'],                   // 深度
    };
    function soundDefault(cat, i = 0) { return (SOUND_DEFAULTS[cat] || [])[i] || ''; }

    const _soundBufferCache = new Map(); // url → AudioBuffer
    let _audioCtx = null;

    function _getAudioCtx() {
        if (!_audioCtx || _audioCtx.state === 'closed') {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }

    // 預載所有音源（進房間後呼叫一次）
    // 失敗時用 printChat 留訊息（10 秒後自動消失）
    function preloadSounds() {
        const list = SOUND_DEFAULTS.hypno;   // 預載催眠呻吟（喘息後備）
        if (!list.length) return;
        let _failNotified = false;
        list.forEach(url => {
            if (_soundBufferCache.has(url)) return;
            const ctx = _getAudioCtx();
            fetch(url)
                .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
                .then(ab => ctx.decodeAudioData(ab))
                .then(buf => {
                _soundBufferCache.set(url, buf);
            })
                .catch(e => {
                // 每次重新進房間只通知一次，避免四個 URL 連續刷訊息
                if (!_failNotified) {
                    _failNotified = true;
                    // 延遲 3 秒，等玩家看完催眠特效再顯示
                    setTimeout(() => {
                        printChat(
                            T('🔇 IVH 音源載入失敗，聲音效果暫時停用', '🔇 IVH sound load failed, audio disabled'),
                            10000  // 10 秒後消失
                        );
                    }, 3000);
                }
            });
        });
    }

    // ── 通用音效解析 / 播放（支援 URL 與本機 idb:<id>）──
    function resolveSoundBuffer(entry) {
        return new Promise(resolve => {
            if (!entry) return resolve(null);
            if (_soundBufferCache.has(entry)) return resolve(_soundBufferCache.get(entry));
            const ctx = _getAudioCtx();
            const onAB = ab => ctx.decodeAudioData(ab.slice(0))
                .then(buf => { _soundBufferCache.set(entry, buf); resolve(buf); })
                .catch(() => resolve(null));
            if (entry.startsWith('idb:')) {
                IVHDB.get('sounds', entry.slice(4)).then(rec => {
                    if (rec && rec.bytes) onAB(rec.bytes); else resolve(null);
                });
            } else {
                fetch(entry).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
                    .then(onAB).catch(() => resolve(null));
            }
        });
    }
    let _previewSrc = null;   // 目前的試聽音源（換一個會停掉前一個）
    function playSoundEntry(entry, vol = 0.8, stopPrev = false) {
        resolveSoundBuffer(entry).then(buf => {
            if (!buf) return;
            try {
                if (stopPrev && _previewSrc) { try { _previewSrc.stop(); } catch (e) {} _previewSrc = null; }
                const ctx = _getAudioCtx();
                const src = ctx.createBufferSource(); src.buffer = buf;
                const g = ctx.createGain(); g.gain.value = Math.min(Math.max(vol, 0), 1);
                src.connect(g); g.connect(ctx.destination); src.start();
                if (stopPrev) { _previewSrc = src; src.onended = () => { if (_previewSrc === src) _previewSrc = null; }; }
            } catch (e) {}
        });
    }
    // 播放某分類的隨機一個（hypno/climax/depth/voice）；無設定回傳 false
    function playSoundCategory(cat, vol = 0.8, useDefault = true) {
        let list = ((CONFIG.sounds && CONFIG.sounds[cat]) || []).filter(Boolean);
        if (list.length === 0 && useDefault) list = SOUND_DEFAULTS[cat] || [];
        if (list.length === 0) return false;
        playSoundEntry(list[Math.floor(Math.random() * list.length)], vol);
        return true;
    }
    // 本機檔案上傳 → 存 IndexedDB，設定為 idb:<id>
    function uploadSoundFile(cat, idx) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'audio/*';
        inp.onchange = () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = async () => {
                const id = 'snd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                const name = f.name.replace(/\.[^.]+$/, '');   // 去副檔名當名稱
                await IVHDB.put('sounds', { id, name, bytes: r.result });
                _sndNameCache[id] = name;
                CONFIG.sounds[cat][idx] = 'idb:' + id;
                saveSettings();
                EXT._localLoaded = false;   // 讓音效庫重新載入顯示
            };
            r.readAsArrayBuffer(f);
        };
        inp.click();
    }
    const _sndNameCache = {}; // id -> filename（顯示用）

    // 刪除一個本機音效（從 DB 移除、清掉所有引用的格子、刷新音效庫）
    function deleteLocalSound(id) {
        const ref = 'idb:' + id;
        try { IVHDB.delete('sounds', id); } catch (e) {}
        for (const cat in CONFIG.sounds) {
            CONFIG.sounds[cat] = (CONFIG.sounds[cat] || []).map(e => (e === ref ? '' : e));
        }
        delete _sndNameCache[id];
        saveSettings();
        EXT._localLoaded = false;
    }

    // 播放催眠喘息聲（催眠分類，含預設後備）
    function triggerBreathSound(scale = 1) {
        if (!CONFIG.sound) return;
        const vol = Math.min(0.5 + scale * 0.15, 0.9);
        playSoundCategory('hypno', vol);
    }


export {
    SND_BASE,
    SOUND_PRESETS,
    SOUND_DEFAULTS,
    _sndNameCache,
    soundDefault,
    _getAudioCtx,
    preloadSounds,
    resolveSoundBuffer,
    playSoundEntry,
    playSoundCategory,
    uploadSoundFile,
    deleteLocalSound,
    triggerBreathSound,
};
