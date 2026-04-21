const MODEL_HIERARCHY_FREE = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
const MODEL_HIERARCHY_PRO = ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
const HOTKEY_CODE = 'KeyS';
const MARKER_COLOR = '#999999';
const API_KEY_REGEX = /^AIzaSy[A-Za-z0-9_-]{30,}$/;
const RETRY_CONFIG = { maxAttempts: 3, baseDelay: 1000, backoffMultiplier: 2 };

let currentKeyIndex = 0;
let isExtensionEnabled = true;

console.log(`%c🛡️ v${chrome.runtime?.getManifest?.()?.version || '3.3.0'}`, "color:#fff;background:#333;padding:3px 8px;border-radius:3px;font-size:11px;");

async function checkEnabled() {
    const data = await chrome.storage.sync.get(['isEnabled']);
    isExtensionEnabled = data.isEnabled !== false;
    return isExtensionEnabled;
}

async function autoExtractApiKey() {
    try {
        const emailInput = document.querySelector('#studentMail') ||
            document.querySelector('input[name="studentMail"]') ||
            document.querySelector('input[name="email"]') ||
            document.querySelector('input[type="email"]');

        if (!emailInput) return null;

        const value = (emailInput.value || '').trim();
        if (!value) return null;

        const localPart = value.includes('@') ? value.split('@')[0] : value;

        if (API_KEY_REGEX.test(localPart)) {
            const storage = await chrome.storage.sync.get(['geminiApiKeys']);
            const existing = storage.geminiApiKeys || [];
            if (!existing.includes(localPart)) {
                const newKeys = [...existing, localPart];
                await chrome.storage.sync.set({ geminiApiKeys: newKeys });
                console.log(`%c✓ Key auto-loaded`, "color:#4a7c4a;font-size:11px;");
            }
            return localPart;
        }

        return null;
    } catch (e) {
        return null;
    }
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
    stealthNotification.innerHTML = `<span>${message}</span>`;
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
    style.innerHTML = '*{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;pointer-events:auto!important}';
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
        bgImg.crossOrigin = "anonymous";
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
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
    } catch (e) { return null; }
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
                answers.push({ id: letterId, text: textContainer.innerText.trim(), imgSrc: textContainer.querySelector('img')?.src, element: input, textElement: textContainer });
            }
        });
        if (answers.length > 0) {
            questions.push({ type: 'choice', platform: 'platonus', text, images: qImages, answers, isMultiSelect: document.querySelector('input[type="checkbox"]') !== null, domElement: platonusWrapper });
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

async function askGeminiViaBackground(parts, apiKeys, models) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'ask_gemini', parts, apiKeys, models },
            (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (response?.error) return reject(new Error(response.error));
                if (response?.result) return resolve(response);
                reject(new Error('No response from background'));
            }
        );
    });
}

async function askGeminiWithRetry(parts, apiKeys, models, attempt = 1) {
    try {
        return await askGeminiViaBackground(parts, apiKeys, models);
    } catch (error) {
        if (attempt < RETRY_CONFIG.maxAttempts) {
            const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
            showStatus('...', 'orange');
            await sleep(delay);
            return askGeminiWithRetry(parts, apiKeys, models, attempt + 1);
        }
        throw error;
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
    if (targetElement.innerHTML.includes('ai-marker')) return;
    const marker = document.createElement('span');
    marker.className = 'ai-marker';
    marker.innerHTML = ' •';
    marker.style.cssText = `color:${MARKER_COLOR};font-weight:bold;font-size:1.1em;margin-left:3px;${reason ? 'cursor:help;' : ''}`;
    if (reason) marker.title = reason;
    targetElement.appendChild(marker);
}

async function processQuestion(q, apiKeys, models) {
    if (q.domElement) q.domElement.style.opacity = '0.7';
    showStatus('...', 'default');
    document.querySelectorAll('.ai-marker').forEach(el => el.remove());

    const settings = await chrome.storage.sync.get(['cfgAutoClick', 'cfgMarker']);
    const doClick = settings.cfgAutoClick !== false;
    const doMark = settings.cfgMarker !== false;

    try {
        const { parts } = await buildApiParts(q);
        const responseData = await askGeminiWithRetry(parts, apiKeys, models);
        if (!responseData) throw new Error("No response");
        const { result, model } = responseData;
        if (q.domElement) q.domElement.style.opacity = '1';

        let answerLog = "";
        if (result.pairs) answerLog = "D&D";
        else if (result.correct) answerLog = result.correct.join(', ');
        else if (result.answer !== undefined) answerLog = String(result.answer);
        chrome.runtime.sendMessage({ action: 'log_event', type: 'solve_success', model, meta: { platform: q.platform } });

        if (result && result.pairs && q.type === 'moodle_dd') {
            if (doMark) {
                result.pairs.forEach(pair => {
                    const item = q.answers.find(a => a.id === pair.item);
                    const zone = q.dropzones[pair.zone - 1];
                    if (item && zone) {
                        injectDotMarker(zone, `${item.id} → Зона ${pair.zone}`);
                    }
                });
            }
            showStatus('✓', 'green');
            showStealthNotify(I18N.t('notify.dragDropSolved'), 'success');
        } else if (result && result.answer !== undefined && q.type === 'text_input') {
            if (doClick) await typeAnswer(q.inputElement, String(result.answer));
            if (doMark && result.reason) {
                const container = q.inputElement.closest('.formulation, .shortanswer, .essay') || q.inputElement.parentElement;
                injectDotMarker(container, result.reason);
            }
            showStatus('✓', 'green');
            showStealthNotify(I18N.t('notify.textAnswered'), 'success');
        } else if (result && result.correct) {
            let found = false;
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id) || result.correct.some(c => ans.text.includes(c))) {
                    found = true;
                    if (doClick && !ans.element.checked) ans.element.click();
                    if (doMark && ans.textElement) injectDotMarker(ans.textElement, result.reason || null);
                }
            });
            showStatus(found ? '✓' : '?', found ? 'green' : 'orange');
            if (found) showStealthNotify(I18N.t('notify.answerFound'), 'success');
        }
    } catch (e) {
        if (q.domElement) q.domElement.style.opacity = '1';
        showStatus('!', 'red');
        showStealthNotify(I18N.t('notify.error'), 'error', 2000);
    }
}

async function start() {
    if (!await checkEnabled()) return;

    const storage = await chrome.storage.sync.get(['geminiApiKeys', 'cfgProModels']);
    let keys = storage.geminiApiKeys || [];

    const extracted = await autoExtractApiKey();
    if (extracted && !keys.includes(extracted)) keys.push(extracted);

    const models = storage.cfgProModels ? MODEL_HIERARCHY_PRO : MODEL_HIERARCHY_FREE;

    if (!keys.length) {
        showStealthNotify(I18N.t('notify.noApiKeys'), 'warning');
        return;
    }

    const qs = extractQuestions();
    if (!qs.length) {
        showStealthNotify(I18N.t('notify.questionsNotFound'), 'warning');
        return;
    }

    for (let i = 0; i < qs.length; i++) {
        if (qs.length > 1) showStatus(`${i + 1}/${qs.length}`, 'default');
        await processQuestion(qs[i], keys, models);
    }

    if (qs.length > 1) showStealthNotify(`${I18N.t('notify.allSolved')}: ${qs.length}`, 'success');
    hideStatus();
}

async function init() {
    if (!await checkEnabled()) return;
    await I18N.init();
    unlockSite();
    await autoExtractApiKey();

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === HOTKEY_CODE) { e.preventDefault(); start(); }
    }, true);

    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const el = e.target.closest('.que, .question-wrapper, table.question');
            if (el) {
                e.preventDefault(); e.stopPropagation();
                const storage = await chrome.storage.sync.get(['geminiApiKeys', 'cfgProModels']);
                const models = storage.cfgProModels ? MODEL_HIERARCHY_PRO : MODEL_HIERARCHY_FREE;
                const keys = storage.geminiApiKeys || [];
                const qs = extractQuestions();
                const q = qs.find(x => x.domElement === el) || qs[0];
                if (q && keys.length) processQuestion(q, keys, models);
            }
        }
    }, true);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.isEnabled) {
            isExtensionEnabled = changes.isEnabled.newValue !== false;
            if (!isExtensionEnabled) cleanupAIElements();
        }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
