/* FHNW ImageEditor
 * GPT Image 2.5 (Sunburst) Edit über die fal.ai Queue-API.
 * Reine Client-App: der API-Key bleibt im Browser des Studierenden. */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Konstanten                                                          */
    /* ------------------------------------------------------------------ */

    var MODEL_ID = 'openai/gpt-image-2.5/sunburst/edit';
    var QUEUE_URL = 'https://queue.fal.run/' + MODEL_ID;

    var REQ_QUALITY = 'low';
    var REQ_FORMAT = 'png';

    var KEY_STORAGE = 'fhnw.imageeditor.key';
    var RATIO_STORAGE = 'fhnw.imageeditor.ratio';
    var TIER_STORAGE = 'fhnw.imageeditor.tier';

    var MAX_INPUT_EDGE = 2048;   // Kantenlänge, mit der Bilder hochgeladen werden
    var MAX_REFS = 8;            // Quell-/Referenzbilder pro Generierung
    var MAX_PAYLOAD_MB = 14;     // Sicherheitsnetz gegen zu grosse Requests
    var POLL_MS = 1600;
    var JOB_TIMEOUT_MS = 15 * 60 * 1000;

    var TIER_PX = { '2K': 2048, '4K': 4096 };

    var RATIOS = [
        { value: 'auto', label: 'AUTO – vom Eingabebild übernehmen' },
        { value: '1:3', w: 1, h: 3 },
        { value: '9:21', w: 9, h: 21 },
        { value: '1:2', w: 1, h: 2 },
        { value: '9:16', w: 9, h: 16 },
        { value: '2:3', w: 2, h: 3 },
        { value: '3:4', w: 3, h: 4 },
        { value: '4:5', w: 4, h: 5 },
        { value: '1:1', w: 1, h: 1 },
        { value: '5:4', w: 5, h: 4 },
        { value: '4:3', w: 4, h: 3 },
        { value: '3:2', w: 3, h: 2 },
        { value: '16:9', w: 16, h: 9 },
        { value: '2:1', w: 2, h: 1 },
        { value: '21:9', w: 21, h: 9 },
        { value: '3:1', w: 3, h: 1 }
    ];

    /* ------------------------------------------------------------------ */
    /* Helfer                                                              */
    /* ------------------------------------------------------------------ */

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function uid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Bild konnte nicht geladen werden.')); };
            img.src = src;
        });
    }

    function fileToDataUrl(file) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden.')); };
            fr.readAsDataURL(file);
        });
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(fr.result); };
            fr.onerror = function () { reject(new Error('Antwort konnte nicht gelesen werden.')); };
            fr.readAsDataURL(blob);
        });
    }

    // Skaliert ein Bild auf eine maximale Kantenlänge und gibt eine Data-URL zurück.
    function shrink(src, maxEdge, mime, quality) {
        return loadImage(src).then(function (img) {
            var scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
            var w = Math.max(1, Math.round(img.width * scale));
            var h = Math.max(1, Math.round(img.height * scale));
            if (scale === 1 && src.length < 1200000) {
                return { dataUrl: src, w: img.width, h: img.height };
            }
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            return { dataUrl: c.toDataURL(mime || 'image/jpeg', quality || 0.92), w: w, h: h };
        });
    }

    function thumbnail(src, size) {
        return loadImage(src).then(function (img) {
            var s = size || 300;
            var c = document.createElement('canvas');
            c.width = s; c.height = s;
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, s, s);
            var scale = Math.max(s / img.width, s / img.height);
            var w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
            return c.toDataURL('image/jpeg', 0.78);
        }).catch(function () { return src; });
    }

    function approxBytes(dataUrl) {
        var i = dataUrl.indexOf(',');
        return Math.round((dataUrl.length - i - 1) * 0.75);
    }

    function formatTime(ts) {
        var d = new Date(ts);
        return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' }) + ' ' +
            d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    }

    function download(dataUrl, name) {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    /* ------------------------------------------------------------------ */
    /* API-Key: oben eingeben, nach dem Bestätigen nach unten wegrutschen   */
    /* ------------------------------------------------------------------ */

    var apiPanel = document.importNode($('#apiPanelTemplate').content, true).firstElementChild;
    var slotTop = $('#apiSlotTop');
    var slotBottom = $('#apiSlotBottom');
    slotTop.appendChild(apiPanel);

    var apiKeyInput = $('#apiKey', apiPanel);
    var apiMask = $('#apiMask', apiPanel);

    function getKey() {
        try { return (localStorage.getItem(KEY_STORAGE) || '').trim(); }
        catch (e) { return ''; }
    }

    function setKey(value) {
        try {
            if (value) localStorage.setItem(KEY_STORAGE, value);
            else localStorage.removeItem(KEY_STORAGE);
        } catch (e) { /* Privater Modus: dann gilt der Key nur für diese Sitzung. */ }
    }

    function maskKey(k) {
        if (!k) return '';
        var tail = k.slice(-4);
        return '••••' + tail;
    }

    // Verschiebt den Block in den Ziel-Slot und animiert die Bewegung (FLIP).
    function moveApiPanel(target, stowed, animate) {
        var first = apiPanel.getBoundingClientRect();
        target.appendChild(apiPanel);
        apiPanel.classList.toggle('stowed', !!stowed);
        if (!animate || !apiPanel.animate) return;
        var last = apiPanel.getBoundingClientRect();
        var dy = first.top - last.top;
        if (!dy) return;
        apiPanel.animate(
            [{ transform: 'translateY(' + dy + 'px)', opacity: 0.65 }, { transform: 'none', opacity: 1 }],
            { duration: 620, easing: 'cubic-bezier(.22,.8,.24,1)' }
        );
    }

    function confirmKey() {
        var value = apiKeyInput.value.trim();
        if (!value) {
            apiKeyInput.focus();
            if (apiKeyInput.animate) {
                apiKeyInput.animate(
                    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
                     { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
                    { duration: 220 }
                );
            }
            return;
        }
        setKey(value);
        apiMask.textContent = maskKey(value);
        apiKeyInput.value = '';
        moveApiPanel(slotBottom, true, true);
    }

    $('#apiSave', apiPanel).addEventListener('click', confirmKey);
    apiKeyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmKey(); }
    });

    $('#apiEdit', apiPanel).addEventListener('click', function () {
        apiPanel.classList.remove('stowed');
        apiKeyInput.value = getKey();
        apiKeyInput.focus();
    });

    $('#apiClear', apiPanel).addEventListener('click', function () {
        setKey('');
        apiKeyInput.value = '';
        apiMask.textContent = '';
        moveApiPanel(slotTop, false, true);
        apiKeyInput.focus();
    });

    function requireKey() {
        var k = getKey();
        if (k) return k;
        apiPanel.classList.remove('stowed');
        moveApiPanel(slotTop, false, true);
        apiKeyInput.focus();
        return '';
    }

    (function initKey() {
        var k = getKey();
        if (k) {
            apiMask.textContent = maskKey(k);
            moveApiPanel(slotBottom, true, false);
        }
    })();

    /* ------------------------------------------------------------------ */
    /* Modus                                                               */
    /* ------------------------------------------------------------------ */

    var mode = 'edit';
    var inpaintSection = $('#inpaintSection');
    var uploadTitle = $('#uploadTitle');
    var uploadLabel = $('#uploadLabel');

    function setMode(next) {
        mode = next;
        $$('.tab').forEach(function (t) {
            var on = t.dataset.mode === next;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        inpaintSection.classList.toggle('hidden', next !== 'inpaint');
        uploadTitle.textContent = next === 'inpaint' ? 'Zusätzliche Referenzbilder' : 'Bilder';
        uploadLabel.textContent = next === 'inpaint' ? 'Referenzbilder hochladen' : 'Bilder hochladen';
        updateFormatUI();
        renderPreviews();
    }

    $$('.tab').forEach(function (t) {
        t.addEventListener('click', function () { setMode(t.dataset.mode); });
    });

    /* ------------------------------------------------------------------ */
    /* Quell- und Referenzbilder                                           */
    /* ------------------------------------------------------------------ */

    var refs = [];
    var previewGrid = $('#previewGrid');
    var imageCount = $('#imageCount');

    function renderPreviews() {
        previewGrid.innerHTML = '';
        refs.forEach(function (item, i) {
            var box = el('div', 'thumb');
            var img = el('img');
            img.src = item.dataUrl;
            img.alt = item.name || 'Bild ' + (i + 1);
            img.addEventListener('click', function () { openLightbox(item.dataUrl); });
            box.appendChild(img);

            if (mode === 'edit' && i === 0) box.appendChild(el('span', 'badge', 'Basis'));

            var rm = el('button', 'remove', '×');
            rm.type = 'button';
            rm.title = 'Entfernen';
            rm.addEventListener('click', function () {
                refs = refs.filter(function (r) { return r.id !== item.id; });
                renderPreviews();
            });
            box.appendChild(rm);
            previewGrid.appendChild(box);
        });

        if (!refs.length) {
            imageCount.textContent = mode === 'inpaint'
                ? 'Optional: zusätzliche Referenzbilder für die Bearbeitung.'
                : 'Noch keine Bilder gewählt – für eine Bearbeitung wird mindestens ein Bild benötigt.';
        } else {
            imageCount.textContent = refs.length + ' von ' + MAX_REFS + ' Bildern' +
                (mode === 'edit' ? ' – das erste Bild ist das Basisbild.' : '.');
        }
        updateFormatUI();
    }

    function addFiles(files) {
        var list = Array.prototype.slice.call(files).filter(function (f) {
            return (f.type || '').indexOf('image/') === 0;
        });
        if (!list.length) return;

        var skipped = 0;
        var chain = Promise.resolve();
        list.forEach(function (file) {
            chain = chain.then(function () {
                if (refs.length >= MAX_REFS) { skipped++; return; }
                return fileToDataUrl(file)
                    .then(function (raw) { return shrink(raw, MAX_INPUT_EDGE, 'image/jpeg', 0.92); })
                    .then(function (out) {
                        refs.push({ id: uid(), dataUrl: out.dataUrl, w: out.w, h: out.h, name: file.name });
                        renderPreviews();
                    })
                    .catch(function (err) { console.warn('Upload fehlgeschlagen:', err); });
            });
        });
        chain.then(function () {
            if (skipped) {
                imageCount.textContent = refs.length + ' von ' + MAX_REFS + ' Bildern – ' +
                    skipped + ' Bild(er) über dem Limit wurden ignoriert.';
            }
        });
    }

    $('#imageUpload').addEventListener('change', function (e) {
        addFiles(e.target.files);
        e.target.value = '';
    });

    // Drag & Drop auf die Bilder-Karte.
    (function dropZone() {
        var card = $('#imageUpload').closest('.card');
        ['dragenter', 'dragover'].forEach(function (ev) {
            card.addEventListener(ev, function (e) {
                e.preventDefault();
                card.classList.add('is-drop');
            });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            card.addEventListener(ev, function (e) {
                e.preventDefault();
                card.classList.remove('is-drop');
            });
        });
        card.addEventListener('drop', function (e) {
            if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
        });
    })();

    /* ------------------------------------------------------------------ */
    /* Inpaint-Editor                                                      */
    /* ------------------------------------------------------------------ */

    var baseCanvas = $('#baseCanvas');
    var maskCanvas = $('#maskCanvas');
    var inpaintStage = $('#inpaintStage');
    var inpaintTools = $('#inpaintTools');
    var brushSize = $('#brushSize');
    var featherRange = $('#featherRange');

    var baseUrl = null;
    var baseW = 0, baseH = 0;
    var brushMode = 'brush';
    var painting = false;
    var undoStack = [];

    function maskCtx() { return maskCanvas.getContext('2d', { willReadFrequently: true }); }

    function loadBase(src) {
        return loadImage(src).then(function (img) {
            var scale = Math.min(1, MAX_INPUT_EDGE / Math.max(img.width, img.height));
            baseW = Math.max(1, Math.round(img.width * scale));
            baseH = Math.max(1, Math.round(img.height * scale));
            baseCanvas.width = baseW; baseCanvas.height = baseH;
            maskCanvas.width = baseW; maskCanvas.height = baseH;
            var ctx = baseCanvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, baseW, baseH);
            maskCtx().clearRect(0, 0, baseW, baseH);
            undoStack.length = 0;
            baseUrl = baseCanvas.toDataURL('image/jpeg', 0.94);
            inpaintStage.classList.remove('hidden');
            inpaintTools.classList.remove('hidden');
            updateFormatUI();
        });
    }

    $('#inpaintUpload').addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        fileToDataUrl(file)
            .then(loadBase)
            .catch(function (err) { alert('Bild konnte nicht geladen werden: ' + err.message); });
    });

    function setBrushMode(m) {
        brushMode = m;
        $('#brushBtn').classList.toggle('is-active', m === 'brush');
        $('#eraseBtn').classList.toggle('is-active', m === 'erase');
    }

    $('#brushBtn').addEventListener('click', function () { setBrushMode('brush'); });
    $('#eraseBtn').addEventListener('click', function () { setBrushMode('erase'); });

    function pushUndo() {
        try {
            undoStack.push(maskCtx().getImageData(0, 0, maskCanvas.width, maskCanvas.height));
            if (undoStack.length > 20) undoStack.shift();
        } catch (e) { /* ignorieren */ }
    }

    $('#undoBtn').addEventListener('click', function () {
        var prev = undoStack.pop();
        if (prev) maskCtx().putImageData(prev, 0, 0);
    });

    $('#clearMaskBtn').addEventListener('click', function () {
        pushUndo();
        maskCtx().clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    });

    brushSize.addEventListener('input', function () { $('#brushSizeOut').textContent = brushSize.value; });
    featherRange.addEventListener('input', function () { $('#featherOut').textContent = featherRange.value; });

    function maskPos(e) {
        var r = maskCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (maskCanvas.width / r.width),
            y: (e.clientY - r.top) * (maskCanvas.height / r.height)
        };
    }

    maskCanvas.addEventListener('pointerdown', function (e) {
        if (!baseUrl) return;
        e.preventDefault();
        maskCanvas.setPointerCapture(e.pointerId);
        pushUndo();
        painting = true;
        var ctx = maskCtx();
        var r = maskCanvas.getBoundingClientRect();
        var lw = parseInt(brushSize.value, 10) * (maskCanvas.width / r.width);
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.lineWidth = lw;
        ctx.globalCompositeOperation = brushMode === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = ctx.fillStyle = '#ffd500';
        var p = maskPos(e);
        ctx.beginPath();
        ctx.arc(p.x, p.y, lw / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    });

    maskCanvas.addEventListener('pointermove', function (e) {
        if (!painting) return;
        e.preventDefault();
        var p = maskPos(e);
        var ctx = maskCtx();
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    });

    function endPaint() {
        if (!painting) return;
        painting = false;
        maskCtx().globalCompositeOperation = 'source-over';
    }

    maskCanvas.addEventListener('pointerup', endPaint);
    maskCanvas.addEventListener('pointercancel', endPaint);
    window.addEventListener('pointerup', endPaint);

    function maskIsEmpty() {
        try {
            var d = maskCtx().getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
            for (var i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
            return true;
        } catch (e) { return true; }
    }

    // Maske für die API: fal erwartet für GPT Image eine deckende Maske, bei der
    // weisse Pixel den bearbeitbaren Bereich markieren und schwarze Pixel bleiben.
    function buildApiMask() {
        var src = maskCtx().getImageData(0, 0, baseW, baseH);
        var out = document.createElement('canvas');
        out.width = baseW; out.height = baseH;
        var octx = out.getContext('2d');
        var img = octx.createImageData(baseW, baseH);
        var s = src.data, d = img.data;
        for (var i = 0; i < s.length; i += 4) {
            var v = s[i + 3] > 8 ? 255 : 0;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
            d[i + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        return out.toDataURL('image/png');
    }

    // Weiche Kante für die lokale Nachbearbeitung.
    function featheredMask(maskImg, w, h, feather) {
        var out = document.createElement('canvas');
        out.width = w; out.height = h;
        var ctx = out.getContext('2d');
        var blur = Math.min(200, (feather || 0) * Math.max(w, h) / 512);
        if (blur <= 0.5) {
            ctx.drawImage(maskImg, 0, 0, w, h);
            return out;
        }
        if (typeof ctx.filter === 'string') {
            ctx.filter = 'blur(' + blur + 'px)';
            ctx.drawImage(maskImg, 0, 0, w, h);
            ctx.filter = 'none';
            return out;
        }
        var k = Math.max(2, blur / 2);
        var sw = Math.max(1, Math.round(w / k));
        var sh = Math.max(1, Math.round(h / k));
        var small = document.createElement('canvas');
        small.width = sw; small.height = sh;
        small.getContext('2d').drawImage(maskImg, 0, 0, sw, sh);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, w, h);
        return out;
    }

    // Ergebnis = Modellbild im Maskenbereich, Original ausserhalb.
    function compositeInpaint(resultUrl, snap) {
        return Promise.all([loadImage(resultUrl), loadImage(snap.base), loadImage(snap.overlay)])
            .then(function (imgs) {
                var res = imgs[0], base = imgs[1], overlay = imgs[2];
                var w = snap.w, h = snap.h;
                var soft = featheredMask(overlay, w, h, snap.feather);

                var clipped = document.createElement('canvas');
                clipped.width = w; clipped.height = h;
                var cctx = clipped.getContext('2d');
                cctx.drawImage(res, 0, 0, w, h);
                cctx.globalCompositeOperation = 'destination-in';
                cctx.drawImage(soft, 0, 0);

                var out = document.createElement('canvas');
                out.width = w; out.height = h;
                var octx = out.getContext('2d');
                octx.drawImage(base, 0, 0, w, h);
                octx.drawImage(clipped, 0, 0);
                return out.toDataURL('image/png');
            });
    }

    /* ------------------------------------------------------------------ */
    /* Format                                                              */
    /* ------------------------------------------------------------------ */

    var ratioSelect = $('#ratioSelect');
    var tierSeg = $('#tierSeg');
    var formatHint = $('#formatHint');

    var currentRatio = 'auto';
    var currentTier = '2K';

    try {
        currentRatio = localStorage.getItem(RATIO_STORAGE) || 'auto';
        currentTier = localStorage.getItem(TIER_STORAGE) || '2K';
    } catch (e) { /* egal */ }
    if (!TIER_PX[currentTier]) currentTier = '2K';

    RATIOS.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.value;
        o.textContent = r.label || r.value;
        ratioSelect.appendChild(o);
    });
    if (!RATIOS.some(function (r) { return r.value === currentRatio; })) currentRatio = 'auto';
    ratioSelect.value = currentRatio;

    function ratioEntry(value) {
        for (var i = 0; i < RATIOS.length; i++) if (RATIOS[i].value === value) return RATIOS[i];
        return RATIOS[0];
    }

    function dimsFor(value, tier) {
        var r = ratioEntry(value);
        if (!r.w) return null;
        var long = TIER_PX[tier] || TIER_PX['2K'];
        var w, h;
        if (r.w >= r.h) { w = long; h = Math.round(long * r.h / r.w); }
        else { h = long; w = Math.round(long * r.w / r.h); }
        var snap = function (v) { return Math.max(64, Math.min(14142, Math.round(v / 8) * 8)); };
        return { width: snap(w), height: snap(h) };
    }

    function updateFormatUI() {
        // Im Inpaint-Modus richtet sich die Ausgabe zwingend nach dem Basisbild.
        $('#formatCard').classList.toggle('hidden', mode === 'inpaint');
        $('#inpaintInfo').textContent = baseUrl
            ? 'Male den Bereich, der geändert werden soll, und beschreibe die Änderung im Prompt. ' +
              'Ausgabe: ' + baseW + ' × ' + baseH + ' px (Format des Basisbildes).'
            : 'Male den Bereich, der geändert werden soll, und beschreibe die Änderung im Prompt.';

        var auto = currentRatio === 'auto';
        tierSeg.classList.toggle('is-off', auto);
        $$('.seg-btn', tierSeg).forEach(function (b) {
            b.classList.toggle('is-active', b.dataset.tier === currentTier);
        });

        if (auto) {
            formatHint.textContent = 'AUTO: Format und Auflösung werden vom Eingabebild übernommen. ' +
                currentTier + ' greift, sobald ein festes Seitenverhältnis gewählt wird.';
        } else {
            var d = dimsFor(currentRatio, currentTier);
            formatHint.textContent = currentRatio + ' · ' + d.width + ' × ' + d.height + ' px';
        }
    }

    ratioSelect.addEventListener('change', function () {
        currentRatio = ratioSelect.value;
        try { localStorage.setItem(RATIO_STORAGE, currentRatio); } catch (e) {}
        updateFormatUI();
    });

    $$('.seg-btn', tierSeg).forEach(function (b) {
        b.addEventListener('click', function () {
            currentTier = b.dataset.tier;
            try { localStorage.setItem(TIER_STORAGE, currentTier); } catch (e) {}
            updateFormatUI();
        });
    });

    /* ------------------------------------------------------------------ */
    /* fal.ai Queue                                                        */
    /* ------------------------------------------------------------------ */

    function errorText(res, body) {
        var detail = body && body.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail) && detail.length) {
            return detail.map(function (d) {
                return (d.loc ? d.loc.join('.') + ': ' : '') + (d.msg || JSON.stringify(d));
            }).join(' | ');
        }
        if (body && body.message) return body.message;
        if (res.status === 401 || res.status === 403) return 'API-Key ungültig oder ohne Berechtigung (HTTP ' + res.status + ').';
        if (res.status === 402) return 'Kein Guthaben auf dem fal.ai-Konto (HTTP 402).';
        if (res.status === 429) return 'Zu viele Anfragen – bitte kurz warten (HTTP 429).';
        return 'HTTP ' + res.status + ' ' + (res.statusText || '');
    }

    function readError(res) {
        return res.text().then(function (txt) {
            var body = null;
            try { body = JSON.parse(txt); } catch (e) { /* kein JSON */ }
            var msg = errorText(res, body);
            if (!body && txt) msg += ' – ' + txt.slice(0, 200);
            return new Error(msg);
        });
    }

    function falSubmit(payload, key) {
        return fetch(QUEUE_URL, {
            method: 'POST',
            headers: { 'Authorization': 'Key ' + key, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (res) {
            if (!res.ok) return readError(res).then(function (e) { throw e; });
            return res.json();
        });
    }

    function falPoll(statusUrl, key, onStatus, state) {
        var deadline = Date.now() + JOB_TIMEOUT_MS;

        function step() {
            if (state.cancelled) throw new Error('__cancelled__');
            if (Date.now() > deadline) throw new Error('Zeitüberschreitung – die Anfrage hat zu lange gedauert.');
            return fetch(statusUrl, { headers: { 'Authorization': 'Key ' + key } })
                .then(function (res) {
                    if (res.status === 429) return sleep(3000).then(step);
                    if (!res.ok) return readError(res).then(function (e) { throw e; });
                    return res.json().then(function (data) {
                        if (data.status === 'COMPLETED') return data;
                        onStatus(data);
                        return sleep(POLL_MS).then(step);
                    });
                });
        }
        return step();
    }

    function falResult(responseUrl, key) {
        return fetch(responseUrl, { headers: { 'Authorization': 'Key ' + key } })
            .then(function (res) {
                if (!res.ok) return readError(res).then(function (e) { throw e; });
                return res.json();
            });
    }

    function falCancel(cancelUrl, key) {
        if (!cancelUrl) return;
        fetch(cancelUrl, { method: 'PUT', headers: { 'Authorization': 'Key ' + key } })
            .catch(function () { /* best effort */ });
    }

    /* ------------------------------------------------------------------ */
    /* Jobs                                                                */
    /* ------------------------------------------------------------------ */

    var jobsEl = $('#jobs');

    function createJobCard(spec) {
        var card = el('section', 'job');
        var head = el('div', 'job-head');
        head.appendChild(el('span', 'job-badge', spec.mode === 'inpaint' ? 'Inpaint' : 'Edit'));
        head.appendChild(el('span', null, spec.formatLabel));
        head.appendChild(el('span', 'job-spacer'));
        var status = el('span', 'job-status', 'Wird gesendet …');
        head.appendChild(status);
        card.appendChild(head);

        if (spec.prompt) card.appendChild(el('p', 'job-prompt', spec.prompt));

        var bar = el('div', 'job-bar');
        bar.appendChild(el('span'));
        card.appendChild(bar);

        var actions = el('div', 'job-actions');
        card.appendChild(actions);

        jobsEl.insertBefore(card, jobsEl.firstChild);

        return {
            card: card,
            setStatus: function (t) { status.textContent = t; },
            stopBar: function () { bar.remove(); },
            actions: actions,
            fail: function (msg) {
                card.classList.add('is-error');
                bar.remove();
                status.textContent = 'Fehler';
                card.insertBefore(el('p', 'job-error', msg), actions);
            }
        };
    }

    function addAction(container, label, fn, primary) {
        var b = el('button', 'btn btn-small ' + (primary ? 'btn-primary' : 'btn-ghost'), label);
        b.type = 'button';
        b.addEventListener('click', fn);
        container.appendChild(b);
        return b;
    }

    function showResult(ui, spec, dataUrl, remoteUrl) {
        ui.stopBar();
        ui.setStatus('Fertig');

        var img = el('img', 'job-img');
        img.src = dataUrl || remoteUrl;
        img.alt = spec.prompt || 'Ergebnis';
        img.addEventListener('click', function () { openLightbox(img.src); });
        ui.card.insertBefore(img, ui.actions);

        addAction(ui.actions, 'Herunterladen', function () {
            download(img.src, 'fhnw-imageeditor-' + Date.now() + '.png');
        }, true);

        addAction(ui.actions, 'Als Quellbild übernehmen', function () {
            if (refs.length >= MAX_REFS) refs.pop();
            refs.unshift({ id: uid(), dataUrl: img.src, name: 'Ergebnis' });
            setMode('edit');
            renderPreviews();
            previewGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        addAction(ui.actions, 'In Inpaint öffnen', function () {
            setMode('inpaint');
            loadBase(img.src).then(function () {
                inpaintStage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }).catch(function (err) { alert(err.message); });
        });

        if (remoteUrl) {
            var a = el('a', 'btn btn-small btn-ghost', 'Original öffnen');
            a.href = remoteUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            ui.actions.appendChild(a);
        }
    }

    // Zustand der Oberfläche einfrieren, damit parallele Jobs sich nicht stören.
    function snapshot(promptText) {
        var spec = {
            mode: mode,
            prompt: promptText,
            ratio: currentRatio,
            tier: currentTier
        };

        if (mode === 'inpaint') {
            if (!baseUrl) throw new Error('Bitte zuerst ein Basisbild wählen.');
            if (maskIsEmpty()) throw new Error('Bitte den zu ändernden Bereich markieren.');
            spec.images = [baseUrl].concat(refs.map(function (r) { return r.dataUrl; }));
            spec.maskUrl = buildApiMask();
            spec.imageSize = 'auto';
            spec.formatLabel = baseW + ' × ' + baseH + ' px';
            spec.composite = $('#protectOutside').checked;
            spec.inpaint = {
                base: baseUrl,
                overlay: maskCanvas.toDataURL('image/png'),
                w: baseW,
                h: baseH,
                feather: parseInt(featherRange.value, 10) || 0
            };
        } else {
            if (!refs.length) throw new Error('Bitte mindestens ein Bild hochladen.');
            spec.images = refs.map(function (r) { return r.dataUrl; });
            var d = dimsFor(currentRatio, currentTier);
            spec.imageSize = d || 'auto';
            spec.formatLabel = d ? (currentRatio + ' · ' + d.width + ' × ' + d.height) : 'AUTO';
        }

        var bytes = spec.images.reduce(function (sum, u) { return sum + approxBytes(u); }, 0);
        if (spec.maskUrl) bytes += approxBytes(spec.maskUrl);
        if (bytes > MAX_PAYLOAD_MB * 1024 * 1024) {
            throw new Error('Die gewählten Bilder sind zusammen zu gross (' +
                (bytes / 1048576).toFixed(1) + ' MB). Bitte weniger oder kleinere Bilder verwenden.');
        }
        return spec;
    }

    function runJob(spec, key) {
        var ui = createJobCard(spec);
        var state = { cancelled: false };
        var started = Date.now();
        var cancelBtn = addAction(ui.actions, 'Abbrechen', function () {
            state.cancelled = true;
            ui.stopBar();
            ui.setStatus('Abgebrochen');
            cancelBtn.remove();
        });

        var payload = {
            prompt: spec.prompt,
            image_urls: spec.images,
            image_size: spec.imageSize,
            quality: REQ_QUALITY,
            num_images: 1,
            output_format: REQ_FORMAT
        };
        if (spec.maskUrl) payload.mask_url = spec.maskUrl;

        var handle = null;

        falSubmit(payload, key).then(function (h) {
            handle = h;
            if (state.cancelled) { falCancel(h.cancel_url, key); throw new Error('__cancelled__'); }
            ui.setStatus('In der Warteschlange …');
            return falPoll(h.status_url, key, function (s) {
                var secs = Math.round((Date.now() - started) / 1000);
                if (s.status === 'IN_QUEUE') {
                    var pos = (typeof s.queue_position === 'number') ? ' (Position ' + s.queue_position + ')' : '';
                    ui.setStatus('In der Warteschlange' + pos + ' · ' + secs + ' s');
                } else {
                    ui.setStatus('Wird generiert … ' + secs + ' s');
                }
            }, state);
        }).then(function () {
            ui.setStatus('Ergebnis wird geladen …');
            return falResult(handle.response_url, key);
        }).then(function (data) {
            var images = (data && data.images) || [];
            if (!images.length || !images[0].url) throw new Error('Die API hat kein Bild zurückgegeben.');
            var remote = images[0].url;
            return fetch(remote).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.blob();
            }).then(blobToDataUrl).then(function (dataUrl) {
                return { dataUrl: dataUrl, remote: remote };
            }).catch(function () {
                return { dataUrl: null, remote: remote };
            });
        }).then(function (out) {
            if (state.cancelled) return;
            cancelBtn.remove();
            if (spec.mode === 'inpaint' && spec.composite && out.dataUrl) {
                ui.setStatus('Wird zusammengesetzt …');
                return compositeInpaint(out.dataUrl, spec.inpaint)
                    .then(function (merged) { return { dataUrl: merged, remote: out.remote }; })
                    .catch(function (e) {
                        console.warn('Compositing fehlgeschlagen:', e);
                        return out;
                    });
            }
            return out;
        }).then(function (out) {
            if (!out || state.cancelled) return;
            showResult(ui, spec, out.dataUrl, out.remote);
            return addHistory({
                id: uid(),
                ts: Date.now(),
                mode: spec.mode,
                prompt: spec.prompt,
                format: spec.formatLabel,
                dataUrl: out.dataUrl || out.remote
            });
        }).catch(function (err) {
            if (state.cancelled || err.message === '__cancelled__') {
                if (handle) falCancel(handle.cancel_url, key);
                return;
            }
            console.error(err);
            ui.fail(err.message || String(err));
            if (cancelBtn.parentNode) cancelBtn.remove();
            addAction(ui.actions, 'Erneut versuchen', function () {
                ui.card.remove();
                runJob(spec, getKey());
            }, true);
        });
    }

    function generate() {
        var key = requireKey();
        if (!key) return;

        var promptText = $('#prompt').value.trim();
        if (!promptText) {
            $('#prompt').focus();
            return;
        }

        var spec;
        try { spec = snapshot(promptText); }
        catch (err) { alert(err.message); return; }

        runJob(spec, key);
        jobsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    $('#genBtn').addEventListener('click', generate);

    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
        if (e.key === 'Escape') closeLightbox();
    });

    /* ------------------------------------------------------------------ */
    /* Verlauf (IndexedDB)                                                 */
    /* ------------------------------------------------------------------ */

    var DB_NAME = 'fhnw-imageeditor';
    var STORE = 'history';
    var HISTORY_MAX = 60;
    var dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('IndexedDB nicht verfügbar')); return; }
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var store = db.createObjectStore(STORE, { keyPath: 'id' });
                    store.createIndex('ts', 'ts');
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        }).catch(function (e) { dbPromise = null; throw e; });
        return dbPromise;
    }

    function tx(mode) {
        return openDb().then(function (db) {
            return db.transaction(STORE, mode).objectStore(STORE);
        });
    }

    // Führt Schreibzugriffe aus und wartet, bis die Transaktion abgeschlossen ist.
    function write(fn) {
        return tx('readwrite').then(function (store) {
            return new Promise(function (resolve, reject) {
                fn(store);
                store.transaction.oncomplete = function () { resolve(); };
                store.transaction.onerror = function () { reject(store.transaction.error); };
                store.transaction.onabort = function () { reject(store.transaction.error); };
            });
        });
    }

    function addHistory(rec) {
        return thumbnail(rec.dataUrl, 320).then(function (thumb) {
            rec.thumb = thumb;
            return write(function (store) { store.put(rec); });
        }).then(prune).then(renderHistory).catch(function (e) {
            console.warn('Verlauf konnte nicht gespeichert werden:', e);
        });
    }

    function allHistory() {
        return tx('readonly').then(function (store) {
            return new Promise(function (resolve) {
                var r = store.getAll();
                r.onsuccess = function () {
                    resolve((r.result || []).sort(function (a, b) { return b.ts - a.ts; }));
                };
                r.onerror = function () { resolve([]); };
            });
        }).catch(function () { return []; });
    }

    function prune() {
        return allHistory().then(function (items) {
            if (items.length <= HISTORY_MAX) return;
            return write(function (store) {
                items.slice(HISTORY_MAX).forEach(function (i) { store.delete(i.id); });
            });
        });
    }

    function renderHistory() {
        return allHistory().then(function (items) {
            var grid = $('#historyGrid');
            grid.innerHTML = '';
            $('#historyCount').textContent = items.length ? items.length + ' Bilder' : 'leer';

            items.forEach(function (item) {
                var box = el('div', 'hist-item');
                var img = el('img');
                img.src = item.thumb || item.dataUrl;
                img.alt = item.prompt || '';
                img.loading = 'lazy';
                img.addEventListener('click', function () { openLightbox(item.dataUrl); });
                box.appendChild(img);

                var meta = el('div', 'hist-meta');
                meta.appendChild(el('div', 'hist-prompt', item.prompt || '—'));
                meta.appendChild(el('div', null,
                    formatTime(item.ts) + ' · ' + (item.mode === 'inpaint' ? 'Inpaint' : 'Edit')));

                var acts = el('div', 'hist-actions');
                var dl = el('button', null, 'Laden');
                dl.type = 'button';
                dl.addEventListener('click', function () {
                    download(item.dataUrl, 'fhnw-imageeditor-' + item.ts + '.png');
                });
                acts.appendChild(dl);

                var reuse = el('button', null, 'Als Quelle');
                reuse.type = 'button';
                reuse.addEventListener('click', function () {
                    if (refs.length >= MAX_REFS) refs.pop();
                    refs.unshift({ id: uid(), dataUrl: item.dataUrl, name: 'Verlauf' });
                    setMode('edit');
                    renderPreviews();
                    previewGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                acts.appendChild(reuse);

                var inp = el('button', null, 'Inpaint');
                inp.type = 'button';
                inp.addEventListener('click', function () {
                    setMode('inpaint');
                    loadBase(item.dataUrl).then(function () {
                        inpaintStage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }).catch(function (err) { alert(err.message); });
                });
                acts.appendChild(inp);

                var del = el('button', null, 'Löschen');
                del.type = 'button';
                del.addEventListener('click', function () {
                    write(function (store) { store.delete(item.id); })
                        .then(renderHistory)
                        .catch(function (e) { console.warn(e); });
                });
                acts.appendChild(del);

                meta.appendChild(acts);
                box.appendChild(meta);
                grid.appendChild(box);
            });
        });
    }

    $('#historyClear').addEventListener('click', function () {
        if (!confirm('Gesamten Verlauf löschen?')) return;
        write(function (store) { store.clear(); })
            .then(renderHistory)
            .catch(function (e) { console.warn(e); });
    });

    /* ------------------------------------------------------------------ */
    /* Lightbox                                                            */
    /* ------------------------------------------------------------------ */

    var lightbox = $('#lightbox');
    var lightboxImg = $('#lightboxImg');

    function openLightbox(src) {
        lightboxImg.src = src;
        lightbox.hidden = false;
    }
    function closeLightbox() {
        lightbox.hidden = true;
        lightboxImg.removeAttribute('src');
    }
    lightbox.addEventListener('click', closeLightbox);

    /* ------------------------------------------------------------------ */
    /* Start                                                               */
    /* ------------------------------------------------------------------ */

    setMode('edit');
    updateFormatUI();
    renderPreviews();
    renderHistory();

})();
