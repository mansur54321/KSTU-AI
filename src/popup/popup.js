document.addEventListener('DOMContentLoaded', function() {
  const keysInput = document.getElementById('apiKeysInput');
  const saveButton = document.getElementById('save');
  const checkButton = document.getElementById('check');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('checkResults');
  const progressFill = document.getElementById('keyProgress');
  const countText = document.getElementById('keyCountText');

  function updateUI(keys) {
    const count = keys.length;
    const percentage = Math.min((count / 10) * 100, 100);
    progressFill.style.width = `${percentage}%`;
    
    if (count === 0) progressFill.style.background = '#eee';
    else if (count < 3) progressFill.style.background = '#ff5722';
    else progressFill.style.background = '#4caf50';

    countText.textContent = `${count} ключей`;
  }

  // Load
  chrome.storage.sync.get(['geminiApiKeys'], function(result) {
    if (result.geminiApiKeys && Array.isArray(result.geminiApiKeys)) {
      keysInput.value = result.geminiApiKeys.join('\n');
      updateUI(result.geminiApiKeys);
    }
  });

  // Input Monitor
  keysInput.addEventListener('input', () => {
    const raw = keysInput.value.split('\n').map(k => k.trim()).filter(k => k.length > 10);
    updateUI(raw);
  });

  // Save
  saveButton.addEventListener('click', function() {
    const keys = keysInput.value.split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 20);

    if (keys.length === 0) {
      statusDiv.textContent = '❌ Нет ключей!';
      statusDiv.style.display = 'block';
      return;
    }

    chrome.storage.sync.set({ geminiApiKeys: keys }, function() {
      statusDiv.textContent = `✅ Сохранено ${keys.length} шт.`;
      statusDiv.style.display = 'block';
      setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
    });
  });

  // Checker
  checkButton.addEventListener('click', async function() {
    const keys = keysInput.value.split('\n').map(k => k.trim()).filter(k => k.length > 20);
    if (keys.length === 0) return;

    resultsDiv.innerHTML = '<div style="text-align:center">⏳ Проверка...</div>';
    checkButton.disabled = true;

    let html = '';
    let validCount = 0;

    for (const key of keys) {
        const masked = key.substring(0, 8) + '...';
        try {
            // Тестовый запрос к 2.5-flash (быстрая)
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] })
            });
            
            if (res.ok) {
                validCount++;
                html += `<div class="key-row"><span>${masked}</span><span class="key-ok">OK ✅</span></div>`;
            } else {
                html += `<div class="key-row"><span>${masked}</span><span class="key-bad">ERR ❌</span></div>`;
            }
        } catch (e) {
            html += `<div class="key-row"><span>${masked}</span><span class="key-bad">NET ⚠️</span></div>`;
        }
    }

    resultsDiv.innerHTML = html;
    checkButton.disabled = false;
    statusDiv.textContent = `Рабочих: ${validCount} из ${keys.length}`;
    statusDiv.style.display = 'block';
  });
});