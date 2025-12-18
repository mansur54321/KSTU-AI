// ============================================================================
// AI SOLVER v4.3 (Stealth + Debug Mode)
// ============================================================================

const MODEL_HIERARCHY = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash'
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';
const MARKER_COLOR = '#666';

let currentKeyIndex = 0;

console.log(`%c🚀 AI Solver v4.3: DEBUG ENABLED`, "color: #fff; background: #d32f2f; padding: 5px; font-weight: bold;");

// ============================================================================
// 1. UI & HELPERS
// ============================================================================
let statusIndicator = null;
let solutionPanel = null;

function showStatus(msg, color = '#333') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: fixed; bottom: 10px; right: 10px;
            font-family: sans-serif; font-size: 11px;
            color: #444; background: rgba(255,255,255,0.9);
            padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px;
            pointer-events: none; z-index: 2147483647;
        `;
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.innerText = msg;
    statusIndicator.style.display = 'block';
}

function showSolutionPanel(lines) {
    if (solutionPanel) solutionPanel.remove();
    solutionPanel = document.createElement('div');
    solutionPanel.style.cssText = `
        position: fixed; top: 60px; right: 20px; width: 200px;
        background: rgba(255, 255, 255, 0.95); border: 1px solid #ccc;
        border-radius: 6px; padding: 10px; z-index: 999999;
        font-family: sans-serif; font-size: 11px; color: #333;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-height: 80vh; overflow-y: auto;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = "display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:5px;";
    header.innerHTML = `<b>AI Решение:</b><span style="cursor:pointer; font-weight:bold;">×</span>`;
    header.querySelector('span').onclick = () => solutionPanel.remove();
    solutionPanel.appendChild(header);

    lines.forEach(line => {
        const row = document.createElement('div');
        row.innerHTML = line;
        row.style.marginBottom = "3px";
        row.style.borderBottom = "1px dotted #eee";
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
// 2. IMAGE PROCESSING
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
        console.warn("Image load failed:", url);
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
        console.warn("Canvas error:", e);
        return null;
    }
}

// ============================================================================
// 3. PARSERS
// ============================================================================
function extractQuestions() {
    const questions = [];

    // --- MOODLE ---
    const moodleDD = document.querySelectorAll('.que.ddimageortext, .que.ddwtos');
    moodleDD.forEach((el, i) => {
        const textEl = el.querySelector('.qtext');
        const bgImg = el.querySelector('.dropbackground');
        const dropzones = Array.from(el.querySelectorAll('.dropzone'));
        const draggables = [];
        const seen = new Set();
        
        el.querySelectorAll('.draghome:not(.dragplaceholder)').forEach(d => {
            let imgSrc = d.tagName === 'IMG' ? d.src : d.querySelector('img')?.src;
            let text = d.innerText.trim();
            const contentKey = text + (imgSrc || "");
            
            if (!seen.has(contentKey) && (text || imgSrc)) {
                seen.add(contentKey);
                draggables.push({
                    id: String.fromCharCode(65 + draggables.length),
                    text: text,
                    imgSrc: imgSrc,
                    element: d
                });
            }
        });

        if (bgImg && dropzones.length > 0) {
            questions.push({
                type: 'moodle_dd',
                number: i + 1,
                text: textEl ? textEl.innerText.trim() : "Task",
                bgImgElement: bgImg,
                dropzones: dropzones,
                answers: draggables,
                domElement: el
            });
        }
    });

    // --- PLATONUS / UNIVER (Fallback) ---
    if (questions.length === 0) {
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
                            text: textElem ? textElem.innerText.trim() : "Q",
                            images: qImages,
                            answers: answers,
                            isMultiSelect: answerTable.dataset.qtype === '2',
                            domElement: table
                        });
                    }
                }
            });
        } else {
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
                            id: letterId, text: textContainer.innerText.trim(), imgSrc: textContainer.querySelector('img')?.src, element: input, textElement: textContainer
                        });
                    }
                });
                if(answers.length) questions.push({type:'choice', text, images:qImages, answers, domElement:platonusWrapper});
             }
        }
    }
    
    console.log(`🔎 Extracted ${questions.length} questions.`);
    return questions;
}

// ============================================================================
// 4. API CLIENT
// ============================================================================
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
                if (p) { parts.push(p); imgCount++; line += " [Image]"; }
            }
            itemsText += line + "\n";
        }
        parts.push({
            text: `Task: Drag & Drop. Red zones 1,2,3... on image. Match Items (A,B,C) to Zones.\nItems:\n${itemsText}\nReturn JSON: {"pairs": [{"zone": 1, "item": "A"}]}`
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
                if (p) { parts.push(p); imgCount++; line += " [Image]"; }
            }
            optionsText += line + "\n";
        }
        parts.push({
            text: `Question: ${q.text}\nOptions:\n${optionsText}\nReturn JSON: {"correct": ["A"], "reason": "short"}`
        });
    }

    // === DEBUG LOGS ===
    console.groupCollapsed(`🚀 Sending Request (Images: ${imgCount})`);
    console.log("MIME:", parts[0]?.inline_data?.mime_type || "N/A");
    console.log("Prompt:", parts[parts.length - 1].text);
    console.groupEnd();

    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
    };

    for (const model of MODEL_HIERARCHY) {
        for (let i = 0; i < apiKeys.length; i++) {
            const keyIndex = (currentKeyIndex + i) % apiKeys.length;
            try {
                console.log(`📡 Trying Model: ${model} | Key: ...${apiKeys[keyIndex].slice(-5)}`);
                const res = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKeys[keyIndex]}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (res.status === 429 || res.status === 503) {
                    console.warn(`⚠️ Busy/Quota: ${res.status}`);
                    continue;
                }
                if (!res.ok) throw new Error(await res.text());

                const data = await res.json();
                currentKeyIndex = keyIndex;
                
                console.log("📥 Raw AI Response:", data);
                const resultText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
                const json = JSON.parse(resultText);
                console.log("🧠 Parsed JSON:", json);
                
                return json;

            } catch (e) { console.error("❌ API Error:", e); }
        }
    }
    return null;
}

// ============================================================================
// 5. STEALTH MARKERS (FLOATING)
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

async function processQuestion(q, apiKeys) {
    if (q.domElement) q.domElement.style.opacity = '0.7';
    showStatus("Думаю...");

    document.querySelectorAll('.ai-stealth-badge').forEach(el => el.remove());
    if (solutionPanel) solutionPanel.remove();

    try {
        const result = await askGemini(q, apiKeys);
        if (q.domElement) q.domElement.style.opacity = '1';

        if (result && result.pairs && q.type === 'moodle_dd') {
            const solutionLines = [];

            // 1. Маркируем предметы (A, B, C...)
            q.answers.forEach(ans => {
                createStealthBadge(ans.element, `(${ans.id})`, '#555');
            });

            // 2. Маркируем зоны
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
            
            showStatus("Готово");
            showSolutionPanel(solutionLines);

        } else if (result && result.correct) {
            let found = false;
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id) || result.correct.some(c => ans.text.includes(c))) {
                    found = true;
                    if (!ans.element.checked) ans.element.click();
                    
                    if (ans.textElement && !ans.textElement.innerHTML.includes('&bull;')) {
                        const m = document.createElement('span');
                        m.innerHTML = '&bull;';
                        m.style.cssText = `color:${MARKER_COLOR}; margin-left:5px; font-size:16px;`;
                        ans.textElement.appendChild(m);
                    }
                }
            });
            showStatus(found ? "Ok" : "?");
        }
    } catch (e) {
        if (q.domElement) q.domElement.style.opacity = '1';
        showStatus("Error", "red");
        console.error(e);
    }
}

async function start() {
    const storage = await chrome.storage.sync.get(['geminiApiKeys']);
    const keys = storage.geminiApiKeys || [];
    if (!keys.length) return showStatus("No Key", "red");
    
    const qs = extractQuestions();
    if (!qs.length) return showStatus("No Qs", "orange");

    for (const q of qs) await processQuestion(q, keys);
    hideStatus();
}

function init() {
    unlockSite();
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.code === HOTKEY_CODE) { e.preventDefault(); start(); }
    }, true);
    
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const el = e.target.closest('.que, .question-wrapper, table.question');
            if (el) {
                e.preventDefault(); e.stopPropagation();
                const storage = await chrome.storage.sync.get(['geminiApiKeys']);
                const qs = extractQuestions();
                const q = qs.find(x => x.domElement === el) || qs[0];
                if (q && storage.geminiApiKeys) processQuestion(q, storage.geminiApiKeys);
            }
        }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
