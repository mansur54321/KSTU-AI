// --- CONFIG ---
const MODEL_HIERARCHY = [
    'gemini-2.5-pro',    // Основная
    'gemini-2.5-flash'   // Резервная
];

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini'];

const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       
const MARKER_COLOR = '#cccccc'; // Цвет точки

console.log(`%c🚀 AI Helper: Right-Aligned Markers`, "color: #fff; background: #009688; padding: 5px; font-weight: bold;");

// --- UI ---
let statusIndicator = null;
function showStatus(msg, color = '#666') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: fixed; bottom: 10px; right: 10px;
            font-family: monospace; font-size: 11px;
            color: #333; background: rgba(255,255,255,0.95);
            padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
            pointer-events: none; z-index: 99999; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.innerText = msg;
    statusIndicator.style.color = color;
    statusIndicator.style.display = 'block';
}
function hideStatus() { if (statusIndicator) setTimeout(() => { statusIndicator.style.display = 'none'; }, 4000); }

// --- UNLOCKER ---
function unlockSite() {
    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(evt => window.addEventListener(evt, (e) => { e.stopPropagation(); }, true));
    const style = document.createElement('style');
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    document.head.appendChild(style);
}

// --- IMAGE HELPER ---
async function processImageSource(url) {
  try {
    if (!url || url.startsWith('file://')) return null;
    let base64Data, mimeType;
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) return null;
        const meta = url.substring(0, commaIdx);
        mimeType = (meta.match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
        base64Data = url.substring(commaIdx + 1);
    } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Img Fetch Error');
        const blob = await response.blob();
        mimeType = blob.type;
        base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    }
    return { base64: base64Data, mime: mimeType };
  } catch (e) { return null; }
}

// --- PARSER ---
function parseQuestion(table, index) {
    const textElem = table.querySelector('.text');
    if (!textElem) return null;
    
    const qImages = [];
    textElem.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });

    const answerTable = table.nextElementSibling;
    if (!answerTable || !answerTable.classList.contains('answer')) return null;
    
    const answers = [];
    answerTable.querySelectorAll('tr').forEach(row => {
        const label = row.querySelector('.num');
        const textDiv = row.querySelector('.text');
        const input = row.querySelector('input');
        if (label && input) {
            let ansText = textDiv ? textDiv.innerText.trim() : '';
            let ansImgSrc = null;
            if (textDiv) { const img = textDiv.querySelector('img'); if (img) ansImgSrc = img.src; }

            answers.push({
                id: label.innerText.replace('.', '').trim(),
                text: ansText, imgSrc: ansImgSrc, element: input, textElement: textDiv
            });
        }
    });
    
    return {
        number: index + 1, 
        text: textElem.innerText.trim(),
        images: qImages, 
        answers: answers, 
        isMultiSelect: answerTable.dataset.qtype === '2',
        domElement: table
    };
}

function extractQuestions() {
    const questions = [];
    document.querySelectorAll('table.question').forEach((table, index) => {
        const q = parseQuestion(table, index);
        if (q) questions.push(q);
    });
    return questions;
}

// --- GEMINI ---
async function askGemini(question, apiKey) {
    const parts = [];
    for (const url of question.images) {
        const img = await processImageSource(url);
        if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    }
    let optionsText = "";
    let imgCounter = 0;
    for (const ans of question.answers) {
        optionsText += `${ans.id}. ${ans.text}`;
        if (ans.imgSrc) {
            const img = await processImageSource(ans.imgSrc);
            if (img) {
                parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
                imgCounter++;
                optionsText += ` [Image #${imgCounter}]`;
            }
        }
        optionsText += "\n";
    }
    const prompt = `Question: ${question.text}\nType: ${question.isMultiSelect ? 'Multi' : 'Single'}\nOptions:\n${optionsText}\nReturn JSON: {"correct": ["A"], "reason": "short explanation"}`;
    parts.unshift({ text: prompt });

    // Logging
    console.group(`❓ Q${question.number}`);
    console.log(`📝 Prompt:`, prompt);

    for (const model of MODEL_HIERARCHY) {
        try {
            console.log(`📡 Gemini (${model})...`);
            const response = await fetch(`${GEMINI_URL}${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: "application/json" } })
            });
            if (response.status === 429 || response.status === 503) {
                 console.warn(`⚠️ ${model} ${response.status}. Next...`); continue; 
            }
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            console.log(`✅ Result:`, result);
            console.groupEnd();
            return result;
        } catch (e) { console.error(e); }
    }
    console.groupEnd();
    return null;
}

// --- OPENAI ---
async function askOpenAI(question, apiKey) {
    const content = [];
    let optionsText = "";
    for (const ans of question.answers) {
        optionsText += `${ans.id}. ${ans.text}`;
        if(ans.imgSrc) optionsText += " [Image]";
        optionsText += "\n";
    }
    content.push({ type: "text", text: `Question: ${question.text}\nType: ${question.isMultiSelect ? 'Multi' : 'Single'}\nOptions:\n${optionsText}\nReturn JSON: {"correct": ["A"], "reason": "short explanation"}` });
    
    const allImageUrls = [...question.images, ...question.answers.map(a => a.imgSrc).filter(src => src)];
    for (const url of allImageUrls) {
        const img = await processImageSource(url);
        if (img) content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } });
    }

    console.group(`❓ Q${question.number} (OpenAI)`);
    for (const model of OPENAI_MODELS) {
        try {
            console.log(`📡 GPT (${model})...`);
            const response = await fetch(OPENAI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model: model, messages: [{ role: "user", content: content }], response_format: { type: "json_object" } })
            });
            if (response.status === 429) continue;
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            console.log(`✅ Result:`, result);
            console.groupEnd();
            return result;
        } catch (e) { console.error(e); }
    }
    console.groupEnd();
    return null;
}

// --- ROUTER ---
async function askAI(question) {
    const storage = await chrome.storage.sync.get(['aiProvider', 'geminiApiKey', 'openaiApiKey']);
    const provider = storage.aiProvider || 'gemini';
    
    if (provider === 'openai') {
        if (!storage.openaiApiKey) return alert('OpenAI Key missing');
        const res = await askOpenAI(question, storage.openaiApiKey);
        if (res) showStatus(`GPT Solved`, '#10a37f');
        return res;
    } else {
        if (!storage.geminiApiKey) return alert('Gemini Key missing');
        const res = await askGemini(question, storage.geminiApiKey);
        if (res) showStatus(`Gemini Solved`, '#2e7d32');
        return res;
    }
}

// --- PROCESSOR ---
async function processQuestion(q) {
    showStatus(`Thinking Q${q.number}...`, '#1976d2');
    q.domElement.style.opacity = '0.7';

    try {
        const result = await askAI(q);
        q.domElement.style.opacity = '1';

        if (result && result.correct.length > 0) {
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    // 1. Клик
                    if (!ans.element.checked) ans.element.click();
                    
                    // 2. МАРКЕР (ИСПРАВЛЕНО: ТЕПЕРЬ СПРАВА)
                    if (ans.textElement && !ans.textElement.innerHTML.includes('&bull;')) {
                        const m = document.createElement('span');
                        m.innerHTML = '&bull;'; 
                        m.style.color = MARKER_COLOR; 
                        
                        // --- СТИЛИ ДЛЯ ПОЗИЦИИ СПРАВА ---
                        m.style.float = 'right';      // Прижимаем вправо
                        m.style.marginLeft = '10px';  // Отступ от текста
                        m.style.fontSize = '18px';    // Чуть крупнее, чтобы было видно
                        m.style.cursor = 'help';
                        m.title = `AI: ${result.reason}`;
                        
                        // Вставляем В НАЧАЛО (prepend), чтобы float:right сработал корректно
                        // и точка улетела в правый угол ячейки на той же строке
                        if (ans.textElement.firstChild) {
                            ans.textElement.insertBefore(m, ans.textElement.firstChild);
                        } else {
                            ans.textElement.appendChild(m);
                        }
                    }
                }
            });
        }
    } catch (e) {
        q.domElement.style.opacity = '1';
        showStatus(`Error Q${q.number}`, 'red');
        console.error(e);
    }
}

async function solveAll() {
    const questions = extractQuestions();
    if (!questions.length) return;
    console.log('🚀 Start All');
    for (let i = 0; i < questions.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1000));
        await processQuestion(questions[i]);
    }
    showStatus('Done'); hideStatus();
}

// --- INIT ---
function init() {
    unlockSite();
    
    // Hotkey Alt+S
    window.addEventListener('keydown', async (e) => {
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key === 's' || e.key === 'S' || e.key === 'ы')) {
            e.preventDefault(); e.stopPropagation();
            await solveAll();
        }
    }, true);

    // Alt+Click
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const table = e.target.closest('table.question');
            if (table) {
                e.preventDefault(); e.stopPropagation();
                const allTables = Array.from(document.querySelectorAll('table.question'));
                const q = parseQuestion(table, allTables.indexOf(table));
                if (q) await processQuestion(q);
            }
        }
    }, true);
    
    window.start = async () => await solveAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
