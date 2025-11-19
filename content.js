// --- CONFIG ---
// ТОЛЬКО СЕРИЯ 2.5
const MODEL_HIERARCHY = [
    'gemini-2.5-pro',    // Основная (Smart)
    'gemini-2.5-flash'   // Резервная (Fast)
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       
const MARKER_COLOR = '#cccccc'; 

console.log(`%c🚀 AI Helper: GEMINI 2.5 ONLY (Debug + Unlocker)`, "color: #fff; background: #000; padding: 5px; font-weight: bold;");

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
    if (!url) return null;
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) return null;
        const meta = url.substring(0, commaIdx);
        const mimeType = (meta.match(/data:([^;]+);/) || [])[1] || 'image/jpeg';
        return { inline_data: { mime_type: mimeType, data: url.substring(commaIdx + 1) } };
    }
    if (url.startsWith('file://')) return null;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Img Fetch Error');
    const blob = await response.blob();
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return {
      inline_data: {
        mime_type: base64Data.substring(base64Data.indexOf(':') + 1, base64Data.indexOf(';')),
        data: base64Data.split(',')[1]
      }
    };
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

// --- API CLIENT ---
async function askGemini(question, apiKey) {
  const parts = [];
  let imgCount = 0;

  if (question.images.length) {
    for (const url of question.images) {
        const p = await processImageSource(url);
        if(p) { parts.push(p); imgCount++; }
    }
  }

  let optionsText = "";
  for (const ans of question.answers) {
      let line = `${ans.id}. ${ans.text}`;
      if (ans.imgSrc) {
          const p = await processImageSource(ans.imgSrc);
          if (p) { parts.push(p); imgCount++; line += ` [Image #${imgCount}]`; }
      }
      optionsText += line + "\n";
  }

  const promptText = `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single-choice'}
Options:
${optionsText}

Task:
1. Select correct option(s).
2. Provide a very short explanation (max 10 words) in Russian.

Return JSON ONLY: 
{"correct": ["A"], "reason": "Explanation"}
`;
  parts.unshift({ text: promptText });

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
  };

  // === DEBUG LOGGING ===
  console.group(`❓ ВОПРОС №${question.number}`);
  console.log(`%c📝 PROMPT:`, 'color: #2196F3;', promptText);
  
  const imageParts = requestBody.contents[0].parts.filter(p => p.inline_data);
  if (imageParts.length > 0) {
      console.groupCollapsed(`📸 IMAGES (${imageParts.length})`);
      imageParts.forEach((part, idx) => {
          const url = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
          console.log('%c ', `font-size: 1px; padding: 50px; background: url('${url}') no-repeat center/contain;`);
      });
      console.groupEnd();
  }

  // --- TRY MODELS ---
  for (const model of MODEL_HIERARCHY) {
      try {
        console.log(`📡 Requesting: %c${model}`, 'color: blue; font-weight: bold');
        const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        // HANDLE 429 (Limit) & 503 (Overload)
        if (response.status === 429 || response.status === 503) {
            console.warn(`⚠️ ${model} Status ${response.status}. Switching...`);
            continue; 
        }

        if (!response.ok) {
             const errTxt = await response.text();
             throw new Error(`API ${response.status}: ${errTxt}`);
        }

        const data = await response.json();
        console.log(`%c📥 RAW:`, 'color: #999', data);

        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        console.log(`%c✅ RESULT (${model}):`, 'color: green; font-weight: bold;', result);
        
        console.groupEnd();
        showStatus(`Solved via ${model}`, '#2e7d32');
        return result;

      } catch (e) {
          console.error(`❌ Error ${model}:`, e);
      }
  }
  
  console.error("ALL MODELS FAILED");
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
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) ans.element.click();
                    if (ans.textElement && !ans.textElement.innerHTML.includes('&bull;')) {
                        const m = document.createElement('span');
                        m.innerHTML = '&bull;'; 
                        m.style.color = MARKER_COLOR; 
                        m.style.marginLeft='5px';
                        m.style.cursor='help';
                        m.title = `AI: ${result.reason}`;
                        ans.textElement.appendChild(m);
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
  
  console.group('🚀 START ALL');
  for (let i = 0; i < questions.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    await processQuestion(questions[i], storage.geminiApiKey);
  }
  console.groupEnd();
  showStatus('Done'); hideStatus();
}

// --- INIT ---
function init() {
    unlockSite(); // Снимаем блокировки

    // УСИЛЕННЫЙ СЛУШАТЕЛЬ (useCapture = true)
    // Это позволяет перехватить нажатие ДО того, как сайт его заблокирует
    window.addEventListener('keydown', async (e) => {
        // Проверка: Alt + S
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы')) {
            console.log('🕵️ Hotkey detected!');
            e.preventDefault(); // Запрещаем сайту реагировать
            e.stopPropagation(); // Останавливаем других слушателей
            await solveAll();
        }
    }, true); // <--- ВАЖНО: true включает режим перехвата

    // Точечное решение (Alt + Click)
    window.addEventListener('click', async (e) => {
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
    
    // РЕЗЕРВНЫЙ ЗАПУСК ЧЕРЕЗ КОНСОЛЬ
    // Теперь можно написать в консоли: start() и нажать Enter
    window.start = async () => {
        console.log('🚀 Manual start via console...');
        await solveAll();
    };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
