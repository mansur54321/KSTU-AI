// --- CONFIG ---
const MODEL_HIERARCHY = [
    'gemini-2.5-flash'
];

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/`;
const HOTKEY_CODE = 'KeyS';     
const USE_ALT_KEY = true;       

console.log(`%c🚀 AI Solver v2.1: Targeted Click + Light Opacity`, "color: #fff; background: #000; padding: 5px; font-weight: bold;");

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
  } catch (e) { 
      return null; 
  }
}

// --- PARSERS ---

// Вспомогательная функция для парсинга конкретного вопроса Univer
function parseSingleUniverQuestion(table, index) {
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
          text: ansText, imgSrc: ansImgSrc, element: input
        });
      }
    });

    return {
      number: index, text: textElem.innerText.trim(),
      images: qImages, answers: answers, isMultiSelect: answerTable.dataset.qtype === '2',
      domElement: table
    };
}

function extractQuestions() {
    // 1. Platonus Logic
    const platonusWrapper = document.querySelector('.question-wrapper, div[ng-bind-html="question.questionText"], .text-color.bold');
    if (platonusWrapper) {
        // ... (код парсинга Platonus остался тем же, он работает правильно)
        const text = platonusWrapper.innerText.trim();
        const qImages = [];
        platonusWrapper.querySelectorAll('img').forEach(img => { if (img.src) qImages.push(img.src); });

        const answers = [];
        const answerRows = document.querySelectorAll('.table-question tbody tr, .answer-variant');
        
        answerRows.forEach((row, idx) => {
            const letterId = String.fromCharCode(65 + idx); 
            const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
            const cells = row.querySelectorAll('td');
            let textContainer = cells.length > 1 ? cells[1] : row;
            if (input && textContainer) {
                 let ansText = textContainer.innerText.trim();
                 let ansImgSrc = null;
                 const img = textContainer.querySelector('img');
                 if (img) ansImgSrc = img.src;
                 answers.push({ id: letterId, text: ansText, imgSrc: ansImgSrc, element: input });
            }
        });
        const isMulti = document.querySelector('input[type="checkbox"]') !== null;
        if (answers.length > 0) {
            return [{
                number: 1, text: text, images: qImages, answers: answers, isMultiSelect: isMulti,
                domElement: platonusWrapper.closest('.card') || platonusWrapper
            }];
        }
    }

    // 2. Univer Logic (Mass extraction)
    const univerTables = document.querySelectorAll('table.question');
    if (univerTables.length > 0) {
        const questions = [];
        univerTables.forEach((table, index) => {
            const q = parseSingleUniverQuestion(table, index + 1);
            if(q) questions.push(q);
        });
        return questions;
    }

    return [];
}

// --- API CLIENT ---
async function askGemini(question, apiKey) {
  const parts = [];
  
  if (question.images.length) {
    for (const url of question.images) {
        const p = await processImageSource(url);
        if(p) parts.push(p);
    }
  }

  let optionsText = "";
  for (const ans of question.answers) {
      let line = `${ans.id}. ${ans.text}`;
      if (ans.imgSrc) {
          const p = await processImageSource(ans.imgSrc);
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

  console.group(`❓ QUESTION DATA`);
  console.log(promptText);
  
  for (const model of MODEL_HIERARCHY) {
      try {
        console.log(`📡 Sending to: ${model}`);
        const response = await fetch(`${BASE_URL}${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 429 || response.status === 503) {
            console.warn(`⚠️ ${model} Busy. Switching...`);
            continue; 
        }

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        const result = JSON.parse(data.candidates[0].content.parts[0].text);
        
        console.log(`%c✅ Result:`, 'color: green', result);
        console.groupEnd();
        showStatus(`Solved (${model})`, '#2e7d32');
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
    showStatus(`Thinking...`, '#1976d2');
    
    // === ВИЗУАЛЬНАЯ ИНДИКАЦИЯ (ЛЕГКАЯ) ===
    if(q.domElement) {
        q.domElement.style.transition = "opacity 0.3s";
        q.domElement.style.opacity = '0.7'; // Еле заметная прозрачность
    }

    try {
        const result = await askGemini(q, apiKey);
        
        if(q.domElement) q.domElement.style.opacity = '1';

        if (result && result.correct) {
            q.answers.forEach(ans => {
                if (result.correct.includes(ans.id)) {
                    if (!ans.element.checked) {
                        console.log(`Clicking: ${ans.id}`);
                        ans.element.click();
                    }
                    // Добавляем визуальную подсветку правильного ответа
                    const row = ans.element.closest('tr') || ans.element.closest('.answer-variant');
                    if (row) {
                        row.classList.add('ai-correct-answer');
                    }
                }
            });
        }
    } catch (e) {
        if(q.domElement) q.domElement.style.opacity = '1';
        showStatus(`Error`, 'red');
    }
}

async function solveAll() {
  const storage = await chrome.storage.sync.get(['geminiApiKey']);
  if (!storage.geminiApiKey) return alert('No API Key');

  const questions = extractQuestions();
  if (!questions.length) return console.log('No questions found');

  for (let i = 0; i < questions.length; i++) {
    await processQuestion(questions[i], storage.geminiApiKey);
  }
  hideStatus();
}

function init() {
    unlockSite();
    
    // Alt + S (Все вопросы)
    window.addEventListener('keydown', async (e) => {
        if (e.altKey === USE_ALT_KEY && (e.code === HOTKEY_CODE || e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'ы')) {
            e.preventDefault(); e.stopPropagation();
            await solveAll();
        }
    }, true);
    
    // Alt + Click (Точечное решение)
    window.addEventListener('click', async (e) => {
        if (e.altKey) {
            const table = e.target.closest('table.question');
            const platonusWrapper = e.target.closest('.question-wrapper, .card');
            
            const storage = await chrome.storage.sync.get(['geminiApiKey']);
            if (!storage.geminiApiKey) return alert('No API Key');

            // 1. UNIVER Logic
            if (table) {
                e.preventDefault(); e.stopPropagation();
                // Находим только ЭТОТ вопрос
                const q = parseSingleUniverQuestion(table, 0);
                if (q) {
                    console.log('Targeted solve: Univer Question');
                    await processQuestion(q, storage.geminiApiKey);
                }
                return;
            }

            // 2. PLATONUS Logic (Там обычно один вопрос на экране, поэтому просто вызываем стандартный парсер)
            if (platonusWrapper) {
                 e.preventDefault(); e.stopPropagation();
                 const qs = extractQuestions(); // Найдет текущий видимый
                 if (qs.length > 0) {
                     console.log('Targeted solve: Platonus Question');
                     await processQuestion(qs[0], storage.geminiApiKey);
                 }
                 return;
            }
        }
    }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
