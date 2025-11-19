// --- CONFIG ---
const GEMINI_MODEL = 'gemini-2.5-pro'; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

console.log(`%c🚀 AI Helper Запущен! Модель: ${GEMINI_MODEL}`, "color: #fff; background: #7928CA; padding: 5px; font-weight: bold; border-radius: 5px;");

// Добавление кнопки
function addSolveButton() {
  const oldButton = document.getElementById('ai-solve-button');
  if (oldButton) oldButton.remove();

  let buttonsDiv = document.querySelector('.buttons');
  
  if (!buttonsDiv) {
    const questionTable = document.querySelector('table.question');
    if (questionTable) {
      buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'buttons ai-buttons-container';
      buttonsDiv.style.cssText = 'margin: 20px; padding: 10px; text-align: center;';
      questionTable.parentElement.insertBefore(buttonsDiv, questionTable);
    } else {
      setTimeout(addSolveButton, 1000);
      return;
    }
  }

  const solveButton = document.createElement('input');
  solveButton.type = 'button';
  solveButton.id = 'ai-solve-button';
  solveButton.className = 'submitButton ai-button';
  solveButton.value = '⚡ Gemini 2.5 Pro: DEBUG MODE';
  
  solveButton.style.cssText = `
    background: linear-gradient(135deg, #212121 0%, #424242 100%);
    color: #00e676;
    border: 2px solid #00e676;
    padding: 10px 20px;
    font-weight: bold;
    font-family: monospace;
    cursor: pointer;
    margin-right: 10px;
    border-radius: 5px;
    box-shadow: 0 4px 10px rgba(0, 230, 118, 0.2);
    transition: all 0.3s;
  `;
  
  solveButton.onmouseover = () => solveButton.style.transform = 'translateY(-2px)';
  solveButton.onmouseout = () => solveButton.style.transform = 'translateY(0)';
  
  buttonsDiv.insertBefore(solveButton, buttonsDiv.firstChild);
  console.log('✅ Кнопка добавлена в интерфейс');

  solveButton.addEventListener('click', async () => {
    console.clear(); // Очищаем консоль перед новым запуском
    console.log('🎬 ЗАПУСК ОБРАБОТКИ ТЕСТА...');
    await solveQuestions();
  });
}

// Обработка картинок
async function urlToGenerativePart(url) {
  try {
    if (url.startsWith('file://')) {
        console.warn(`⚠️ Пропуск локальной картинки: ${url}`);
        return null; 
    }
    
    console.log(`📥 Загрузка изображения: ${url.substring(0, 50)}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ошибка HTTP ${response.status}`);
    
    const blob = await response.blob();
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    const base64Content = base64Data.split(',')[1];
    const mimeType = base64Data.substring(base64Data.indexOf(':') + 1, base64Data.indexOf(';'));

    return {
      inline_data: {
        mime_type: mimeType,
        data: base64Content
      }
    };
  } catch (error) {
    console.error('❌ Ошибка обработки картинки:', error);
    return null;
  }
}

// Парсинг вопросов
function extractQuestions() {
  console.group('🔍 Сканирование страницы...');
  const questions = [];
  const questionTables = document.querySelectorAll('table.question');

  console.log(`Найдено блоков с вопросами: ${questionTables.length}`);

  questionTables.forEach((questionTable, index) => {
    const questionTextElement = questionTable.querySelector('.text');
    if (!questionTextElement) return;

    let questionText = questionTextElement.innerText.replace(/\s+/g, ' ').trim();
    
    const images = [];
    questionTextElement.querySelectorAll('img').forEach(img => {
      if (img.src) images.push(img.src);
    });

    const answerTable = questionTable.nextElementSibling;
    if (!answerTable || !answerTable.classList.contains('answer')) return;

    const questionType = answerTable.dataset.qtype;
    const answers = [];

    const answerRows = answerTable.querySelectorAll('tr');
    answerRows.forEach(row => {
      const labelElement = row.querySelector('.num');
      const textElement = row.querySelector('.text');
      const input = row.querySelector('input');
      
      if (labelElement && input) {
        answers.push({
          id: labelElement.innerText.replace('.', '').trim(),
          text: textElement ? textElement.innerText.trim() : 'Без текста',
          element: input
        });
      }
    });

    const qObj = {
      number: index + 1,
      text: questionText,
      images: images,
      answers: answers,
      isMultiSelect: questionType === '2'
    };
    
    questions.push(qObj);
    console.log(`Вопрос #${index + 1} (${qObj.isMultiSelect ? 'Multi' : 'Single'}):`, qObj.text.substring(0, 50) + '...');
  });

  console.groupEnd();
  return questions;
}

// API запрос
async function askGemini(question, apiKey) {
  // Группируем логи для каждого вопроса отдельно
  console.groupCollapsed(`🧠 AI Request: Вопрос ${question.number}`);
  
  const promptText = `
Ты решаешь тест.
ВОПРОС: ${question.text}
${question.isMultiSelect ? '(Выбери ВСЕ верные варианты)' : '(Выбери ОДИН верный вариант)'}

ВАРИАНТЫ:
${question.answers.map(a => `${a.id}. ${a.text}`).join('\n')}

ВЕРНИ ТОЛЬКО JSON:
{"correct": ["A"]} или {"correct": ["A", "C"]}
`;

  console.log('%c📝 Сформированный промпт:', 'color: #29b6f6', promptText);

  const parts = [{ text: promptText }];

  if (question.images && question.images.length > 0) {
    console.log(`📷 Прикреплено изображений: ${question.images.length}`);
    for (const imgUrl of question.images) {
      const part = await urlToGenerativePart(imgUrl);
      if (part) parts.push(part);
    }
  }

  try {
    console.log(`📡 Отправка запроса к ${GEMINI_MODEL}...`);
    const startTime = Date.now();

    const response = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.0 
        }
      })
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️ Время ответа: ${duration}ms`);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Ошибка сервера:', response.status, errorText);
        console.groupEnd();
        throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    // Логируем сырой ответ от нейронки (очень полезно для отладки)
    console.log('📥 Raw Response from Gemini:', data);

    const resultText = data.candidates[0].content.parts[0].text;
    console.log('%c💡 Текстовый ответ модели:', 'color: #66bb6a', resultText);

    const result = JSON.parse(resultText);
    console.log('✅ Распаршенный JSON:', result);
    
    console.groupEnd(); // Закрываем группу
    return result.correct || [];

  } catch (error) {
    console.error('❌ Исключение в функции askGemini:', error);
    console.groupEnd();
    throw error;
  }
}

// Основной цикл
async function solveQuestions() {
  const button = document.getElementById('ai-solve-button');
  const originalValue = button.value;
  
  const storage = await chrome.storage.sync.get(['geminiApiKey']);
  if (!storage.geminiApiKey) {
    console.warn('⚠️ API Key не найден');
    alert('⚙️ Нет ключа! Установите в настройках расширения.');
    return;
  }

  const questions = extractQuestions();
  if (questions.length === 0) {
    console.error('❌ Вопросы не извлечены');
    alert('❌ Вопросы не найдены');
    return;
  }

  button.disabled = true;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    button.value = `🤔 Думаю над вопросом ${i + 1}/${questions.length}...`;
    
    if (i > 0) await new Promise(r => setTimeout(r, 1500));

    try {
        const correctIds = await askGemini(q, storage.geminiApiKey);

        if (correctIds.length > 0) {
          successCount++;
          q.answers.forEach(ans => {
            if (correctIds.includes(ans.id)) {
              console.log(`✏️ Выбор ответа на странице: %c${ans.id}`, 'font-weight:bold; color:blue;');
              if (!ans.element.checked) ans.element.click();
              
              const row = ans.element.closest('tr');
              if (row) {
                  row.style.backgroundColor = '#e8f5e9';
                  row.style.borderLeft = '5px solid #4caf50';
                  row.style.transition = 'background 0.5s';
              }
            }
          });
        } else {
            console.warn(`⚠️ Модель вернула пустой список ответов для вопроса ${q.number}`);
        }
    } catch (e) {
        errorCount++;
        console.error(`🔥 Критическая ошибка на вопросе ${i+1}:`, e);
        // Визуально помечаем ошибку на странице
        const qTable = document.querySelectorAll('table.question')[i];
        if(qTable) qTable.style.border = "2px solid red";
        
        if (e.message.includes('404')) {
            alert(`Модель ${GEMINI_MODEL} недоступна!`);
            break;
        }
    }
  }

  console.log(`%c🏁 ОБРАБОТКА ЗАВЕРШЕНА. Успешно: ${successCount}, Ошибок: ${errorCount}`, "font-size: 14px; font-weight: bold;");
  
  button.value = `✅ Готово: ${successCount}/${questions.length}`;
  setTimeout(() => {
    button.value = originalValue;
    button.disabled = false;
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addSolveButton);
} else {
  addSolveButton();
}
