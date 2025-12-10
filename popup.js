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

  // ТЕСТ именно GEMINI 2.5 PRO
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
      const MODEL = 'gemini-2.5-flash'; // Строго 2.5 Pro
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello" }] }]
        })
      });

      if (response.ok) {
        showStatus('✅ Успех! Gemini 2.5 flash доступна.', 'success');
      } else {
        const errorText = await response.text();
        console.error('Error:', errorText);
        let msg = `Ошибка ${response.status}`;
        if (response.status === 404) msg += ': Модель не найдена (проверьте доступ)';
        showStatus(`❌ ${msg}`, 'error');
      }
    } catch (error) {
      showStatus('❌ Ошибка сети', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = '🧪 Тест API';
    }
  });
});
