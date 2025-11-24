// --- CONFIG ---
const MODEL_HIERARCHY = [
    'gemini-2.5-pro',    // Основная (Smart, 2 RPM)
    'gemini-2.5-flash'   // Резервная (Fast, 15 RPM)
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       
const MARKER_COLOR = '#cccccc'; 

console.log(`%c🚀 AI Helper: Gemini 2.5 Only (Stealth Mode)`, "color: #fff; background: #4caf50; padding: 5px; font-weight: bold;");

// --- UI ---
let statusIndicator = null;
function showStatus(message, color = '#666') {
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
    statusIndicator.innerText = message;
    statusIndicator.style.color = color;
    statusIndicator.style.display = 'block';
}
function hideStatus() { if (statusIndicator) setTimeout(() => { statusIndicator.style.display = 'none'; }, 4000); }

// --- UNLOCKER ---
function unlockSite() {
    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(eventType => window.addEventListener(eventType, (event) => { event.stopPropagation(); }, true));
    const style = document.createElement('style');
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    document.head.appendChild(style);
}

// --- IMAGE HELPER ---
async function processImageSource(imageUrl) {
  try {
    if (!imageUrl || imageUrl.startsWith('file://')) return null;
    let base64Data, mimeType;
    if (imageUrl.startsWith('data:')) {
        const commaIndex = imageUrl.indexOf(',');
        if (commaIndex === -1) return null;
        const metaData = imageUrl.substring(0, commaIndex);
        mimeType = (metaData.match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
        base64Data = imageUrl.substring(commaIndex + 1);
    } else {
        const response = await fetch(imageUrl);
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
  } catch (error) { return null; }
}

// --- PARSER ---
function parseQuestion(table, index) {
    const textElem = table.querySelector('.text');
    if (!textElem) return null;
    
    const questionImages = [];
    textElem.querySelectorAll('img').forEach(imageElement => { if (imageElement.src) questionImages.push(imageElement.src); });

    const answerTable = table.nextElementSibling;
    if (!answerTable || !answerTable.classList.contains('answer')) return null;
    
    const answers = [];
    answerTable.querySelectorAll('tr').forEach(row => {
        const label = row.querySelector('.num');
        const textDiv = row.querySelector('.text');
        const input = row.querySelector('input');
        if (label && input) {
            let answerText = textDiv ? textDiv.innerText.trim() : '';
            let answerImageSource = null;
            if (textDiv) { const imageElement = textDiv.querySelector('img'); if (imageElement) answerImageSource = imageElement.src; }

            answers.push({
                id: label.innerText.replace('.', '').trim(),
                text: answerText, imgSrc: answerImageSource, element: input, textElement: textDiv
            });
        }
    });
    
    return {
        number: index + 1, 
        text: textElem.innerText.trim(),
        images: questionImages, 
        answers: answers, 
        isMultiSelect: answerTable.dataset.qtype === '2',
        domElement: table
    };
}

function extractQuestions() {
    const questions = [];
    document.querySelectorAll('table.question').forEach((table, index) => {
        const parsedQuestion = parseQuestion(table, index);
        if (parsedQuestion) questions.push(parsedQuestion);
    });
    return questions;
}

// --- API CLIENT (GEMINI) ---
async function askGemini(question, apiKey) {
    const parts = [];
    
    // Images from Question
    for (const imageUrl of question.images) {
        const imageData = await processImageSource(imageUrl);
        if (imageData) parts.push({ inline_data: { mime_type: imageData.mime, data: imageData.base64 } });
    }

    // Options text + images
    let optionsText = "";
    let imageCounter = 0;
    for (const answer of question.answers) {
        optionsText += `${answer.id}. ${answer.text}`;
        if (answer.imgSrc) {
            const imageData = await processImageSource(answer.imgSrc);
            if (imageData) {
                parts.push({ inline_data: { mime_type: imageData.mime, data: imageData.base64 } });
                imageCounter++;
                optionsText += ` [Image #${imageCounter}]`;
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
            const imageUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
            console.log('%c ', `font-size: 1px; padding: 50px; background: url('${imageUrl}') no-repeat center/contain;`);
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

            // Handle Limits (429) & Overload (503)
            if (response.status === 429 || response.status === 503) {
                 console.warn(`⚠️ ${model} status ${response.status}. Next...`);
                 continue; 
            }

            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`API Error: ${errorText}`);
            }

            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            
            console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
            console.groupEnd();
            showStatus(`Solved via ${model}`, '#2e7d32');
            return result;

        } catch (error) {
            console.error(`❌ Error ${model}:`, error);
        }
    }
    console.groupEnd();
    return null;
}

// --- SOLVER ---
async function processQuestion(question, apiKey) {
    showStatus(`Thinking Q${question.number}...`, '#1976d2');
    question.domElement.style.opacity = '0.7';

    try {
        const result = await askGemini(question, apiKey);
        question.domElement.style.opacity = '1';

        if (result && result.correct.length > 0) {
            question.answers.forEach(answer => {
                if (result.correct.includes(answer.id)) {
                    // 1. Click
                    if (!answer.element.checked) answer.element.click();
                    
                    // 2. Marker (Right Aligned)
                    if (answer.textElement && !answer.textElement.innerHTML.includes('&bull;')) {
                        const marker = document.createElement('span');
                        marker.innerHTML = '&bull;'; 
                        marker.style.color = MARKER_COLOR; 
                        
                        // Right Align Styles
                        marker.style.float = 'right';      
                        marker.style.marginLeft = '10px';  
                        marker.style.fontSize = '18px';    
                        marker.style.cursor = 'help';
                        marker.title = `AI: ${result.reason}`;
                        
                        // Prepend to make float work correctly on same line
                        if (answer.textElement.firstChild) {
                            answer.textElement.insertBefore(marker, answer.textElement.firstChild);
                        } else {
                            answer.textElement.appendChild(marker);
                        }
                    }
                }
            });
        }
    } catch (error) {
        question.domElement.style.opacity = '1';
        showStatus(`Error Q${question.number}`, 'red');
    }
}

async function solveAll() {
    const storage = await chrome.storage.sync.get(['geminiApiKey']);
    if (!storage.geminiApiKey) return alert('No API Key');

    const questions = extractQuestions();
    if (!questions.length) return;
    
    console.group('🚀 START BATCH');
    for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
        if (questionIndex > 0) await new Promise(resolve => setTimeout(resolve, 1000));
        await processQuestion(questions[questionIndex], storage.geminiApiKey);
    }
    console.groupEnd();
    showStatus('Done'); hideStatus();
}

// --- INIT ---
function init() {
    unlockSite();

    document.addEventListener('keydown', async (event) => {
        if (event.altKey === USE_ALT_KEY && (event.code === HOTKEY_CODE || event.key === 's' || event.key === 'S' || event.key === 'ы')) {
            event.preventDefault(); event.stopPropagation();
            await solveAll();
        }
    }, true);

    document.addEventListener('click', async (event) => {
        if (event.altKey) {
            const table = event.target.closest('table.question');
            if (table) {
                event.preventDefault(); event.stopPropagation();
                const storage = await chrome.storage.sync.get(['geminiApiKey']);
                if (!storage.geminiApiKey) return alert('No API Key');

                const allTables = Array.from(document.querySelectorAll('table.question'));
                const parsedQuestion = parseQuestion(table, allTables.indexOf(table));
                if (parsedQuestion) await processQuestion(parsedQuestion, storage.geminiApiKey);
            }
        }
    }, true);
    
    window.start = async () => await solveAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
