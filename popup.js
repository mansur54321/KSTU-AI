document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Popup загружен');
  
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');
  const testButton = document.getElementById('testApi');

  console.log('Элементы:', { apiKeyInput, saveButton, statusDiv, testButton });

  if (!apiKeyInput || !saveButton || !statusDiv || !testButton) {
    console.error('❌ Не найдены элементы!');
    return;
  }

  // Загрузка сохраненного API ключа
  chrome.storage.sync.get(['geminiApiKey'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      showStatus('✅ API ключ загружен', 'success');
    }
  });

  // Сохранение API ключа
  saveButton.addEventListener('click', function() {
    console.log('💾 Нажата кнопка Сохранить');
    const apiKey = apiKeyInput.value.trim();
    
    console.log('API Key длина:', apiKey.length);
    
    if (!apiKey) {
      showStatus('❌ Пожалуйста, введите API ключ', 'error');
      return;
    }

    chrome.storage.sync.set({ geminiApiKey: apiKey }, function() {
      console.log('✅ API ключ сохранен в storage');
      showStatus('✅ API ключ успешно сохранен!', 'success');
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    });
  });

  // Тестирование API ключа
  testButton.addEventListener('click', async function() {
    console.log('🧪 Нажата кнопка Тест');
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('❌ Введите API ключ для тестирования', 'error');
      return;
    }

    testButton.disabled = true;
    testButton.textContent = '⏳ Тестирование...';
    showStatus('⏳ Проверка соединения с Gemini API...', 'info');

    console.log('🔄 Отправка тестового запроса...');

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Тест. Ответь одним словом: OK'
            }]
          }]
        })
      });

      console.log('📡 Статус ответа:', response.status);

      if (response.status === 403) {
        showStatus('❌ API ключ недействителен.\nПолучите новый ключ по ссылке выше.', 'error');
      } else if (response.status === 400) {
        const errorData = await response.json();
        console.error('Ошибка 400:', errorData);
        showStatus('❌ Неверный формат API ключа', 'error');
      } else if (response.ok) {
        const data = await response.json();
        console.log('✅ Ответ API:', data);
        if (data.candidates && data.candidates[0]) {
          showStatus('✅ API ключ работает!\nМожете использовать расширение.', 'success');
        } else {
          showStatus('⚠️ Получен ответ, но формат неожиданный', 'error');
        }
      } else {
        const errorText = await response.text();
        console.error('Ошибка:', errorText);
        showStatus(`❌ Ошибка: ${response.status}`, 'error');
      }
    } catch (error) {
      console.error('Test error:', error);
      showStatus('❌ Ошибка соединения.\nПроверьте интернет.', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = '🧪 Тест';
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }
});