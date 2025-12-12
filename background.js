// Фоновый скрипт для обработки событий расширения

chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Test Helper установлен');
});

// Обработка сообщений от content script (если понадобится)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkApiKey') {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      sendResponse({ hasKey: !!result.geminiApiKey });
    });
    return true;
  }
});
