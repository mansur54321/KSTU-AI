# Testing Guide for KSTU AI Extension

## Overview
This document describes how to test the new features added to the KSTU AI Chrome extension.

## New Features to Test

### 1. Statistics Tracking
**Location:** Extension popup - "📊 Статистика" section

**Test Steps:**
1. Open the extension popup
2. Verify the statistics section shows:
   - Решено вопросов: 0
   - API запросов: 0
   - Использовано кэша: 0
3. Open test-page.html in Chrome
4. Press Alt+S to solve all questions
5. Return to extension popup
6. Verify statistics have increased appropriately

**Expected Results:**
- Questions solved counter increases
- API calls counter increases
- Counters persist after closing and reopening popup

### 2. Question Caching
**Location:** Extension popup - Settings section, "Включить кэширование вопросов" checkbox

**Test Steps:**
1. Enable caching in settings (checkbox should be checked)
2. Open test-page.html
3. Press Alt+S to solve all questions (this will make API calls)
4. Reload the page
5. Press Alt+S again to solve the same questions
6. Check extension popup statistics

**Expected Results:**
- First run: API calls = 3, Cache hits = 0
- Second run: API calls = 3 (unchanged), Cache hits = 3
- Third run: API calls = 3 (unchanged), Cache hits = 6

### 3. Customizable Settings

#### A. Delay Between Questions
**Location:** Extension popup - Settings section

**Test Steps:**
1. Set delay to 2000ms (2 seconds)
2. Save settings
3. Open test-page.html
4. Press Alt+S
5. Observe the delay between solving each question

**Expected Results:**
- Visible 2-second pause between questions
- Status indicator shows "Thinking Q1...", "Thinking Q2..." etc. with 2s delays

#### B. Marker Color
**Location:** Extension popup - Settings section

**Test Steps:**
1. Click the color picker
2. Select a bright color (e.g., red #ff0000)
3. Save settings
4. Open test-page.html
5. Press Alt+S
6. Check the bullet markers (•) next to correct answers

**Expected Results:**
- Markers appear in the selected color
- Markers are visible next to correct answers

### 4. Dark Mode
**Location:** Extension popup - 🌙 button

**Test Steps:**
1. Open extension popup
2. Click the 🌙 button
3. Verify dark theme is applied
4. Close and reopen popup
5. Verify dark theme persists
6. Click 🌙 again to toggle back to light mode

**Expected Results:**
- UI switches between light and dark themes
- Preference persists across sessions
- All elements are readable in both modes

### 5. Export/Import Settings
**Location:** Extension popup - Settings section

#### Export
**Test Steps:**
1. Configure custom settings:
   - Set delay to 3000ms
   - Choose custom marker color
   - Enable/disable cache
2. Click "📤 Экспорт"
3. Save the JSON file

**Expected Results:**
- File downloads as "kstu-ai-settings.json"
- File contains all settings in JSON format
- Success message appears

#### Import
**Test Steps:**
1. Change all settings to different values
2. Click "📥 Импорт"
3. Select the previously exported JSON file
4. Verify settings are restored

**Expected Results:**
- All settings match the exported values
- UI updates to reflect imported settings
- Success message appears

### 6. Reset Statistics
**Location:** Extension popup - Statistics section

**Test Steps:**
1. Solve some questions to accumulate statistics
2. Click "Сбросить статистику"
3. Confirm the dialog
4. Verify all counters reset to 0

**Expected Results:**
- All statistics counters show 0
- Cache is cleared
- Success message appears

## Manual Testing with Real API

### Prerequisites
1. Valid Google Gemini API key
2. Chrome browser with extension installed in developer mode

### Test Procedure
1. Install extension:
   - Open Chrome
   - Go to chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the KSTU-AI directory

2. Configure API key:
   - Click extension icon
   - Paste your API key
   - Click "Сохранить"
   - Click "🧪 Тест" to verify

3. Test functionality:
   - Open test-page.html as file://
   - Press Alt+S to solve all questions
   - Verify markers appear next to answers
   - Hover over markers to see AI explanations

4. Test statistics:
   - Open extension popup
   - Verify counters have updated
   - Solve questions again
   - Check cache hits increase

5. Test settings:
   - Modify delay, color, cache settings
   - Save and test behavior changes
   - Export settings
   - Reset to defaults
   - Import settings back

## Known Limitations

1. The test-page.html is a simplified demo - real behavior may vary on actual KSTU pages
2. Caching is based on question text hash - identical questions with different images may not cache correctly
3. Statistics and cache use browser storage - clearing browser data will reset them

## Troubleshooting

**Problem:** Statistics don't update
- **Solution:** Check browser console for errors, ensure chrome.storage permissions are granted

**Problem:** Cache doesn't work
- **Solution:** Verify "Включить кэширование" is checked, check browser storage quota

**Problem:** Settings don't persist
- **Solution:** Check if chrome.storage.sync is available, try using a different Chrome profile

**Problem:** Extension doesn't work on test page
- **Solution:** Ensure file:// URLs are allowed for the extension in chrome://extensions/
