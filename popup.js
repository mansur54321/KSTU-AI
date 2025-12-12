document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('save');
  const testButton = document.getElementById('testApi');
  const statusDiv = document.getElementById('status');

  if (!apiKeyInput || !saveButton || !testButton) return;

  chrome.storage.sync.get(['geminiApiKey'], function(result) {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }

  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Введите ключ!', 'error');
      return;
    }
    chrome.storage.sync.set({ geminiApiKey: apiKey }, function() {
      showStatus('✅ Сохранено', 'success');
      setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
    });
  });

  // Кнопка показа/скрытия ключа
  const toggleButton = document.getElementById('toggleKey');
  if (toggleButton) {
    toggleButton.addEventListener('click', function() {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleButton.textContent = '🙈';
        toggleButton.title = 'Скрыть ключ';
        toggleButton.setAttribute('aria-label', 'Скрыть ключ');
        toggleButton.setAttribute('aria-pressed', 'true');
      } else {
        apiKeyInput.type = 'password';
        toggleButton.textContent = '👁️';
        toggleButton.title = 'Показать ключ';
        toggleButton.setAttribute('aria-label', 'Показать ключ');
        toggleButton.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // ТЕСТ GEMINI 2.5 FLASH
  testButton.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Нет ключа', 'error');
      return;
    }

    testButton.disabled = true;
    testButton.textContent = '⏳ Проверка...';
    showStatus('Запрос к gemini-2.5-FLASH...', 'loading');

    try {
      const MODEL = 'gemini-2.5-flash'; // Быстрая модель
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello" }] }]
        })
      });

      if (response.ok) {
        showStatus('✅ Успех! Gemini 2.5 Flash доступна.', 'success');
      } else {
        const errorText = await response.text();
        console.error('Error:', errorText);
        let msg = `Ошибка ${response.status}`;
        if (response.status === 404) msg += ': Модель не найдена';
        else if (response.status === 401) msg += ': Неверный API ключ';
        else if (response.status === 403) msg += ': Доступ запрещен';
        else if (response.status === 429) msg += ': Превышен лимит запросов';
        else if (response.status === 503) msg += ': Сервис временно недоступен';
        showStatus(`❌ ${msg}`, 'error');
      }
    } catch (error) {
      showStatus('❌ Ошибка сети', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = '🧪 Тест';
    }
  });
});
