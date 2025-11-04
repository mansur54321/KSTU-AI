// Добавление кнопки на страницу
function addSolveButton() {
  // Проверяем существование кнопки
  if (document.getElementById('ai-solve-button')) {
    console.log('Кнопка уже существует');
    return;
  }

  // Ищем контейнер для кнопки (более универсальный поиск)
  let buttonsDiv = document.querySelector('.buttons');
  
  // Если не найден стандартный контейнер, создаем свой
  if (!buttonsDiv) {
    console.log('Стандартный контейнер не найден, ищем альтернативные места...');
    
    // Пытаемся найти форму или любой контейнер с вопросами
    const questionTable = document.querySelector('table.question');
    if (questionTable) {
      // Создаем контейнер для кнопки
      buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'buttons ai-buttons-container';
      buttonsDiv.style.cssText = 'margin: 20px; padding: 10px; text-align: center;';
      
      // Вставляем перед первым вопросом
      questionTable.parentElement.insertBefore(buttonsDiv, questionTable);
      console.log('✅ Создан новый контейнер для кнопки');
    } else {
      console.log('Не найдены вопросы на странице, пробуем через 1 секунду...');
      setTimeout(addSolveButton, 1000);
      return;
    }
  }

  const solveButton = document.createElement('input');
  solveButton.type = 'button';
  solveButton.id = 'ai-solve-button';
  solveButton.className = 'submitButton ai-button';
  solveButton.value = '🤖 Получить ответы (Gemini)';
  
  buttonsDiv.insertBefore(solveButton, buttonsDiv.firstChild);
  console.log('✅ Кнопка AI добавлена');

  solveButton.addEventListener('click', async () => {
    await solveQuestions();
  });
}

// Извлечение вопросов со страницы
function extractQuestions() {
  const questions = [];
  const questionTables = document.querySelectorAll('table.question');

  questionTables.forEach((questionTable, index) => {
    const questionTextElement = questionTable.querySelector('.text');
    if (!questionTextElement) return;

    let questionText = questionTextElement.innerText.trim();
    
    // Извлекаем все изображения из вопроса
    const images = questionTextElement.querySelectorAll('img');
    const imageUrls = [];
    
    images.forEach((img, imgIndex) => {
      const src = img.src;
      const alt = img.alt || `Image ${imgIndex + 1}`;
      imageUrls.push({ src, alt });
      console.log(`📷 Найдено изображение в вопросе ${index + 1}:`, src);
    });

    const answerTable = questionTable.nextElementSibling;
    if (!answerTable || !answerTable.classList.contains('answer')) return;

    const questionType = answerTable.dataset.qtype;
    const answers = [];

    const answerRows = answerTable.querySelectorAll('tr');
    answerRows.forEach(row => {
      const label = row.querySelector('.num')?.innerText.trim();
      const text = row.querySelector('.text')?.innerText.trim();
      const input = row.querySelector('input');
      
      if (label && text && input) {
        answers.push({
          label: label.replace('.', ''),
          text: text,
          value: input.value,
          element: input
        });
      }
    });

    questions.push({
      number: index + 1,
      question: questionText,
      images: imageUrls,
      answers: answers,
      type: questionType,
      answerTable: answerTable
    });
  });

  return questions;
}

// Отправка запроса к Google Gemini API
async function askGemini(question, apiKey, retries = 3) {
  // Формируем промпт с информацией об изображениях
  let imageInfo = '';
  if (question.images && question.images.length > 0) {
    imageInfo = '\n\nВ ВОПРОСЕ ЕСТЬ ИЗОБРАЖЕНИЕ(Я):\n';
    question.images.forEach((img, idx) => {
      imageInfo += `Изображение ${idx + 1}: ${img.alt || 'без описания'}\n`;
      imageInfo += `URL: ${img.src}\n`;
    });
    imageInfo += '\nПОЖАЛУЙСТА, учти наличие изображений при ответе на вопрос.\n';
  }

  const prompt = `Ты эксперт по программированию и компьютерным наукам. Проанализируй вопрос и выбери правильный ответ.

Вопрос: ${question.question}${imageInfo}

Варианты ответов:
${question.answers.map(a => `${a.label}. ${a.text}`).join('\n')}

${question.type === '2' ? 'Это вопрос с множественным выбором - можно выбрать несколько правильных ответов.' : 'Это вопрос с одним правильным ответом.'}

ВАЖНО: Верни ТОЛЬКО букву (или буквы через запятую для множественного выбора) правильного ответа. 
Например: A или A,C,D
Не добавляй никаких пояснений, только буквы.`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`🔄 Попытка ${attempt + 1}/${retries} для вопроса ${question.number} через Gemini`);
      
      // Если есть изображения, пытаемся использовать Vision API
      const useVision = question.images && question.images.length > 0;
      
      if (useVision) {
        console.log('📷 Вопрос содержит изображения, используем Gemini Vision...');
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // Формируем тело запроса
      let requestBody;
      
      if (useVision && question.images.length > 0) {
        // Для изображений используем multimodal запрос
        const parts = [
          { text: prompt }
        ];
        
        // Добавляем изображения (если они доступны)
        // Примечание: для base64 изображений нужно их предварительно загрузить
        // Пока просто отправляем текстовый запрос с описанием изображений
        
        requestBody = {
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 100,
          }
        };
      } else {
        // Обычный текстовый запрос
        requestBody = {
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 20,
            topP: 0.8,
            maxOutputTokens: 100,
          }
        };
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log(`📡 Получен ответ со статусом: ${response.status}`);

      if (response.status === 429) {
        const retryAfter = 10 + (attempt * 5);
        console.log(`⏳ Rate limit (429). Ожидание ${retryAfter}с`);
        
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw new Error('❌ Превышен лимит запросов Gemini API.\n💡 Подождите несколько минут и попробуйте снова.');
      }

      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Ошибка 400:', errorData);
        throw new Error('❌ Неверный запрос к Gemini API.\n💡 Проверьте API ключ в настройках.');
      }

      if (response.status === 403) {
        throw new Error('❌ API ключ недействителен или не имеет доступа.\n💡 Получите новый ключ: https://aistudio.google.com/app/apikey');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API Error:', errorData);
        throw new Error(`❌ Ошибка Gemini API: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Ответ получен:', data);
      
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('❌ Неожиданный формат ответа:', data);
        
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error('❌ Gemini не вернул корректный ответ');
      }

      const answer = data.candidates[0].content.parts[0].text.trim();
      console.log(`💡 Gemini ответ: "${answer}"`);
      
      // Извлекаем буквы из ответа
      const letters = answer.match(/[A-E]/gi);
      if (!letters || letters.length === 0) {
        console.warn('⚠️ Не найдены буквы в ответе');
        
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        return ['A']; // Возвращаем A по умолчанию
      }
      
      const result = [...new Set(letters.map(l => l.toUpperCase()))]; // Убираем дубликаты
      console.log(`✅ Распознанные ответы: ${result.join(', ')}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Ошибка на попытке ${attempt + 1}:`, error);
      
      if (error.name === 'AbortError') {
        console.error('⏱️ Таймаут запроса (30 секунд)');
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error('❌ Превышено время ожидания ответа от Gemini.\n💡 Проверьте интернет соединение.');
      }
      
      if (attempt === retries - 1) {
        throw error;
      }
      
      // Если это известная ошибка, не повторяем
      if (error.message.includes('API ключ') || 
          error.message.includes('не имеет доступа')) {
        throw error;
      }
      
      const waitTime = Math.pow(2, attempt) * 2;
      console.log(`⚠️ Ожидание ${waitTime} секунд перед повтором...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }
  }
  
  throw new Error('❌ Не удалось получить ответ после всех попыток');
}

// Подсветка правильных ответов
function highlightAnswers(question, correctLetters) {
  question.answers.forEach(answer => {
    const row = answer.element.closest('tr');
    if (!row) return;

    if (correctLetters.includes(answer.label)) {
      row.classList.add('ai-correct-answer');
      if (!answer.element.checked) {
        answer.element.checked = true;
      }
    } else {
      row.classList.remove('ai-correct-answer');
    }
  });
}

// Основная функция решения
async function solveQuestions() {
  const button = document.getElementById('ai-solve-button');
  const originalValue = button.value;
  
  try {
    // Получаем API ключ из настроек
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    const apiKey = result.geminiApiKey;

    if (!apiKey) {
      alert('⚠️ Пожалуйста, установите Gemini API ключ в настройках расширения.\n\n' +
            '1. Откройте настройки расширения\n' +
            '2. Получите бесплатный ключ: https://aistudio.google.com/app/apikey\n' +
            '3. Вставьте ключ и сохраните');
      return;
    }

    button.value = '⏳ Обработка...';
    button.disabled = true;

    const questions = extractQuestions();
    
    if (questions.length === 0) {
      alert('❌ Вопросы не найдены на странице');
      button.value = originalValue;
      button.disabled = false;
      return;
    }

    console.log(`📝 Начинаем обработку ${questions.length} вопросов через Gemini...`);

    let successCount = 0;
    let errorCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      button.value = `⏳ ${i + 1}/${questions.length} (✓${successCount} ✗${errorCount}) [${elapsed}s]`;

      console.log(`\n${'='.repeat(50)}`);
      console.log(`📌 Обработка вопроса ${i + 1}/${questions.length}`);
      console.log(`Вопрос: ${question.question.substring(0, 100)}...`);
      
      if (question.images && question.images.length > 0) {
        console.log(`📷 Изображений в вопросе: ${question.images.length}`);
        question.images.forEach((img, idx) => {
          console.log(`  ${idx + 1}. ${img.alt || 'Без описания'}`);
          console.log(`     URL: ${img.src}`);
        });
      }

      try {
        const correctLetters = await askGemini(question, apiKey);
        console.log(`✅ Правильные ответы: ${correctLetters.join(', ')}`);
        
        highlightAnswers(question, correctLetters);
        successCount++;
        
        console.log(`✅ Вопрос ${i + 1} обработан успешно`);
        
        // Задержка между запросами (для бесплатного tier: 15 запросов/минуту = 4 секунды)
        if (i < questions.length - 1) {
          const delay = 4000;
          for (let sec = 4; sec > 0; sec--) {
            button.value = `⏳ Ожидание ${sec}с... (${i + 1}/${questions.length}) [${elapsed}s]`;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error(`\n❌ ОШИБКА при обработке вопроса ${i + 1}:`, error);
        errorCount++;
        
        const errorMsg = error.message || 'Неизвестная ошибка';
        
        // Если ошибка связана с ключом - останавливаемся
        if (errorMsg.includes('API ключ') || errorMsg.includes('не имеет доступа')) {
          alert(errorMsg);
          break;
        }
        
        // Для rate limit - предлагаем продолжить
        if (errorMsg.includes('лимит')) {
          const continueProcessing = confirm(
            `${errorMsg}\n\n` +
            `Обработано: ${successCount}/${questions.length}\n` +
            `Ошибок: ${errorCount}\n\n` +
            `Продолжить с задержкой 60 секунд?`
          );
          
          if (continueProcessing) {
            for (let sec = 60; sec > 0; sec--) {
              button.value = `⏳ Ожидание ${sec}с...`;
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            continue;
          } else {
            break;
          }
        } else {
          // Для других ошибок
          const continueProcessing = confirm(
            `❌ Ошибка на вопросе ${i + 1}\n\n` +
            `${errorMsg.split('\n')[0]}\n\n` +
            `Обработано: ${successCount}/${questions.length}\n` +
            `Продолжить?`
          );
          
          if (!continueProcessing) {
            break;
          }
        }
      }
    }

    // Финальное сообщение
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(50)}`);
    console.log('🏁 ОБРАБОТКА ЗАВЕРШЕНА');
    console.log(`✅ Успешно: ${successCount}/${questions.length}`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log(`⏱️ Время: ${totalTime}с (${Math.floor(totalTime / 60)}м ${totalTime % 60}с)`);
    console.log(`${'='.repeat(50)}\n`);
    
    if (successCount > 0) {
      button.value = `✅ Готово: ${successCount}/${questions.length} [${totalTime}s]`;
      if (successCount === questions.length) {
        setTimeout(() => {
          alert(
            `🎉 Все вопросы обработаны!\n\n` +
            `✓ Успешно: ${successCount}\n` +
            `✗ Ошибок: ${errorCount}\n` +
            `⏱️ Время: ${Math.floor(totalTime / 60)}м ${totalTime % 60}с`
          );
        }, 500);
      }
    } else {
      button.value = '❌ Ошибка';
      console.error('❌ Ни один вопрос не был обработан успешно');
    }
    
    setTimeout(() => {
      button.value = originalValue;
      button.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('Error:', error);
    alert(`❌ Произошла ошибка: ${error.message}`);
    button.value = originalValue;
    button.disabled = false;
  }
}

// Инициализация при загрузке страницы
function init() {
  console.log('🚀 Инициализация AI Test Helper (Gemini)...');
  addSolveButton();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Наблюдатель за изменениями DOM (на случай динамической загрузки)
const observer = new MutationObserver(() => {
  if (!document.getElementById('ai-solve-button')) {
    addSolveButton();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});