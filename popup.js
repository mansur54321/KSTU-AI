document.addEventListener('DOMContentLoaded', function() {
  const apiProviderSelect = document.getElementById('apiProvider');
  const geminiSection = document.getElementById('geminiSection');
  const openrouterSection = document.getElementById('openrouterSection');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const openrouterApiKeyInput = document.getElementById('openrouterApiKey');
  const saveButton = document.getElementById('save');
  const testButton = document.getElementById('testApi');
  const statusDiv = document.getElementById('status');

  if (!apiProviderSelect || !saveButton || !testButton || !geminiApiKeyInput || !openrouterApiKeyInput || !geminiSection || !openrouterSection) return;

  // Load saved settings
  chrome.storage.sync.get(['geminiApiKey', 'openrouterApiKey', 'apiProvider'], function(result) {
    if (result.geminiApiKey && geminiApiKeyInput) geminiApiKeyInput.value = result.geminiApiKey;
    if (result.openrouterApiKey && openrouterApiKeyInput) openrouterApiKeyInput.value = result.openrouterApiKey;
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
      toggleProviderSection(result.apiProvider);
    }
  });

  // Toggle provider sections
  function toggleProviderSection(provider) {
    if (provider === 'openrouter') {
      geminiSection.style.display = 'none';
      openrouterSection.style.display = 'block';
    } else {
      geminiSection.style.display = 'block';
      openrouterSection.style.display = 'none';
    }
  }

  apiProviderSelect.addEventListener('change', function() {
    toggleProviderSection(this.value);
  });

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }

  function validateApiKey(provider, geminiKey, openrouterKey) {
    if (provider === 'gemini' && !geminiKey) {
      showStatus('Введите Gemini ключ!', 'error');
      return false;
    }
    if (provider === 'openrouter' && !openrouterKey) {
      showStatus('Введите OpenRouter ключ!', 'error');
      return false;
    }
    return true;
  }

  saveButton.addEventListener('click', function() {
    const provider = apiProviderSelect.value;
    const geminiKey = geminiApiKeyInput.value.trim();
    const openrouterKey = openrouterApiKeyInput.value.trim();
    
    if (!validateApiKey(provider, geminiKey, openrouterKey)) {
      return;
    }

    const settings = {
      apiProvider: provider,
      geminiApiKey: geminiKey,
      openrouterApiKey: openrouterKey
    };

    chrome.storage.sync.set(settings, function() {
      showStatus('✅ Сохранено', 'success');
      setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
    });
  });

  // Test API
  testButton.addEventListener('click', async function() {
    const provider = apiProviderSelect.value;
    const geminiKey = geminiApiKeyInput.value.trim();
    const openrouterKey = openrouterApiKeyInput.value.trim();

    if (!validateApiKey(provider, geminiKey, openrouterKey)) {
      return;
    }

    testButton.disabled = true;
    testButton.textContent = '⏳ Проверка...';

    try {
      if (provider === 'gemini') {
        await testGemini(geminiKey);
      } else {
        await testOpenRouter(openrouterKey);
      }
    } catch (error) {
      showStatus('❌ Ошибка сети', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = '🧪 Тест API';
    }
  });

  async function testGemini(apiKey) {
    showStatus('Запрос к gemini-2.5-pro...', 'loading');
    
    const MODEL = 'gemini-2.5-pro';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello" }] }]
      })
    });

    if (response.ok) {
      showStatus('✅ Успех! Gemini 2.5 Pro доступна.', 'success');
    } else {
      const errorText = await response.text();
      console.error('Error:', errorText);
      let msg = `Ошибка ${response.status}`;
      if (response.status === 404) msg += ': Модель не найдена';
      showStatus(`❌ ${msg}`, 'error');
    }
  }

  async function testOpenRouter(apiKey) {
    showStatus('Запрос к OpenRouter...', 'loading');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      })
    });

    if (response.ok) {
      showStatus('✅ Успех! OpenRouter доступен.', 'success');
    } else {
      const errorText = await response.text();
      console.error('Error:', errorText);
      showStatus(`❌ Ошибка ${response.status}`, 'error');
    }
  }
});
