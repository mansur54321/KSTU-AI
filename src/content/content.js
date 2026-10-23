const MODEL_POLICY = globalThis.KSTU_AI_CONFIG;
const { CONFIG } = MODEL_POLICY;
const HOTKEY_CODE = CONFIG.HOTKEY_CODE;
const HOTKEY_NEXT_PAGE = CONFIG.HOTKEY_NEXT_PAGE;
const MARKER_COLOR = CONFIG.MARKER_COLOR;
const RETRY_CONFIG = CONFIG.RETRY;
const DEBUG_PREFIX = '[KSTU-AI]';

function getModels(pro) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'get_models', pro }, (resp) => {
            const models = resp || MODEL_POLICY.selectModels({ pro: !!pro });
            console.log(`${DEBUG_PREFIX} Models loaded`, { pro: !!pro, models });
            resolve(models);
        });
    });
}

function getFallbackModels() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'get_fallback_models' }, (resp) => {
            resolve(resp || MODEL_POLICY.getFallbackModels());
        });
    });
}

let currentKeyIndex = 0;
let isExtensionEnabled = true;
let isProcessingSingle = false;
let isProcessingBatch = false;
let isAutoAdvancing = false;
let platonusPrefetch = null;
let platonusPrefetchEpoch = 0;
let requestCounter = 0;

function stringifyLog(details) {
    try { return JSON.stringify(details); }
    catch (e) { return String(details); }
}

console.log(`%c🛡️ v${chrome.runtime?.getManifest?.()?.version || 'dev'}`, "color:#fff;background:#333;padding:3px 8px;border-radius:3px;font-size:11px;");

async function checkEnabled() {
    const data = await chrome.storage.sync.get(['isEnabled']);
    isExtensionEnabled = data.isEnabled !== false;
    return isExtensionEnabled;
}

let stealthNotification = null;

function showStealthNotify(message, type = 'info', duration = 2500) {
    if (stealthNotification) stealthNotification.remove();

    const colors = {
        info: { bg: 'rgba(60,60,60,0.6)', border: 'rgba(80,80,80,0.4)' },
        success: { bg: 'rgba(40,60,40,0.5)', border: 'rgba(60,80,60,0.3)' },
        error: { bg: 'rgba(60,40,40,0.5)', border: 'rgba(80,60,60,0.3)' },
        warning: { bg: 'rgba(60,55,35,0.5)', border: 'rgba(80,70,50,0.3)' }
    };
    const style = colors[type] || colors.info;

    stealthNotification = document.createElement('div');
    stealthNotification.className = 'ai-stealth-notify';
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    stealthNotification.appendChild(messageSpan);
    stealthNotification.style.cssText = `
        position:fixed;bottom:15px;right:15px;
        background:${style.bg};color:rgba(200,200,200,0.7);
        padding:8px 12px;border-radius:4px;border-left:2px solid ${style.border};
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:11px;
        z-index:2147483647;pointer-events:none;max-width:220px;
        opacity:0;transform:translateY(10px);transition:all 0.2s ease;
    `;
    document.body.appendChild(stealthNotification);
    requestAnimationFrame(() => {
        stealthNotification.style.opacity = '1';
        stealthNotification.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        if (stealthNotification) {
            stealthNotification.style.opacity = '0';
            setTimeout(() => stealthNotification?.remove(), 200);
        }
    }, duration);
}

function getStudentName() {
    try {
        const el = document.querySelector('.userbutton .usertext') ||
            document.querySelector('.logininfo a') ||
            document.querySelector('.dropdown-user .fw-semibold') ||
            document.querySelector('.username') || document.querySelector('#username_logged_in');
        if (el) return el.innerText.trim();
    } catch (e) { }
    return "Аноним";
}

let statusIndicator = null;

function showStatus(msg, color = 'default') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.className = 'ai-status-indicator';
        statusIndicator.style.cssText = `
            position:fixed;bottom:2px;right:2px;
            font-family:-apple-system,sans-serif;font-size:9px;font-weight:400;
            color:rgba(0,0,0,0.15);background:transparent;
            padding:1px 3px;pointer-events:none;z-index:2147483647;
            mix-blend-mode:multiply;
        `;
        document.body.appendChild(statusIndicator);
    }
    const colors = { default: 'rgba(0,0,0,0.15)', red: 'rgba(180,40,40,0.25)', orange: 'rgba(180,120,20,0.25)', green: 'rgba(40,120,40,0.25)' };
    statusIndicator.style.color = colors[color] || colors.default;
    statusIndicator.innerText = msg;
    statusIndicator.style.display = 'block';
}

function hideStatus() {
    if (statusIndicator) setTimeout(() => { if (statusIndicator) statusIndicator.style.display = 'none'; }, 4000);
}

function unlockSite() {
    const style = document.createElement('style');
    style.id = 'ai-unlock-style';
    style.textContent = '*{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;pointer-events:auto!important}';
    if (!document.getElementById('ai-unlock-style')) document.head.appendChild(style);
    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup'].forEach(evt => {
        window.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
    });
}

function cleanupAIElements() {
    document.querySelectorAll('.ai-stealth-badge,.ai-marker,.ai-status-indicator,.ai-stealth-notify').forEach(el => el.remove());
    statusIndicator = null;
    stealthNotification = null;
}

window.addEventListener('beforeunload', cleanupAIElements);
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; cleanupAIElements(); }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

async function processImageSource(url) {
    if (!url) return null;
    try {
        if (url.startsWith('data:')) {
            const comma = url.indexOf(',');
            return { inline_data: { mime_type: 'image/jpeg', data: url.substring(comma + 1) } };
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fetch error');
        const blob = await response.blob();
        let validMime = blob.type;
        if (!validMime || validMime === 'application/octet-stream') validMime = 'image/jpeg';
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ inline_data: { mime_type: validMime, data: reader.result.split(',')[1] } });
            reader.readAsDataURL(blob);
        });
    } catch (e) { return null; }
}

async function getAnnotatedMap(bgImg, dropzones) {
    if (!bgImg) return null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bgImg.naturalWidth || bgImg.width || 800;
        canvas.height = bgImg.naturalHeight || bgImg.height || 600;
        const ctx = canvas.getContext('2d');
        try {
            bgImg.crossOrigin = "anonymous";
            ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        } catch (corsError) {
            return await getScreenshotFallback(bgImg, dropzones);
        }
        const scaleX = canvas.width / bgImg.offsetWidth;
        const scaleY = canvas.height / bgImg.offsetHeight;
        const bgRect = bgImg.getBoundingClientRect();
        ctx.font = "bold 60px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        dropzones.forEach((zone, idx) => {
            const zRect = zone.getBoundingClientRect();
            const x = (zRect.left - bgRect.left + zRect.width / 2) * scaleX;
            const y = (zRect.top - bgRect.top + zRect.height / 2) * scaleY;
            ctx.fillStyle = "#d32f2f";
            ctx.beginPath();
            ctx.arc(x, y, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.fillText(idx + 1, x, y);
        });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        return { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } };
    } catch (e) {
        return await getScreenshotFallback(bgImg, dropzones);
    }
}

async function getScreenshotFallback(bgImg, dropzones) {
    try {
        const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'screenshot' }, resolve);
        });
        if (!resp?.dataUrl) return null;
        const bgRect = bgImg.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = bgRect.width * dpr;
        cropCanvas.height = bgRect.height * dpr;
        const ctx = cropCanvas.getContext('2d');
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = resp.dataUrl;
        });
        ctx.drawImage(img,
            bgRect.left * dpr, bgRect.top * dpr, bgRect.width * dpr, bgRect.height * dpr,
            0, 0, cropCanvas.width, cropCanvas.height
        );
        const scaleX = cropCanvas.width / bgRect.width;
        const scaleY = cropCanvas.height / bgRect.height;
        ctx.font = `bold ${40 * dpr}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4 * dpr;
        dropzones.forEach((zone, idx) => {
            const zRect = zone.getBoundingClientRect();
            const x = (zRect.left - bgRect.left + zRect.width / 2) * scaleX;
            const y = (zRect.top - bgRect.top + zRect.height / 2) * scaleY;
            ctx.fillStyle = "#d32f2f";
            ctx.beginPath();
            ctx.arc(x, y, 40 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.fillText(idx + 1, x, y);
        });
        const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.8);
        return { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } };
    } catch (e) {
        return null;
    }
}

function extractQuestions() {
    const questions = [];

    const moodleQuestions = document.querySelectorAll('.que');
    if (moodleQuestions.length > 0) {
        moodleQuestions.forEach((el, i) => {
            if (el.classList.contains('description')) return;
            const textEl = el.querySelector('.qtext');
            const fillInput = el.querySelector('.shortanswer input[type="text"]') ||
                el.querySelector('.essay textarea') ||
                el.querySelector('.shortanswer textarea');
            if (textEl && fillInput) {
                questions.push({
                    type: 'text_input', platform: 'moodle', number: i + 1,
                    text: textEl.innerText.trim(),
                    images: Array.from(el.querySelectorAll('.qtext img')).map(img => img.src).filter(Boolean),
                    inputElement: fillInput, domElement: el
                });
                return;
            }
            const bgImg = el.querySelector('.dropbackground');
            const dropzones = Array.from(el.querySelectorAll('.dropzone'));
            const answers = [];
            if (bgImg && dropzones.length > 0) {
                const seen = new Set();
                el.querySelectorAll('.draghome:not(.dragplaceholder)').forEach(d => {
                    let imgSrc = d.tagName === 'IMG' ? d.src : d.querySelector('img')?.src;
                    let text = d.innerText.trim();
                    const contentKey = text + (imgSrc || "");
                    if (!seen.has(contentKey) && (text || imgSrc)) {
                        seen.add(contentKey);
                        answers.push({ id: String.fromCharCode(65 + answers.length), text, imgSrc, element: d });
                    }
                });
                questions.push({
                    type: 'moodle_dd', platform: 'moodle', number: i + 1,
                    text: textEl ? textEl.innerText.trim() : "D&D Task",
                    bgImgElement: bgImg, dropzones, answers, domElement: el
                });
            } else {
                const options = el.querySelectorAll('.answer div, .answer li, table.answer tr');
                options.forEach((opt, idx) => {
                    const label = opt.querySelector('label');
                    const input = opt.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input || label) {
                        const txt = opt.innerText.trim();
                        const img = opt.querySelector('img')?.src;
                        const targetEl = input || label || opt;
                        answers.push({
                            id: String.fromCharCode(65 + idx), text: txt, imgSrc: img,
                            element: targetEl, textElement: opt
                        });
                    }
                });
                if (answers.length > 0) {
                    questions.push({
                        type: 'choice', platform: 'moodle', number: i + 1,
                        text: textEl ? textEl.innerText.trim() : "Question",
                        images: [], answers,
                        isMultiSelect: el.classList.contains('multichoice'), domElement: el
                    });
                }
            }
        });
        return questions;
    }

    const platonusWrapper = document.querySelector('.question-wrapper, div[ng-bind-html="question.questionText"]');
    if (platonusWrapper) {
        const text = platonusWrapper.innerText.trim();
        const qImages = [];
        platonusWrapper.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });
        const answers = [];
        document.querySelectorAll('.table-question tbody tr, .answer-variant').forEach((row, idx) => {
            const letterId = String.fromCharCode(65 + idx);
            const input = row.querySelector('input');
            const cells = row.querySelectorAll('td');
            const textContainer = cells.length > 1 ? cells[1] : row.querySelector('label');
            if (input && textContainer) {
                answers.push({ id: letterId, variantId: input.value, text: textContainer.innerText.trim(), imgSrc: textContainer.querySelector('img')?.src, element: input, textElement: textContainer });
            }
        });
        if (answers.length > 0) {
            questions.push({ type: 'choice', platform: 'platonus', questionId: answers[0].element.name.replace(/^question/, ''), text, images: qImages, answers, isMultiSelect: answers.some(answer => answer.element.type === 'checkbox'), domElement: platonusWrapper });
        }
    }

    const univerTables = document.querySelectorAll('table.question');
    if (univerTables.length > 0) {
        univerTables.forEach((table, i) => {
            const textElem = table.querySelector('.text');
            const qImages = [];
            textElem?.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });
            const answerTable = table.nextElementSibling;
            if (answerTable && answerTable.tagName === 'TABLE') {
                const answers = [];
                answerTable.querySelectorAll('tr').forEach(row => {
                    const label = row.querySelector('.num');
                    const textDiv = row.querySelector('.text');
                    const input = row.querySelector('input');
                    if (label && input) {
                        answers.push({ id: label.innerText.replace('.', '').trim(), text: textDiv ? textDiv.innerText.trim() : '', imgSrc: textDiv?.querySelector('img')?.src, element: input, textElement: label });
                    }
                });
                if (answers.length > 0) {
                    questions.push({ type: 'choice', platform: 'univer', number: i + 1, text: textElem ? textElem.innerText.trim() : "Q", images: qImages, answers, isMultiSelect: answerTable.dataset.qtype === '2', domElement: table });
                }
            }
        });
    }
    return questions;
}

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isQuestionAnswered(q) {
    if (q.type === 'text_input') return !!q.inputElement?.value?.trim();
    if (q.type === 'choice') return q.answers?.some(ans => ans.element?.checked) || false;
    return false;
}

async function typeAnswer(el, text) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(80 + Math.random() * 120);
    for (const char of text) {
        nativeSetter.call(el, el.value + char);
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: char }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: char }));
        await sleep(30 + Math.random() * 80);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(50);
    el.blur();
}

async function askGeminiViaBackground(parts, apiKeys, models, requestId) {
    return new Promise((resolve, reject) => {
        if (!chrome.runtime?.id) {
            reject(new Error('Extension context is not available. Reload the page after reloading the extension.'));
            return;
        }

        chrome.runtime.sendMessage(
            { action: 'ask_gemini', parts, apiKeys, models, requestId },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Background message failed: ${chrome.runtime.lastError.message}`));
                    return;
                }
                if (response?.error) {
                    reject(new Error(`Background request ${response.requestId || requestId} failed: ${response.error}`));
                    return;
                }
                if (response?.result) return resolve(response);
                reject(new Error(`No response from background for ${requestId}`));
            }
        );
    });
}

async function askGeminiWithRetry(parts, apiKeys, models, requestId, attempt = 1) {
    try {
        console.log(`${DEBUG_PREFIX} Sending Gemini request ${requestId} attempt ${attempt}`, {
            requestId,
            models,
            keysCount: apiKeys.length,
            parts: parts.length
        });
        return await askGeminiViaBackground(parts, apiKeys, models, requestId);
    } catch (error) {
        const isRateLimit = /HTTP 429|rate.*limit|RESOURCE_EXHAUSTED/i.test(error.message);
        console.warn(`${DEBUG_PREFIX} Gemini attempt failed ${stringifyLog({
            requestId,
            attempt,
            models,
            keysCount: apiKeys.length,
            error: error.message
        })}`);
        if (isRateLimit) throw error;
        if (attempt < RETRY_CONFIG.maxAttempts) {
            const isTimeout = error.message.toLowerCase().includes('timeout');
            const delay = isTimeout ? 10000 : RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
            showStatus('...', 'orange');
            await sleep(delay);
            return askGeminiWithRetry(parts, apiKeys, models, requestId, attempt + 1);
        }
        throw error;
    }
}

function isFatalApiError(error) {
    const msg = error?.message || String(error);
    // 400/401/403 = bad request or bad key: retrying other models/keys already
    // happened in the background, so falling back again only wastes quota.
    return /HTTP 4(0[0-9]|1[0-9]|29)\b|INVALID_ARGUMENT|PERMISSION_DENIED|invalid.*key|API key/i.test(msg);
}

async function askGeminiWithProFallback(parts, apiKeys, models, requestId) {
    try {
        return await askGeminiWithRetry(parts, apiKeys, models, requestId);
    } catch (error) {
        if (isFatalApiError(error)) throw error;
        const fallbackModels = await getFallbackModels();
        console.warn(`${DEBUG_PREFIX} Pro failed, using fallback ${stringifyLog({ requestId, error: error.message, fallbackModels })}`);
        return askGeminiWithRetry(parts, apiKeys, fallbackModels, `${requestId}-fallback`);
    }
}

async function buildApiParts(q) {
    const parts = [];
    let imgCount = 0;

    const systemPrompt = `You are a precise academic test solver. Rules:
1. Always answer in the SAME LANGUAGE as the question
2. For multiple correct answers, list ALL correct options
3. Return ONLY valid JSON, no markdown fences
4. If unsure, pick the MOST LIKELY answer
5. Keep "reason" under 20 words`;

    if (q.type === 'moodle_dd') {
        const mapPart = await getAnnotatedMap(q.bgImgElement, q.dropzones);
        if (mapPart) { parts.push(mapPart); imgCount++; }
        let itemsText = "";
        for (const ans of q.answers) {
            let line = `Item ${ans.id}: ${ans.text}`;
            if (ans.imgSrc) {
                const p = await processImageSource(ans.imgSrc);
                if (p) { parts.push(p); imgCount++; line += " [Image Attached]"; }
            }
            itemsText += line + "\n";
        }
        parts.push({ text: `${systemPrompt}\n\nTask: Drag & Drop.\nThe image has red numbered ZONES (1, 2, 3...).\nMatch ITEMS (A, B, C...) to these ZONES.\nItems list:\n${itemsText}\nReturn STRICT JSON: {"pairs": [{"zone": 1, "item": "A"}, {"zone": 2, "item": "B"}], "reason": "short"}` });
    } else if (q.type === 'text_input') {
        if (q.images?.length) {
            for (const url of q.images) { const p = await processImageSource(url); if (p) { parts.push(p); imgCount++; } }
        }
        parts.push({ text: `${systemPrompt}\n\nQuestion: ${q.text}\nProvide a short, precise answer (1-10 words max).\nReturn JSON: {"answer": "...", "reason": "brief explanation"}` });
    } else {
        if (q.images) { for (const url of q.images) { const p = await processImageSource(url); if (p) { parts.push(p); imgCount++; } } }
        let optionsText = "";
        for (const ans of q.answers) {
            let line = `${ans.id}. ${ans.text}`;
            if (ans.imgSrc) { const p = await processImageSource(ans.imgSrc); if (p) { parts.push(p); imgCount++; line += " [Image Attached]"; } }
            optionsText += line + "\n";
        }
        parts.push({ text: `${systemPrompt}\n\nQuestion: ${q.text}\nOptions:\n${optionsText}\nReturn JSON: {"correct": ["A"], "reason": "short"}` });
    }

    return { parts, imgCount };
}

function injectDotMarker(targetElement, reason = null) {
    if (!targetElement) return;
    if (targetElement.querySelector('.ai-marker')) return;
    const marker = document.createElement('span');
    marker.className = 'ai-marker';
    marker.textContent = ' •';
    marker.style.cssText = `color:${MARKER_COLOR};font-weight:bold;font-size:1.1em;margin-left:3px;${reason ? 'cursor:help;' : ''}`;
    if (reason) marker.title = reason;
    targetElement.appendChild(marker);
}

function platonusHtmlContent(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script, style').forEach(element => element.remove());
    template.content.querySelectorAll('br, p, div, li, td').forEach(element => element.append('\n'));
    return {
        text: template.content.textContent.replace(/\s+/g, ' ').trim(),
        images: Array.from(template.content.querySelectorAll('img[src]'), image => new URL(image.getAttribute('src'), location.href).href)
    };
}

async function loadPlatonusAnswer(q, apiKeys, models, isCurrent = () => true) {
    if (!await checkEnabled() || !isCurrent()) return null;
    const cached = await cacheLookup(q.text, q.answers, q.images, q.type);
    if (cached) return { result: cached, answers: q.answers };
    const requestId = `prefetch-${q.number}-${Date.now()}-${++requestCounter}`;
    const { parts } = await buildApiParts(q);
    if (!await checkEnabled() || !isCurrent()) return null;
    const response = await askGeminiWithProFallback(parts, apiKeys, models, requestId);
    if (!response?.result) throw new Error('No prefetch response');
    await cacheStoreFromResult(q.text, q.answers, response.result, q.images, q.type);
    chrome.runtime.sendMessage({ action: 'log_event', type: 'solve_success', model: response.model, meta: { platform: 'platonus', cached: false } });
    return { result: response.result, answers: q.answers };
}

async function preparePlatonusPrefetch(questions, apiKeys, models, enabled) {
    const current = questions.find(question => question.platform === 'platonus');
    if (!enabled || !current) {
        platonusPrefetchEpoch++;
        platonusPrefetch?.queue.stop();
        platonusPrefetch = null;
        return;
    }
    const epoch = platonusPrefetchEpoch;
    try {
        const snapshot = await chrome.runtime.sendMessage({ action: 'get_platonus_questions' });
        if (epoch !== platonusPrefetchEpoch) return;
        if (snapshot?.error || !snapshot?.questions) throw new Error(snapshot?.error || 'No Platonus snapshot');
        if (snapshot.completed || snapshot.currentQuestionId !== current.questionId) return;
        const session = JSON.stringify([snapshot.testingId, snapshot.attemptNumber, models, apiKeys]);
        if (platonusPrefetch?.session !== session) {
            platonusPrefetch?.queue.stop();
            const state = { session, queue: null };
            state.queue = new globalThis.KSTU_QUESTION_PREFETCH(question => loadPlatonusAnswer(question, apiKeys, models, () => platonusPrefetch === state && !state.queue.stopped));
            platonusPrefetch = state;
        }
        const index = snapshot.questions.findIndex(question => question.questionId === current.questionId && question.number === snapshot.currentNumber);
        if (index < 0) return;
        for (const question of snapshot.questions.slice(index, index + 3)) {
            if (question.number === snapshot.currentNumber && isQuestionAnswered(current)) continue;
            const content = platonusHtmlContent(question.textHtml);
            const answers = question.variants.map((variant, i) => {
                const answer = platonusHtmlContent(variant.textHtml);
                return { id: String.fromCharCode(65 + i), variantId: variant.id, text: answer.text, imgSrc: answer.images[0] };
            });
            const key = `${question.number}:${question.questionId}`;
            const promise = platonusPrefetch.queue.enqueue(key, {
                type: 'choice', platform: 'platonus', number: question.number, questionId: question.questionId,
                text: content.text, images: content.images, answers, isMultiSelect: question.isMultiSelect
            });
            if (question.number === snapshot.currentNumber) {
                current.prefetchedAnswer = promise;
                current.prefetchSession = session;
            }
        }
    } catch (error) {
        console.warn(`${DEBUG_PREFIX} Platonus prefetch unavailable:`, error.message);
        showStealthNotify('Фоновая загрузка недоступна. Решаю по одному вопросу.', 'warning', 2500);
    }
}

async function processQuestion(q, apiKeys, models, isBatch = false) {
    if (!isBatch && isProcessingSingle) {
        console.warn(`${DEBUG_PREFIX} Duplicate single solve ignored`);
        return false;
    }

    if (!isBatch) isProcessingSingle = true;
    const requestId = `req-${Date.now()}-${++requestCounter}`;
    let logGroupOpen = false;

    if (q.domElement) q.domElement.style.opacity = '0.7';
    if (!isBatch) {
        showStatus('...', 'default');
        document.querySelectorAll('.ai-marker').forEach(el => el.remove());
    }

    const settings = await chrome.storage.sync.get(['cfgAutoClick', 'cfgMarker']);
    const doClick = settings.cfgAutoClick !== false;
    const doMark = settings.cfgMarker !== false;
    let success = false;

    try {
        const prefetched = q.prefetchedAnswer ? await q.prefetchedAnswer.catch(error => {
            q.prefetchedAnswer = null;
            if (isFatalApiError(error)) throw error;
            console.warn(`${DEBUG_PREFIX} Prefetch failed, retrying current question:`, error.message);
            return null;
        }) : null;
        if (!await checkEnabled()) return false;
        const sourceAnswers = prefetched?.answers || q.answers;
        let result = null;
        let model = 'cache';
        let responseData = null;

        const cached = prefetched?.result || await cacheLookup(q.text, q.answers, q.images || [], q.type);
        if (cached) {
            q.cacheHit = true;
            console.groupCollapsed(`${DEBUG_PREFIX} Cache hit ${requestId}`);
            logGroupOpen = true;
            console.log('Question:', { requestId, platform: q.platform, type: q.type, number: q.number, cacheHit: true });
            result = cached;
            console.log('Cache answer:', { requestId, correct: cached.correct, reason: cached.reason });
            console.groupEnd();
            logGroupOpen = false;
        } else {
            const { parts } = await buildApiParts(q);
            console.groupCollapsed(`${DEBUG_PREFIX} Process question ${requestId}`);
            logGroupOpen = true;
            console.log('Question:', { requestId, platform: q.platform, type: q.type, number: q.number, answers: q.answers?.length || 0, batch: isBatch });
            console.log('Request parts:', {
                requestId,
                total: parts.length,
                text: parts.filter(part => part.text).length,
                images: parts.filter(part => part.inline_data).length
            });
            console.log('Models queue:', models);
            responseData = await askGeminiWithProFallback(parts, apiKeys, models, requestId);
            if (!responseData) throw new Error("No response");
            result = responseData.result;
            model = responseData.model;
            console.log('Model attempts:', { requestId, attempts: responseData.attempts || [] });
            console.log('Answered by model:', { requestId, model, result });
            console.groupEnd();
            logGroupOpen = false;
            await cacheStoreFromResult(q.text, q.answers, result, q.images || [], q.type);
        }

        if (q.platform === 'platonus') {
            if (!await checkEnabled()) return false;
            if (q.prefetchSession && q.prefetchSession !== platonusPrefetch?.session) {
                q.prefetchedAnswer = null;
                q.prefetchSession = null;
                return false;
            }
            const current = extractQuestions().find(question => question.platform === 'platonus' && question.questionId === q.questionId);
            if (!current) return false;
            if (isQuestionAnswered(current)) return true;
            const correctVariants = (result.correct || []).map(id => sourceAnswers.find(answer => answer.id === String(id).trim().toUpperCase())?.variantId).filter(Boolean);
            if (correctVariants.length !== result.correct?.length) return false;
            const correct = current.answers.filter(answer => correctVariants.includes(answer.variantId)).map(answer => answer.id);
            if (!correct.length) return false;
            result = { ...result, correct };
            q.domElement.style.opacity = '1';
            current.cacheHit = q.cacheHit;
            q = current;
        }

        if (q.domElement) q.domElement.style.opacity = '1';

        let answerLog = "";
        if (result.pairs) answerLog = "D&D";
        else if (result.correct) answerLog = result.correct.join(', ');
        else if (result.answer !== undefined) answerLog = String(result.answer);
        if (model !== 'cache') {
            chrome.runtime.sendMessage({ action: 'log_event', type: 'solve_success', model, meta: { platform: q.platform, cached: false } });
        }

        if (result && result.pairs && q.type === 'moodle_dd') {
            success = true;
            if (doMark) {
                result.pairs.forEach(pair => {
                    const item = q.answers.find(a => a.id === pair.item);
                    const zone = q.dropzones[pair.zone - 1];
                    if (item && zone) {
                        injectDotMarker(zone, `${item.id} → Зона ${pair.zone}`);
                    }
                });
            }
            if (!isBatch) { showStatus('✓', 'green'); showStealthNotify(I18N.t('notify.dragDropSolved'), 'success'); }
        } else if (result && result.answer !== undefined && q.type === 'text_input') {
            success = true;
            if (doClick) await typeAnswer(q.inputElement, String(result.answer));
            if (doMark && result.reason) {
                const container = q.inputElement.closest('.formulation, .shortanswer, .essay') || q.inputElement.parentElement;
                injectDotMarker(container, result.reason);
            }
            if (!isBatch) { showStatus('✓', 'green'); showStealthNotify(I18N.t('notify.textAnswered'), 'success'); }
        } else if (result && result.correct) {
            let found = false;
            q.answers.forEach(ans => {
                const normalizedText = ans.text?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
                const isMatch = result.correct.some(c => {
                    const id = String(c).trim();
                    if (!id) return false;
                    if (q.platform === 'platonus') return id === ans.id;
                    return id === ans.id ||
                        id.toLowerCase() === ans.id.toLowerCase() ||
                        normalizedText === id.toLowerCase() ||
                        normalizedText.includes(id.toLowerCase());
                });
                if (isMatch) {
                    found = true;
                    if (doClick && !ans.element.checked) ans.element.click();
                    if (doMark && ans.textElement) injectDotMarker(ans.textElement, result.reason || null);
                }
            });
            if (!isBatch) {
                showStatus(found ? '✓' : '?', found ? 'green' : 'orange');
                if (found) showStealthNotify(I18N.t('notify.answerFound'), 'success');
            }
            success = found;
        }
        return success;
    } catch (e) {
        console.error(`${DEBUG_PREFIX} Question failed ${stringifyLog({ requestId, error: e.message || String(e) })}`);
        if (logGroupOpen) console.groupEnd();
        if (q.domElement) q.domElement.style.opacity = '1';
        if (!isBatch) {
            showStatus('!', 'red');
            showStealthNotify(I18N.t('notify.error'), 'error', 2000);
        }
        return false;
    } finally {
        if (q.domElement) q.domElement.style.opacity = '1';
        if (!isBatch) isProcessingSingle = false;
    }
}

async function start() {
    if (!await checkEnabled()) return;

    const storage = await chrome.storage.sync.get(['cfgProModels', 'cfgFastMode']);
    const local = await chrome.storage.local.get(['geminiApiKeys']);
    const keys = local.geminiApiKeys || [];

    const models = await getModels(storage.cfgProModels);
    const isPro = !!storage.cfgProModels;
    const isFastMode = isPro && !!storage.cfgFastMode;

    console.log(`${DEBUG_PREFIX} Start solving`, {
        proModels: isPro,
        fastMode: isFastMode,
        models,
        keysCount: keys.length,
        parallelMode: isFastMode
    });

    if (!keys.length) {
        showStealthNotify(I18N.t('notify.noApiKeys'), 'warning');
        return { total: 0, solved: 0, failed: 0 };
    }

    const qs = extractQuestions();
    console.log(`${DEBUG_PREFIX} Questions extracted`, qs.map(q => ({ platform: q.platform, type: q.type, number: q.number, answers: q.answers?.length || 0 })));
    if (!qs.length) {
        showStealthNotify(I18N.t('notify.questionsNotFound'), 'warning');
        return { total: 0, solved: 0, failed: 0 };
    }

    await preparePlatonusPrefetch(qs, keys, models, isFastMode);

    const pendingQs = qs.filter(q => !isQuestionAnswered(q));
    const alreadyAnswered = qs.length - pendingQs.length;
    if (!pendingQs.length) {
        showStealthNotify('Уже отвечено', 'success', 900);
        hideStatus();
        return { total: qs.length, solved: qs.length, failed: 0, alreadyAnswered: true, allCached: false };
    }

    if (isFastMode) {
        if (isProcessingBatch) {
            console.warn(`${DEBUG_PREFIX} Batch already in progress`);
            return { total: qs.length, solved: alreadyAnswered, failed: pendingQs.length };
        }
        isProcessingBatch = true;
        console.log(`${DEBUG_PREFIX} Parallel mode: sending ${pendingQs.length} requests simultaneously`);

        let solvedFlags = [];
        try {
            solvedFlags = await Promise.all(
                pendingQs.map((q, i) => {
                    showStatus(`${alreadyAnswered + i + 1}/${qs.length}`, 'default');
                    return processQuestion(q, keys, models, true);
                })
            );

            const failedQs = pendingQs.filter((q, i) => !solvedFlags[i]);
            if (failedQs.length) {
                console.warn(`${DEBUG_PREFIX} Retrying failed questions`, failedQs.map(q => q.number));
                showStealthNotify(`Повтор ошибок: ${failedQs.length}`, 'warning', 2000);
                await sleep(3000);
                const retryFlags = await Promise.all(failedQs.map(q => processQuestion(q, keys, models, true)));
                let retryIdx = 0;
                solvedFlags = solvedFlags.map(ok => ok || retryFlags[retryIdx++]);
            }
        } finally {
            isProcessingBatch = false;
        }

        const solved = alreadyAnswered + solvedFlags.filter(Boolean).length;
        const failed = qs.length - solved;
        showStatus(`${solved}/${qs.length}`, failed === 0 ? 'green' : 'orange');
        showStealthNotify(`${I18N.t('notify.allSolved')}: ${solved}/${qs.length}` + (failed ? ` (${failed} ошибок, страница остановлена)` : ''), failed === 0 ? 'success' : 'error');
        hideStatus();
        return { total: qs.length, solved, failed, alreadyAnswered: false, allCached: pendingQs.every(q => q.cacheHit) };
    } else {
        let solved = alreadyAnswered;
        for (let i = 0; i < pendingQs.length; i++) {
            if (qs.length > 1) showStatus(`${i + 1}/${qs.length}`, 'default');
            if (await processQuestion(pendingQs[i], keys, models, false)) solved++;
        }
        if (qs.length > 1) showStealthNotify(`${I18N.t('notify.allSolved')}: ${qs.length}`, 'success');
        hideStatus();
        return { total: qs.length, solved, failed: qs.length - solved, alreadyAnswered: false, allCached: pendingQs.every(q => q.cacheHit) };
    }
}

function getNextPageButton() {
    const platonusNext = document.querySelector('#navigation button[data-testid="change-question-next"], #navigation button[ng-click="vm.nextQuestion()"]');
    if (platonusNext) return platonusNext.disabled ? null : platonusNext;

    const current = document.querySelector('input.submitButton.current[onclick*="AttemptPage|page="]');
    const container = current?.closest('.buttons');
    if (!container) return null;

    const buttons = container.querySelectorAll('input.submitButton[onclick*="AttemptPage|page="]');
    for (const btn of buttons) {
        if (btn.classList.contains('current')) {
            continue;
        }
        if (current.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) return btn;
    }
    return null;
}

function getFinishButton() {
    return document.querySelector('#questionBlock button[data-testid="change-question-show-complete-dialog"], #questionBlock button[ng-click="vm.showCompleteDialog()"], input.submitButton[onclick*="AttemptFinish"], input.submitButton[value="Завершить"]');
}

function getPlatonusQuestionState() {
    const wrapper = document.querySelector('#questionBlock .question-wrapper');
    const inputs = Array.from(document.querySelectorAll('#questionBlock .table-question input'));
    return {
        value: document.querySelector('#navigation #question-select')?.value,
        content: JSON.stringify([wrapper?.innerText.trim(), inputs.map(input => [input.name, input.id, input.value])])
    };
}

async function waitForPlatonusQuestion(previousState, maxWaitMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        const current = getPlatonusQuestionState();
        const loading = document.querySelector('#navigation .loading');
        const ready = !loading || loading.classList.contains('ng-hide') || getComputedStyle(loading).display === 'none';
        if (ready && current.value !== previousState.value && current.content !== previousState.content && extractQuestions().length) return true;
        await sleep(100);
    }
    return false;
}

async function waitForPlatonusAnswer(maxWaitMs = 10000) {
    const questionId = extractQuestions().find(question => question.platform === 'platonus')?.questionId;
    if (!questionId) return false;
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        try {
            const state = await chrome.runtime.sendMessage({ action: 'get_platonus_questions', stateOnly: true });
            if (state?.error || state?.completed || state?.currentQuestionId !== questionId || state?.currentSaveError) return false;
            if (state.currentSaved) return true;
        } catch (error) {
            console.warn(`${DEBUG_PREFIX} Cannot verify Platonus answer save:`, error.message);
            return false;
        }
        if (!await checkEnabled()) return false;
        await sleep(100);
    }
    return false;
}

function scheduleAttemptViewOpen() {
    if (!location.pathname.includes('AttemptResult')) return;
    const viewLink = Array.from(document.querySelectorAll('a[href*="AttemptView"]'))
        .find(link => link.innerText.trim().includes('Просмотр') || link.classList.contains('val'));
    if (!viewLink) return;

    console.log(`${DEBUG_PREFIX} AttemptResult detected, opening AttemptView in 5s for cache sync`, { href: viewLink.href });
    showStealthNotify('Открою просмотр для кеша через 5 сек...', 'info', 3000);
    setTimeout(() => {
        window.location.href = viewLink.href;
    }, 5000);
}

function clickConfirmDialog() {
    const okBtn = document.querySelector('#as-okButton, .as-okButton, .swal2-container .swal2-confirm:not([disabled])');
    if (okBtn) {
        console.log(`${DEBUG_PREFIX} Clicking confirm dialog button`);
        okBtn.click();
        return true;
    }
    return false;
}

async function waitAndConfirmDialog(maxWaitMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
        if (clickConfirmDialog()) return true;
        await sleep(250);
    }
    console.warn(`${DEBUG_PREFIX} Confirm dialog button not found`);
    return false;
}

async function finishTest() {
    console.log(`${DEBUG_PREFIX} Finishing test`);
    let finishBtn = getFinishButton();
    const started = Date.now();
    while (finishBtn?.disabled && Date.now() - started < 8000) {
        await sleep(250);
        finishBtn = getFinishButton();
    }
    if (!finishBtn || finishBtn.disabled) {
        console.warn(`${DEBUG_PREFIX} Finish button not found`);
        showStealthNotify('Завершение недоступно: проверь сохранение ответов', 'error');
        return;
    }
    if (!await checkEnabled()) return;
    await chrome.storage.local.set({ autoSolvePending: false });
    finishBtn.click();
    const confirmed = await waitAndConfirmDialog();
    showStealthNotify(confirmed ? 'Тест завершён' : 'Подтверждение не найдено', confirmed ? 'success' : 'error');
}

async function solveAndNext() {
    if (isAutoAdvancing || isProcessingBatch || isProcessingSingle) {
        console.warn(`${DEBUG_PREFIX} solveAndNext: already in progress`);
        return;
    }
    isAutoAdvancing = true;
    try {
        while (await checkEnabled()) {
            const summary = await start();
            if (!summary?.total) return;
            if (summary.failed > 0) {
                console.warn(`${DEBUG_PREFIX} solveAndNext stopped: unresolved questions`, summary);
                showStealthNotify(`Остались ошибки: ${summary.failed}. Не перехожу дальше.`, 'error', 3000);
                return;
            }

            const platonus = !!document.querySelector('#navigation #question-select');
            if (platonus && !await waitForPlatonusAnswer()) {
                showStealthNotify('Platonus не подтвердил сохранение ответа. Автопереход остановлен.', 'error', 3500);
                return;
            }
            const fastTransition = summary.alreadyAnswered || summary.allCached;
            const nextBtn = getNextPageButton();
            if (nextBtn) {
                console.log(`${DEBUG_PREFIX} solveAndNext: clicking next page button`, { value: nextBtn.value });
                if (!platonus) await chrome.storage.local.set({ autoSolvePending: true });
                showStealthNotify('Следующая страница...', 'info', fastTransition ? 500 : 1500);
                const previousState = platonus ? getPlatonusQuestionState() : null;
                await sleep(fastTransition ? 100 : 1500);
                if (!await checkEnabled()) return;
                if (platonus) {
                    const currentState = getPlatonusQuestionState();
                    if (currentState.value !== previousState.value || currentState.content !== previousState.content) return;
                }
                nextBtn.click();
                if (!platonus) return;
                if (!await waitForPlatonusQuestion(previousState)) {
                    showStealthNotify('Следующий вопрос не загрузился. Автопереход остановлен.', 'error', 3000);
                    return;
                }
                continue;
            }

            if (getFinishButton()) {
                showStealthNotify('Последняя страница, завершаю...', 'info', fastTransition ? 500 : 2000);
                await sleep(fastTransition ? 100 : 2000);
                await finishTest();
            } else {
                showStealthNotify('Это последняя страница', 'warning');
            }
            return;
        }
    } finally {
        isAutoAdvancing = false;
    }
}

async function init() {
    if (!await checkEnabled()) return;
    await I18N.init();

    if (window.top !== window) return;

    unlockSite();

    if (location.pathname.includes('AttemptView') || location.pathname.includes('AttemptResult')) {
        cacheFromAttemptView();
        scheduleAttemptViewOpen();
    }

    const autoSolve = await chrome.storage.local.get(['autoSolvePending']);
    if (autoSolve.autoSolvePending) {
        await chrome.storage.local.remove('autoSolvePending');
        console.log(`${DEBUG_PREFIX} Auto-solve triggered after page navigation`);
        showStealthNotify('Авто-решение...', 'info', 2000);
        await sleep(1000);
        await solveAndNext();
    }

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === HOTKEY_CODE) { e.preventDefault(); start(); }
        if (e.altKey && e.code === HOTKEY_NEXT_PAGE) { e.preventDefault(); solveAndNext(); }
    }, true);

    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const el = e.target.closest('.que, .question-wrapper, table.question');
            if (el) {
                e.preventDefault(); e.stopPropagation();
                const storage = await chrome.storage.sync.get(['cfgProModels', 'cfgFastMode']);
                const local = await chrome.storage.local.get(['geminiApiKeys']);
                const models = await getModels(storage.cfgProModels);
                const keys = local.geminiApiKeys || [];
                console.log(`${DEBUG_PREFIX} Alt-click solve`, { proModels: !!storage.cfgProModels, models, keysCount: keys.length });
                const qs = extractQuestions();
                await preparePlatonusPrefetch(qs, keys, models, storage.cfgProModels && storage.cfgFastMode && keys.length > 0);
                const q = qs.find(x => x.domElement === el);
                if (q && keys.length) processQuestion(q, keys, models);
            }
        }
    }, true);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.isEnabled) {
            isExtensionEnabled = changes.isEnabled.newValue !== false;
            if (!isExtensionEnabled) cleanupAIElements();
        }
        if ((area === 'sync' && ['isEnabled', 'cfgProModels', 'cfgFastMode'].some(key => changes[key]?.newValue === false)) || (area === 'local' && changes.geminiApiKeys)) {
            platonusPrefetchEpoch++;
            platonusPrefetch?.queue.stop();
            platonusPrefetch = null;
        }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
