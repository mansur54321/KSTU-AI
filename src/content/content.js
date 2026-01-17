// ============================================================================
// AI SOLVER v5.0 (Stealth + Retry + i18n)
// ============================================================================

const MODEL_HIERARCHY = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash'
];

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const HOTKEY_CODE = 'KeyS';
const MARKER_COLOR = '#888888';

// Retry config
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000,
    backoffMultiplier: 2
};

let currentKeyIndex = 0;
let isExtensionEnabled = true;

console.log(`%c🚀 AI Solver v5.1: STEALTH MODE`, "color: #fff; background: #000; padding: 5px; font-weight: bold;");

// ============================================================================
// 0. INITIALIZATION CHECK
// ============================================================================
async function checkEnabled() {
    const data = await chrome.storage.sync.get(['isEnabled']);
    isExtensionEnabled = data.isEnabled !== false;
    return isExtensionEnabled;
}

// ============================================================================
// 1. STEALTH NOTIFICATION SYSTEM (Mimics browser toast)
// ============================================================================
let stealthNotification = null;

function showStealthNotify(message, type = 'info', duration = 3000) {
    if (stealthNotification) {
        stealthNotification.remove();
    }

    // Stealth style: looks like a system notification
    const colors = {
        info: { bg: 'rgba(50, 50, 50, 0.95)', border: '#555' },
        success: { bg: 'rgba(40, 60, 40, 0.95)', border: '#4a7c4a' },
        error: { bg: 'rgba(60, 40, 40, 0.95)', border: '#7c4a4a' },
        warning: { bg: 'rgba(60, 55, 35, 0.95)', border: '#7c6a3a' }
    };

    const style = colors[type] || colors.info;

    stealthNotification = document.createElement('div');
    stealthNotification.className = 'ai-stealth-notify';
    stealthNotification.innerHTML = `<span>${message}</span>`;
    stealthNotification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${style.bg};
        color: #e0e0e0;
        padding: 12px 18px;
        border-radius: 8px;
        border-left: 3px solid ${style.border};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        z-index: 2147483647;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        pointer-events: none;
        max-width: 280px;
    `;

    document.body.appendChild(stealthNotification);

    // Animate in
    requestAnimationFrame(() => {
        stealthNotification.style.opacity = '1';
        stealthNotification.style.transform = 'translateY(0)';
    });

    // Auto-hide
    setTimeout(() => {
        if (stealthNotification) {
            stealthNotification.style.opacity = '0';
            stealthNotification.style.transform = 'translateY(20px)';
            setTimeout(() => stealthNotification?.remove(), 300);
        }
    }, duration);
}

// ============================================================================
// 2. DATA EXTRACTORS
// ============================================================================
function getStudentName() {
    try {
        const moodleName = document.querySelector('.userbutton .usertext') ||
            document.querySelector('.logininfo a') ||
            document.querySelector('.userinitials');
        if (moodleName) return moodleName.innerText.trim();

        const platonusName = document.querySelector('.dropdown-user .fw-semibold') ||
            document.querySelector('.user-info .name');
        if (platonusName) return platonusName.innerText.trim();

        const univerName = document.querySelector('.username') || document.querySelector('#username_logged_in');
        if (univerName) return univerName.innerText.trim();
    } catch (e) { }
    return "Аноним";
}

// ============================================================================
// 3. UI HELPERS
// ============================================================================
let statusIndicator = null;
let solutionPanel = null;

function showStatus(msg, color = '#333') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.className = 'ai-status-indicator';
        statusIndicator.style.cssText = `
            position: fixed; bottom: 10px; right: 10px;
            font-family: -apple-system, sans-serif; font-size: 12px; font-weight: 500;
            color: #fff; background: #333;
            padding: 8px 14px; border-radius: 6px;
            pointer-events: none; z-index: 2147483647; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0.9;
        `;
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.innerText = msg;
    statusIndicator.style.backgroundColor = color === 'red' ? '#d32f2f' : (color === 'orange' ? '#f57c00' : '#333');
    statusIndicator.style.display = 'block';
}

function showSolutionPanel(lines) {
    if (solutionPanel) solutionPanel.remove();
    solutionPanel = document.createElement('div');
    solutionPanel.className = 'ai-solution-panel';
    solutionPanel.style.cssText = `
        position: fixed; top: 80px; right: 20px; width: 220px;
        background: rgba(255, 255, 255, 0.95); border: 2px solid #2e7d32;
        border-radius: 8px; padding: 15px; z-index: 999999;
        font-family: sans-serif; font-size: 13px; color: #333;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    `;

    const header = document.createElement('div');
    header.style.cssText = "display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;";
    header.innerHTML = `<b>AI Ответ:</b><span style="cursor:pointer; font-weight:bold;">×</span>`;
    header.querySelector('span:last-child').onclick = () => solutionPanel.remove();
    solutionPanel.appendChild(header);

    lines.forEach(line => {
        const row = document.createElement('div');
        row.innerHTML = line;
        row.style.marginBottom = "6px";
        solutionPanel.appendChild(row);
    });
    document.body.appendChild(solutionPanel);
}

function hideStatus() {
    if (statusIndicator) setTimeout(() => statusIndicator.style.display = 'none', 3000);
}

function unlockSite() {
    const style = document.createElement('style');
    style.id = 'ai-unlock-style';
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    if (!document.getElementById('ai-unlock-style')) document.head.appendChild(style);

    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup'].forEach(evt => {
        window.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
    });
}

// ============================================================================
// 4. DOM CLEANUP
// ============================================================================
function cleanupAIElements() {
    document.querySelectorAll('.ai-stealth-badge, .ai-marker, .ai-solution-panel, .ai-status-indicator, .ai-stealth-notify').forEach(el => el.remove());
}

// Cleanup on navigation (SPA support)
window.addEventListener('beforeunload', cleanupAIElements);

// MutationObserver for SPA navigation detection
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanupAIElements();
    }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// ============================================================================
// 5. IMAGE PROCESSING
// ============================================================================
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
        if (!validMime || validMime === 'application/octet-stream') {
            validMime = 'image/jpeg';
        }

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ inline_data: { mime_type: validMime, data: reader.result.split(',')[1] } });
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
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
    } catch (e) {
        return null;
    }
}

// ============================================================================
// 6. PARSERS
// ============================================================================
function extractQuestions() {
    const questions = [];

    // --- A. MOODLE (Universal) ---
    const moodleQuestions = document.querySelectorAll('.que');
    if (moodleQuestions.length > 0) {
        moodleQuestions.forEach((el, i) => {
            if (el.classList.contains('description')) return;

            const textEl = el.querySelector('.qtext');
            const bgImg = el.querySelector('.dropbackground');
            const dropzones = Array.from(el.querySelectorAll('.dropzone'));
            const answers = [];

            // Drag & Drop
            if (bgImg && dropzones.length > 0) {
                const seen = new Set();
                el.querySelectorAll('.draghome:not(.dragplaceholder)').forEach(d => {
                    let imgSrc = d.tagName === 'IMG' ? d.src : d.querySelector('img')?.src;
                    let text = d.innerText.trim();
                    const contentKey = text + (imgSrc || "");
                    if (!seen.has(contentKey) && (text || imgSrc)) {
                        seen.add(contentKey);
                        answers.push({
                            id: String.fromCharCode(65 + answers.length),
                            text: text,
                            imgSrc: imgSrc,
                            element: d
                        });
                    }
                });
                questions.push({
                    type: 'moodle_dd',
                    platform: 'moodle',
                    number: i + 1,
                    text: textEl ? textEl.innerText.trim() : "D&D Task",
                    bgImgElement: bgImg,
                    dropzones: dropzones,
                    answers: answers,
                    domElement: el
                });
            }
            // Regular Choice
            else {
                const options = el.querySelectorAll('.answer div, .answer li, table.answer tr');
                options.forEach((opt, idx) => {
                    const label = opt.querySelector('label');
                    const input = opt.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input || label) {
                        const txt = opt.innerText.trim();
                        const img = opt.querySelector('img')?.src;
                        const targetEl = input || label || opt;
                        answers.push({
                            id: String.fromCharCode(65 + idx),
                            text: txt,
                            imgSrc: img,
                            element: targetEl,
                            textElement: opt
                        });
                    }
                });

                if (answers.length > 0) {
                    questions.push({
                        type: 'choice',
                        platform: 'moodle',
                        number: i + 1,
                        text: textEl ? textEl.innerText.trim() : "Question",
                        images: [],
                        answers: answers,
                        isMultiSelect: el.classList.contains('multichoice'),
                        domElement: el
                    });
                }
            }
        });
        return questions;
    }

    // --- B. PLATONUS ---
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
                answers.push({
                    id: letterId,
                    text: textContainer.innerText.trim(),
                    imgSrc: textContainer.querySelector('img')?.src,
                    element: input,
                    textElement: textContainer
                });
            }
        });

        if (answers.length > 0) {
            questions.push({
                type: 'choice',
                platform: 'platonus',
                text: text,
                images: qImages,
                answers: answers,
                isMultiSelect: document.querySelector('input[type="checkbox"]') !== null,
                domElement: platonusWrapper
            });
        }
    }

    // --- C. UNIVER ---
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
                        answers.push({
                            id: label.innerText.replace('.', '').trim(),
                            text: textDiv ? textDiv.innerText.trim() : '',
                            imgSrc: textDiv?.querySelector('img')?.src,
                            element: input,
                            textElement: label
                        });
                    }
                });
                if (answers.length > 0) {
                    questions.push({
                        type: 'choice',
                        platform: 'univer',
                        number: i + 1,
                        text: textElem ? textElem.innerText.trim() : "Q",
                        images: qImages,
                        answers: answers,
                        isMultiSelect: answerTable.dataset.qtype === '2',
                        domElement: table
                    });
                }
            }
        });
    }

    return questions;
}

// ============================================================================
// 7. API CLIENT WITH RETRY & EXPONENTIAL BACKOFF
// ============================================================================
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function askGeminiWithRetry(q, apiKeys, attempt = 1) {
    try {
        return await askGemini(q, apiKeys);
    } catch (error) {
        if (attempt < RETRY_CONFIG.maxAttempts) {
            const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
            console.log(`⏳ Retry attempt ${attempt + 1} in ${delay}ms...`);
            showStatus(`Повтор ${attempt + 1}...`, 'orange');
            await sleep(delay);
            return askGeminiWithRetry(q, apiKeys, attempt + 1);
        }
        throw error;
    }
}

async function askGemini(q, apiKeys) {
    const parts = [];
    let imgCount = 0;

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

        parts.push({
            text: `Task: Drag & Drop.\n
            The image has red numbered ZONES (1, 2, 3...).\n
            Match ITEMS (A, B, C...) to these ZONES.\n
            Items list:\n${itemsText}\n
            Return STRICT JSON: {"pairs": [{"zone": 1, "item": "A"}, {"zone": 2, "item": "B"}]}`
        });
    } else {
        if (q.images) {
            for (const url of q.images) {
                const p = await processImageSource(url);
                if (p) { parts.push(p); imgCount++; }
            }
        }
        let optionsText = "";
        for (const ans of q.answers) {
            let line = `${ans.id}. ${ans.text}`;
            if (ans.imgSrc) {
                const p = await processImageSource(ans.imgSrc);
                if (p) { parts.push(p); imgCount++; line += " [Image Attached]"; }
            }
            optionsText += line + "\n";
        }
        parts.push({
            text: `Question: ${q.text}\nOptions:\n${optionsText}\nReturn JSON: {"correct": ["A"], "reason": "short"}`
        });
    }

    console.groupCollapsed(`🚀 Sending Request (Images: ${imgCount})`);
    console.log("Prompt:", parts[parts.length - 1].text);
    console.groupEnd();

    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
    };

    let lastError = null;
    let rateLimitHit = false;

    for (const model of MODEL_HIERARCHY) {
        for (let i = 0; i < apiKeys.length; i++) {
            const keyIndex = (currentKeyIndex + i) % apiKeys.length;
            try {
                console.log(`📡 Trying ${model}...`);
                const res = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKeys[keyIndex]}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (res.status === 429 || res.status === 503) {
                    rateLimitHit = true;
                    console.warn(`⚠️ Rate limit/overload on ${model}, trying next...`);
                    continue;
                }

                if (!res.ok) {
                    lastError = await res.text();
                    throw new Error(lastError);
                }

                const data = await res.json();
                currentKeyIndex = keyIndex;
                const resultText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
                const json = JSON.parse(resultText);
                console.log("✅ Success:", json);

                return { result: json, model: model };

            } catch (e) {
                lastError = e;
                console.error("API Error:", e);
            }
        }
    }

    // Log rate limit if all failed due to it
    if (rateLimitHit) {
        chrome.runtime.sendMessage({
            action: 'log_event',
            type: 'rate_limit',
            model: 'all',
            meta: { keys_tried: apiKeys.length }
        });
        showStealthNotify('Лимит запросов - подождите', 'warning', 4000);
    }

    throw new Error(lastError?.message || 'All models failed');
}

// ============================================================================
// 8. VISUALIZATION & LOGIC
// ============================================================================

function createStealthBadge(targetElement, text, color) {
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.top < 0) return;

    const badge = document.createElement('div');
    badge.innerText = text;
    badge.className = 'ai-stealth-badge';
    badge.style.cssText = `
        position: absolute;
        top: ${window.scrollY + rect.top - 8}px;
        left: ${window.scrollX + rect.left}px;
        background: rgba(255, 255, 255, 0.85); 
        color: ${color};
        font-family: sans-serif; font-size: 10px; font-weight: bold;
        padding: 1px 4px; border-radius: 3px;
        border: 1px solid #ccc;
        z-index: 2147483647; pointer-events: none;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        white-space: nowrap;
    `;
    document.body.appendChild(badge);
}

function injectInlineMarker(targetElement, text) {
    if (!targetElement) return;
    if (targetElement.innerHTML.includes('ai-marker')) return;
    const marker = document.createElement('span');
    marker.className = 'ai-marker';
    marker.innerHTML = ` ${text}`;
    marker.style.cssText = `color: ${MARKER_COLOR}; font-weight: bold; font-size: 1.4em; margin-left: 5px;`;
    targetElement.appendChild(marker);
}

async function processQuestion(q, apiKeys) {
    if (q.domElement) q.domElement.style.opacity = '0.6';
    showStatus("Думаю...");

    document.querySelectorAll('.ai-stealth-badge').forEach(el => el.remove());
    document.querySelectorAll('.ai-marker').forEach(el => el.remove());
    if (solutionPanel) solutionPanel.remove();

    const settings = await chrome.storage.sync.get(['cfgAutoClick', 'cfgMarker']);
    const doClick = settings.cfgAutoClick !== false;
    const doMark = settings.cfgMarker !== false;

    try {
        const responseData = await askGeminiWithRetry(q, apiKeys);

        if (!responseData) throw new Error("No response");
        const { result, model } = responseData;

        if (q.domElement) q.domElement.style.opacity = '1';

        // --- STATS ---
        let answerLog = "";
        if (result.pairs) answerLog = "Drag & Drop Solution";
        else if (result.correct) answerLog = result.correct.join(', ');

        chrome.runtime.sendMessage({
            action: 'log_event',
            type: 'solve_success',
            model: model,
            meta: {
                student: getStudentName(),
                platform: q.platform,
                question: q.text.substring(0, 150),
                answer_ai: answerLog,
                has_images: (q.images?.length > 0 || q.type === 'moodle_dd')
            }
        });

        // --- MOODLE D&D ---
        if (result && result.pairs && q.type === 'moodle_dd') {
            const solutionLines = [];
            if (doMark) {
                q.answers.forEach(ans => createStealthBadge(ans.element, `(${ans.id})`, '#555'));
                result.pairs.forEach(pair => {
                    const item = q.answers.find(a => a.id === pair.item);
                    const zone = q.dropzones[pair.zone - 1];
                    if (item && zone) {
                        createStealthBadge(zone, `→ ${item.id}`, '#2e7d32');
                        let desc = item.text || (item.imgSrc ? "[Img]" : "???");
                        if (desc.length > 20) desc = desc.substring(0, 17) + "..";
                        solutionLines.push(`<b>Зона ${pair.zone}</b> ➜ <b>${item.id}</b> <span style="color:#888">${desc}</span>`);
                    }
                });
                showStatus("Проверь!", "#2e7d32");
                showSolutionPanel(solutionLines);
            }
            showStealthNotify('Drag & Drop решён', 'success');
        }

        // --- CHOICE ---
        else if (result && result.correct) {
            let found = false;
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id) || result.correct.some(c => ans.text.includes(c))) {
                    found = true;
                    if (doClick && !ans.element.checked) {
                        ans.element.click();
                        console.log(`🖱️ Clicked ${ans.id}`);
                    }
                    if (doMark) {
                        if (q.platform === 'moodle') {
                            createStealthBadge(ans.element, `✓`, '#2e7d32');
                        } else {
                            if (ans.textElement) injectInlineMarker(ans.textElement, '•');
                        }
                    }
                }
            });
            showStatus(found ? "Готово" : "Проверь", found ? "#2e7d32" : "orange");
            if (found) showStealthNotify('Ответ найден', 'success');
        }
    } catch (e) {
        if (q.domElement) q.domElement.style.opacity = '1';
        console.error(e);
        showStatus("Ошибка", "red");
        showStealthNotify('Ошибка: ' + (e.message || 'неизвестная'), 'error');
    }
}

async function start() {
    // Check if enabled
    if (!await checkEnabled()) {
        console.log('🔴 AI Solver is disabled');
        return;
    }

    const storage = await chrome.storage.sync.get(['geminiApiKeys']);
    const keys = storage.geminiApiKeys || [];
    if (!keys.length) {
        showStealthNotify('API ключи не настроены', 'warning');
        return showStatus("Нет ключей", "red");
    }

    const qs = extractQuestions();
    if (!qs.length) {
        showStealthNotify('Вопросы не найдены', 'warning');
        return showStatus("Нет вопросов", "orange");
    }

    for (const q of qs) await processQuestion(q, keys);

    if (qs.length > 1) {
        showStealthNotify(`Решено ${qs.length} вопросов`, 'success');
    }
    hideStatus();
}

async function init() {
    // Check if enabled before doing anything
    if (!await checkEnabled()) {
        console.log('🔴 AI Solver is disabled, skipping init');
        return;
    }

    unlockSite();

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === HOTKEY_CODE) {
            e.preventDefault();
            start();
        }
    }, true);

    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const el = e.target.closest('.que, .question-wrapper, table.question');
            if (el) {
                e.preventDefault();
                e.stopPropagation();
                const storage = await chrome.storage.sync.get(['geminiApiKeys']);
                const qs = extractQuestions();
                const q = qs.find(x => x.domElement === el) || qs[0];
                if (q && storage.geminiApiKeys) processQuestion(q, storage.geminiApiKeys);
            }
        }
    }, true);

    // Listen for enable/disable changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.isEnabled) {
            isExtensionEnabled = changes.isEnabled.newValue !== false;
            if (!isExtensionEnabled) {
                cleanupAIElements();
            }
        }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
