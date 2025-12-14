// --- CONFIG ---
// Убрали PRO, оставили только быструю FLASH
const MODEL_HIERARCHY = [
    'gemini-2.5-flash'
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       

console.log(`%c🚀 AI Helper: FLASH ONLY + MULTI-KEY`, "color: #fff; background: #000; padding: 5px; font-weight: bold;");

// Глобальный индекс текущего рабочего ключа
let currentKeyIndex = 0;

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
    const style = document.createElement('style');
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    if(!document.getElementById('ai-unlock-style')) {
        style.id = 'ai-unlock-style';
        document.head.appendChild(style);
    }

    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(evt => {
        window.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
        document.addEventListener(evt, (e) => { e.stopPropagation(); }, true);
    });

    setInterval(() => {
        const targets = [document, document.body, window];
        const props = ['oncontextmenu', 'onselectstart', 'oncopy', 'oncut', 'onpaste', 'onkeydown', 'onkeyup'];
        targets.forEach(t => { if(t) props.forEach(p => { if (t[p] !== null) t[p] = null; }); });
    }, 1000);
}

// --- IMAGE HELPER ---
async function processImageSource(url) {
  try {
    if (!url) return null;
    if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        if (commaIdx === -1) return null;
        const meta = url.substring(0, commaIdx);
        let mimeType = (meta.match(/data:([^;]+);/) || [])[1];
        if (!mimeType) mimeType = 'image/jpeg';
        return { inline_data: { mime_type: mimeType, data: url.substring(commaIdx + 1) } };
    }
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Img Fetch Error');
    const blob = await response.blob();
    
    let mimeType = blob.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
        if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg'; 
    }

    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    
    return { inline_data: { mime_type: mimeType, data: base64Data.split(',')[1] } };
  } catch (e) { return null; }
}

// --- PARSERS ---
function parseUniver() {
    const questions = [];
    document.querySelectorAll('table.question').forEach((table, index) => {
        const textElem = table.querySelector('.text');
        if (!textElem) return;
        const qImages = Array.from(textElem.querySelectorAll('img'));
        const answerTable = table.nextElementSibling;
        if (!answerTable || !answerTable.classList.contains('answer')) return;
        const answers = [];
        answerTable.querySelectorAll('tr').forEach(row => {
          const label = row.querySelector('.num');
          const textDiv = row.querySelector('.text');
          const input = row.querySelector('input');
          if (label && input) {
            let ansText = textDiv ? textDiv.innerText.trim() : '';
            let ansImgSrc = textDiv ? textDiv.querySelector('img') : null;
            answers.push({
              id: label.innerText.replace('.', '').trim(),
              text: ansText, imgElement: ansImgSrc, element: input
            });
          }
        });
        questions.push({
          number: index + 1, text: textElem.innerText.trim(),
          imageElements: qImages, answers: answers, isMultiSelect: answerTable.dataset.qtype === '2',
          domElement: table
        });
    });
    return questions;
}

function parsePlatonus() {
    const questions = [];
    const questionWrapper = document.querySelector('.question-wrapper, div[ng-bind-html="question.questionText"], .text');
    if (!questionWrapper) return []; 

    const text = questionWrapper.innerText.trim();
    const qImages = Array.from(questionWrapper.querySelectorAll('img'));
    const answers = [];
    const answerRows = document.querySelectorAll('.table-question tbody tr');
    
    answerRows.forEach((row, idx) => {
        const letterId = String.fromCharCode(65 + idx);
        const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
        const cells = row.querySelectorAll('td');
        let textContainer = cells.length > 1 ? cells[1] : row;
        
        if (input && textContainer) {
             let ansText = textContainer.innerText.trim();
             let ansImgElement = textContainer.querySelector('img');
             answers.push({
                 id: letterId, text: ansText, imgElement: ansImgElement, element: input 
             });
        }
    });

    const isMulti = document.querySelector('input[type="checkbox"]') !== null;
    if (answers.length > 0) {
        questions.push({
            number: 1, text: text, imageElements: qImages, answers: answers, isMultiSelect: isMulti,
            domElement: questionWrapper.closest('.card') || questionWrapper 
        });
    }
    return questions;
}

function extractQuestions() {
    let q = parseUniver();
    if (q.length > 0) return q;
    q = parsePlatonus();
    if (q.length > 0) return q;
    return [];
}

// --- API CLIENT ---
async function askGemini(question, apiKeys) {
  const parts = [];
  
  if (question.imageElements.length > 0) {
    for (const imgEl of question.imageElements) {
        const url = imgEl.src;
        const p = await processImageSource(url);
        if(p) parts.push(p);
    }
  }

  let optionsText = "";
  for (const ans of question.answers) {
      let line = `${ans.id}. ${ans.text}`;
      if (ans.imgElement) {
          const p = await processImageSource(ans.imgElement.src);
          if (p) { parts.push(p); line += ` [Image Attached]`; }
      }
      optionsText += line + "\n";
  }

  const promptText = `
Question: ${question.text}
Type: ${question.isMultiSelect ? 'Multi-choice' : 'Single-choice'}
Options:
${optionsText}
Return JSON ONLY: {"correct": ["A"]}
`;
  parts.unshift({ text: promptText });

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
  };

  console.group(`❓ ВОПРОС`);
  console.log(promptText);

  for (const model of MODEL_HIERARCHY) {
      for (let i = 0; i < apiKeys.length; i++) {
          const keyIndex = (currentKeyIndex + i) % apiKeys.length;
          const apiKey = apiKeys[keyIndex];

          try {
            console.log(`📡 Trying Key[${keyIndex}]...`);
            
            const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });

            if (response.status === 429 || response.status === 503) {
                console.warn(`⚠️ Key[${keyIndex}] Busy. Next...`);
                continue; 
            }

            if (!response.ok) throw new Error(await response.text());

            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            
            console.log(`%c✅ Success!`, 'color: green', result);
            console.groupEnd();
            currentKeyIndex = keyIndex;
            showStatus(`Done`, '#2e7d32');
            return result;

          } catch (e) {
              console.error(`Error Key[${keyIndex}]:`, e);
          }
      }
  }
  
  console.error("ALL KEYS FAILED");
  console.groupEnd();
  return null;
}

// --- SOLVER ---
async function processQuestion(q, apiKeys) {
    showStatus(`Thinking...`, '#1976d2');
    if(q.domElement) q.domElement.style.opacity = '0.7';

    try {
        const result = await askGemini(q, apiKeys);
        if(q.domElement) q.domElement.style.opacity = '1';

        if (result && result.correct) {
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) {
                        console.log(`Clicking: ${ans.id}`);
                        ans.element.click();
                    }
                }
            });
        }
    } catch (e) {
        if(q.domElement) q.domElement.style.opacity = '1';
        showStatus(`Err`, 'red');
    }
}

async function solveAll() {
  const storage = await chrome.storage.sync.get(['geminiApiKeys']);
  
  let keys = [];
  if (storage.geminiApiKeys && Array.isArray(storage.geminiApiKeys)) {
      keys = storage.geminiApiKeys;
  } else {
      // Fallback to old storage
      const old = await chrome.storage.sync.get(['geminiApiKey']);
      if (old.geminiApiKey) keys = [old.geminiApiKey];
  }

  if (keys.length === 0) return alert('Добавьте ключи в настройках расширения!');

  const questions = extractQuestions();
  if (!questions.length) return console.log('Questions not found');

  for (let i = 0; i < questions.length; i++) {
    await processQuestion(questions[i], keys);
  }
  hideStatus();
}

function init() {
    unlockSite();
    window.addEventListener('keydown', async (e) => {
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы')) {
            e.preventDefault(); e.stopPropagation();
            await solveAll();
        }
    }, true);
    
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
             e.preventDefault(); e.stopPropagation();
             await solveAll();
        }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();