// ============================================
// AI Test Solver - Modular Structure
// ============================================

console.log(`%c🚀 AI Helper: Multi-Provider Support`, "color: #fff; background: #4caf50; padding: 5px; font-weight: bold;");

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // API Models
    GEMINI_MODELS: [
        'gemini-2.5-pro',    // Primary (Smart, 2 RPM)
        'gemini-2.5-flash'   // Fallback (Fast, 15 RPM)
    ],
    
    // API Endpoints
    GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1/chat/completions',
    
    // OpenRouter Models
    OPENROUTER_MODELS: [
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4-turbo',
        'google/gemini-pro'
    ],
    
    // Hotkeys
    HOTKEY_CODE: 'KeyS',
    USE_ALT_KEY: true,
    
    // UI Settings
    STATUS_TIMEOUT: 4000,
    QUESTION_DELAY: 1000,
    
    // Generation Settings
    TEMPERATURE: 0.0,
    RESPONSE_MIME_TYPE: 'application/json'
};

// ============================================
// UI MODULE
// ============================================
const UI = (function() {
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

    function hideStatus(timeout = CONFIG.STATUS_TIMEOUT) {
        if (statusIndicator) {
            setTimeout(() => {
                statusIndicator.style.display = 'none';
            }, timeout);
        }
    }

    function unlockSite() {
        const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
        events.forEach(evt => window.addEventListener(evt, (e) => { e.stopPropagation(); }, true));
        
        const style = document.createElement('style');
        style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
        document.head.appendChild(style);
    }

    return { showStatus, hideStatus, unlockSite };
})();

// ============================================
// PARSER MODULE
// ============================================
const Parser = (function() {
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
                if (!response.ok) throw new Error('Image Fetch Error');
                const blob = await response.blob();
                mimeType = blob.type;
                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            }
            
            return { base64: base64Data, mime: mimeType };
        } catch (e) {
            console.error('Error processing image:', e);
            return null;
        }
    }

    function parseQuestion(table, index) {
        const textElem = table.querySelector('.text');
        if (!textElem) return null;
        
        const qImages = [];
        textElem.querySelectorAll('img').forEach(img => {
            if (img.src) qImages.push(img.src);
        });

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
                
                if (textDiv) {
                    const img = textDiv.querySelector('img');
                    if (img) ansImgSrc = img.src;
                }

                answers.push({
                    id: label.innerText.replace('.', '').trim(),
                    text: ansText,
                    imgSrc: ansImgSrc,
                    element: input,
                    textElement: textDiv
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

    return { processImageSource, parseQuestion, extractQuestions };
})();

// ============================================
// API MODULE
// ============================================
const API = (function() {
    function buildPrompt(question) {
        let optionsText = "";
        question.answers.forEach(ans => {
            optionsText += `${ans.id}. ${ans.text}\n`;
        });

        return `
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
    }

    async function prepareGeminiImageParts(question) {
        const parts = [];
        
        // Images from Question
        for (const url of question.images) {
            const img = await Parser.processImageSource(url);
            if (img) {
                parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
            }
        }

        // Images from answer options
        // Note: Images are sent in order but without explicit labels
        // The AI model can infer context from prompt structure
        for (const ans of question.answers) {
            if (ans.imgSrc) {
                const img = await Parser.processImageSource(ans.imgSrc);
                if (img) {
                    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
                }
            }
        }
        
        return parts;
    }

    async function askGemini(question, apiKey) {
        const prompt = buildPrompt(question);
        const imageParts = await prepareGeminiImageParts(question);
        
        const parts = [{ text: prompt }, ...imageParts];
        
        const requestBody = {
            contents: [{ parts: parts }],
            generationConfig: {
                responseMimeType: CONFIG.RESPONSE_MIME_TYPE,
                temperature: CONFIG.TEMPERATURE
            }
        };

        // Visual logging
        console.group(`❓ Q${question.number}`);
        console.log(`%c📝 Prompt:`, 'color: #2196F3;', prompt);
        
        if (imageParts.length > 0) {
            console.groupCollapsed(`📸 Images (${imageParts.length})`);
            imageParts.forEach((part) => {
                const url = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
                console.log('%c ', `font-size: 1px; padding: 50px; background: url('${url}') no-repeat center/contain;`);
            });
            console.groupEnd();
        }

        // Try models in hierarchy
        for (const model of CONFIG.GEMINI_MODELS) {
            try {
                console.log(`📡 Sending to: %c${model}`, 'color: blue; font-weight: bold');
                const response = await fetch(`${CONFIG.GEMINI_BASE_URL}${model}:generateContent?key=${apiKey}`, {
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
                    const errTxt = await response.text();
                    throw new Error(`API Error (${response.status}) with ${model}: ${errTxt}`);
                }

                const data = await response.json();
                const result = JSON.parse(data.candidates[0].content.parts[0].text);
                
                console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
                console.groupEnd();
                
                return { result, model };

            } catch (e) {
                console.error(`❌ Error ${model}:`, e);
            }
        }
        
        console.groupEnd();
        return null;
    }

    async function askOpenRouter(question, apiKey) {
        const prompt = buildPrompt(question);
        
        // Note: OpenRouter doesn't support vision in the same way as Gemini
        // Images are ignored for now. Text-only questions work fine.
        if (question.images.length > 0) {
            console.warn(`⚠️ Question ${question.number} has ${question.images.length} image(s), but OpenRouter doesn't support vision API. Processing text only.`);
        }
        
        // OpenRouter uses OpenAI-compatible format
        const messages = [
            {
                role: "user",
                content: prompt
            }
        ];

        console.group(`❓ Q${question.number} (OpenRouter)`);
        console.log(`%c📝 Prompt:`, 'color: #2196F3;', prompt);

        // Try models in hierarchy
        for (const model of CONFIG.OPENROUTER_MODELS) {
            try {
                console.log(`📡 Sending to: %c${model}`, 'color: purple; font-weight: bold');
                const response = await fetch(CONFIG.OPENROUTER_BASE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'AI Test Solver'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        temperature: CONFIG.TEMPERATURE,
                        response_format: { type: "json_object" }
                    })
                });

                if (response.status === 429 || response.status === 503) {
                    console.warn(`⚠️ ${model} status ${response.status}. Next...`);
                    continue;
                }

                if (!response.ok) {
                    const errTxt = await response.text();
                    throw new Error(`OpenRouter API Error (${response.status}) with ${model}: ${errTxt}`);
                }

                const data = await response.json();
                const result = JSON.parse(data.choices[0].message.content);
                
                console.log(`%c✅ Result:`, 'color: green; font-weight: bold;', result);
                console.groupEnd();
                
                return { result, model };

            } catch (e) {
                console.error(`❌ Error ${model}:`, e);
            }
        }
        
        console.groupEnd();
        return null;
    }

    async function askAI(question, apiKey, provider = 'gemini') {
        if (provider === 'openrouter') {
            return await askOpenRouter(question, apiKey);
        } else {
            return await askGemini(question, apiKey);
        }
    }

    return { askAI };
})();

// ============================================
// SOLVER MODULE
// ============================================
const Solver = (function() {
    async function processQuestion(question, apiKey, provider = 'gemini') {
        UI.showStatus(`Thinking Q${question.number}...`, '#1976d2');
        question.domElement.style.opacity = '0.7';

        try {
            const response = await API.askAI(question, apiKey, provider);
            question.domElement.style.opacity = '1';

            if (response && response.result && response.result.correct.length > 0) {
                const { result, model } = response;
                
                // Apply answer by clicking the checkbox/radio
                question.answers.forEach(ans => {
                    if (result.correct.includes(ans.id)) {
                        if (!ans.element.checked) {
                            ans.element.click();
                        }
                    }
                });
                
                UI.showStatus(`Solved via ${model}`, '#2e7d32');
            } else {
                UI.showStatus(`No answer for Q${question.number}`, '#ff9800');
            }
        } catch (e) {
            question.domElement.style.opacity = '1';
            UI.showStatus(`Error Q${question.number}`, 'red');
            console.error('Processing error:', e);
        }
    }

    return { processQuestion };
})();

// ============================================
// MAIN APPLICATION
// ============================================
async function solveAll() {
    const storage = await chrome.storage.sync.get(['geminiApiKey', 'openrouterApiKey', 'apiProvider']);
    const provider = storage.apiProvider || 'gemini';
    const apiKey = provider === 'openrouter' ? storage.openrouterApiKey : storage.geminiApiKey;
    
    if (!apiKey) {
        alert(`No API Key for ${provider}`);
        return;
    }

    const questions = Parser.extractQuestions();
    if (!questions.length) return;
    
    console.group('🚀 START BATCH');
    for (let i = 0; i < questions.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, CONFIG.QUESTION_DELAY));
        await Solver.processQuestion(questions[i], apiKey, provider);
    }
    console.groupEnd();
    UI.showStatus('Done');
    UI.hideStatus();
}

function init() {
    UI.unlockSite();

    // Hotkey listener for solving all questions
    document.addEventListener('keydown', async (e) => {
        if (e.altKey === CONFIG.USE_ALT_KEY && (e.code === CONFIG.HOTKEY_CODE || e.key === 's' || e.key === 'S' || e.key === 'ы')) {
            e.preventDefault();
            e.stopPropagation();
            await solveAll();
        }
    }, true);

    // Alt+Click listener for single question
    document.addEventListener('click', async (e) => {
        if (e.altKey) {
            const table = e.target.closest('table.question');
            if (table) {
                e.preventDefault();
                e.stopPropagation();
                
                const storage = await chrome.storage.sync.get(['geminiApiKey', 'openrouterApiKey', 'apiProvider']);
                const provider = storage.apiProvider || 'gemini';
                const apiKey = provider === 'openrouter' ? storage.openrouterApiKey : storage.geminiApiKey;
                
                if (!apiKey) {
                    alert(`No API Key for ${provider}`);
                    return;
                }

                const allTables = Array.from(document.querySelectorAll('table.question'));
                const q = Parser.parseQuestion(table, allTables.indexOf(table));
                if (q) await Solver.processQuestion(q, apiKey, provider);
            }
        }
    }, true);
    
    // Expose global function for console usage
    window.start = async () => await solveAll();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
