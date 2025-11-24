document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('save');
  const testButton = document.getElementById('testApi');
  const statusDiv = document.getElementById('status');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const delayInput = document.getElementById('delayBetweenQuestions');
  const markerColorInput = document.getElementById('markerColor');
  const enableCacheCheckbox = document.getElementById('enableCache');
  const resetStatsButton = document.getElementById('resetStats');
  const exportSettingsButton = document.getElementById('exportSettings');
  const importSettingsButton = document.getElementById('importSettings');

  if (!apiKeyInput || !saveButton || !testButton) return;

  // Load settings and statistics
  chrome.storage.sync.get(['geminiApiKey', 'darkMode', 'delayBetweenQuestions', 'markerColor', 'enableCache'], function(result) {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    if (result.darkMode) document.body.classList.add('dark-mode');
    if (result.delayBetweenQuestions !== undefined) delayInput.value = result.delayBetweenQuestions;
    if (result.markerColor) markerColorInput.value = result.markerColor;
    if (result.enableCache !== undefined) enableCacheCheckbox.checked = result.enableCache;
  });

  // Load statistics
  chrome.storage.local.get(['stats'], function(result) {
    const stats = result.stats || { questionsSolved: 0, apiCalls: 0, cacheHits: 0 };
    updateStatsDisplay(stats);
  });

  function updateStatsDisplay(stats) {
    document.getElementById('statQuestions').textContent = stats.questionsSolved || 0;
    document.getElementById('statApiCalls').textContent = stats.apiCalls || 0;
    document.getElementById('statCacheHits').textContent = stats.cacheHits || 0;
  }

  function showStatus(text, type) {
    statusDiv.textContent = text;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
  }

  // Dark mode toggle
  darkModeToggle.addEventListener('click', function() {
    const isDark = document.body.classList.toggle('dark-mode');
    chrome.storage.sync.set({ darkMode: isDark });
  });

  // Save settings
  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Введите ключ!', 'error');
      return;
    }
    
    const settings = {
      geminiApiKey: apiKey,
      delayBetweenQuestions: parseInt(delayInput.value) || 1000,
      markerColor: markerColorInput.value,
      enableCache: enableCacheCheckbox.checked
    };

    chrome.storage.sync.set(settings, function() {
      showStatus('✅ Сохранено', 'success');
      setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
    });
  });

  // Reset statistics
  resetStatsButton.addEventListener('click', function() {
    if (confirm('Сбросить всю статистику?')) {
      const emptyStats = { questionsSolved: 0, apiCalls: 0, cacheHits: 0 };
      chrome.storage.local.set({ stats: emptyStats, questionCache: {} }, function() {
        updateStatsDisplay(emptyStats);
        showStatus('✅ Статистика сброшена', 'success');
        setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
      });
    }
  });

  // Export settings
  exportSettingsButton.addEventListener('click', function() {
    chrome.storage.sync.get(null, function(settings) {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kstu-ai-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      showStatus('✅ Настройки экспортированы', 'success');
      setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
    });
  });

  // Import settings
  importSettingsButton.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const settings = JSON.parse(event.target.result);
          chrome.storage.sync.set(settings, function() {
            // Reload UI
            if (settings.geminiApiKey) apiKeyInput.value = settings.geminiApiKey;
            if (settings.delayBetweenQuestions !== undefined) delayInput.value = settings.delayBetweenQuestions;
            if (settings.markerColor) markerColorInput.value = settings.markerColor;
            if (settings.enableCache !== undefined) enableCacheCheckbox.checked = settings.enableCache;
            if (settings.darkMode) document.body.classList.add('dark-mode');
            
            showStatus('✅ Настройки импортированы', 'success');
            setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
          });
        } catch (error) {
          showStatus('❌ Ошибка чтения файла', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
    showStatus('Запрос к gemini-2.5-pro...', 'loading');

    try {
      const MODEL = 'gemini-2.5-pro'; // Строго 2.5 Pro
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
