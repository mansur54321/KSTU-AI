// --- CONFIG ---
const MODEL_HIERARCHY = [
    'gemini-2.5-pro',    // Основная (Smart, 2 RPM)
    'gemini-2.5-flash'   // Резервная (Fast, 15 RPM)
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       
let MARKER_COLOR = '#cccccc';
let DELAY_BETWEEN_QUESTIONS = 1000;
let ENABLE_CACHE = true;

console.log(`%c🚀 AI Helper: Gemini 2.5 Only (Stealth Mode)`, "color: #fff; background: #4caf50; padding: 5px; font-weight: bold;");

// --- STATISTICS & CACHE ---
async function updateStats(field, increment = 1) {
    const result = await chrome.storage.local.get(['stats']);
    const stats = result.stats || { questionsSolved: 0, apiCalls: 0, cacheHits: 0 };
    stats[field] = (stats[field] || 0) + increment;
    await chrome.storage.local.set({ stats });
}

function hashQuestion(question) {
    // Create a simple hash from question text and answers
    // Note: This is a basic hash for caching purposes, not cryptographic security
    const text = question.text + question.answers.map(a => a.text).join('');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    // Add question type to hash to differentiate single vs multi-select
    hash = hash ^ (question.isMultiSelect ? 1 : 0);
    return Math.abs(hash).toString(36);
}

async function getCachedAnswer(question) {
    if (!ENABLE_CACHE) return null;
    
    const hash = hashQuestion(question);
    const result = await chrome.storage.local.get(['questionCache']);
    const cache = result.questionCache || {};
    
    if (cache[hash]) {
        console.log(`%c💾 Cache hit for Q${question.number}`, 'color: #9c27b0; font-weight: bold');
        await updateStats('cacheHits');
        return cache[hash];
    }
    return null;
}

async function cacheAnswer(question, result) {
    if (!ENABLE_CACHE) return;
    
    const hash = hashQuestion(question);
    const storage = await chrome.storage.local.get(['questionCache']);
    const cache = storage.questionCache || {};
    cache[hash] = result;
    await chrome.storage.local.set({ questionCache: cache });
}

// Load settings on init
async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get(['markerColor', 'delayBetweenQuestions', 'enableCache']);
        if (settings.markerColor) MARKER_COLOR = settings.markerColor;
        if (settings.delayBetweenQuestions !== undefined) DELAY_BETWEEN_QUESTIONS = settings.delayBetweenQuestions;
        if (settings.enableCache !== undefined) ENABLE_CACHE = settings.enableCache;
    } catch (error) {
        console.warn('Failed to load settings, using defaults:', error);
        // Fall back to default values already set
    }
}

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

// --- API CLIENT (GEMINI) ---
async function askGemini(question, apiKey) {
    // Check cache first
    const cachedResult = await getCachedAnswer(question);
    if (cachedResult) {
        return cachedResult;
    }

    const parts = [];
    
    // Images from Question
    for (const url of question.images) {
        const img = await processImageSource(url);
        if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
    }

    // Options text + images
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

    const prompt = `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single'}
Options:
${optionsText}

Task:
1. Select correct option(s).
2. Provide a very short explanation (max 10 words) in Russian.

Return JSON ONLY: 
{"correct": ["A"], "reason": "explanation"}
`;
    parts.unshift({ text: prompt });

    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
    };

    // === VISUAL LOGGING ===
    console.group(`❓ Q${question.number}`);
    console.log(`%c📝 Prompt:`, 'color: #2196F3;', prompt);
    
    const imageParts = requestBody.contents[0].parts.filter(p => p.inline_data);
    if (imageParts.length > 0) {
        console.groupCollapsed(`📸 Images (${imageParts.length})`);
        imageParts.forEach((part) => {
            const url = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
            console.log('%c ', `font-size: 1px; padding: 50px; background: url('${url}') no-repeat center/contain;`);
        });
        console.groupEnd();
    }

    // --- TRY MODELS ---
    for (const model of MODEL_HIERARCHY) {
        try {
            console.log(`📡 Sending to: %c${model}`, 'color: blue; font-weight: bold');
            const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            // Track API call
            await updateStats('apiCalls');

            // Handle Limits (429) & Overload (503)
            if (response.status === 429 || response.status === 503) {
                 console.warn(`⚠️ ${model} status ${response.status}. Next...`);
                 continue; 
            }

            if (!response.ok) {
                 const errTxt = await response.text();
                 throw new Error(`API Error: ${errTxt}`);
            }

            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            
            console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
            console.groupEnd();
            showStatus(`Solved via ${model}`, '#2e7d32');
            
            // Cache the result
            await cacheAnswer(question, result);
            
            return result;

        } catch (e) {
            console.error(`❌ Error ${model}:`, e);
        }
    }
    console.groupEnd();
    return null;
}

// --- SOLVER ---
async function processQuestion(q, apiKey) {
    showStatus(`Thinking Q${q.number}...`, '#1976d2');
    q.domElement.style.opacity = '0.7';

    try {
        const result = await askGemini(q, apiKey);
        q.domElement.style.opacity = '1';

        if (result && result.correct.length > 0) {
            // Update statistics
            await updateStats('questionsSolved');
            
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    // 1. Click
                    if (!ans.element.checked) ans.element.click();
                    
                    // 2. Marker (Right Aligned)
                    if (ans.textElement && !ans.textElement.innerHTML.includes('&bull;')) {
                        const m = document.createElement('span');
                        m.innerHTML = '&bull;'; 
                        m.style.color = MARKER_COLOR; 
                        
                        // Right Align Styles
                        m.style.float = 'right';      
                        m.style.marginLeft = '10px';  
                        m.style.fontSize = '18px';    
                        m.style.cursor = 'help';
                        m.title = `AI: ${result.reason}`;
                        
                        // Prepend to make float work correctly on same line
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
    }
}

async function solveAll() {
    const storage = await chrome.storage.sync.get(['geminiApiKey']);
    if (!storage.geminiApiKey) return alert('No API Key');

    const questions = extractQuestions();
    if (!questions.length) return;
    
    console.group('🚀 START BATCH');
    for (let i = 0; i < questions.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, DELAY_BETWEEN_QUESTIONS));
        await processQuestion(questions[i], storage.geminiApiKey);
    }
    console.groupEnd();
    showStatus('Done'); hideStatus();
}

// --- INIT ---
async function init() {
    await loadSettings();
    unlockSite();

    document.addEventListener('keydown', async (e) => {
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key === 's' || e.key === 'S' || e.key === 'ы')) {
            e.preventDefault(); e.stopPropagation();
            await solveAll();
        }
    }, true);

    document.addEventListener('click', async (e) => {
        if (e.altKey) {
            const table = e.target.closest('table.question');
            if (table) {
                e.preventDefault(); e.stopPropagation();
                const storage = await chrome.storage.sync.get(['geminiApiKey']);
                if (!storage.geminiApiKey) return alert('No API Key');

                const allTables = Array.from(document.querySelectorAll('table.question'));
                const q = parseQuestion(table, allTables.indexOf(table));
                if (q) await processQuestion(q, storage.geminiApiKey);
            }
        }
    }, true);
    
    window.start = async () => await solveAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
