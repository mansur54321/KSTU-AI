# Changelog

All notable changes to the KSTU AI Chrome Extension will be documented in this file.

## [2.6] - 2024-11-24

### Added
- **Statistics Tracking**: Real-time tracking of questions solved, API calls, and cache hits
- **Question Caching System**: Intelligent caching to reduce API usage and improve response time
  - Smart question hashing algorithm
  - Persistent cache in local storage
  - Toggle to enable/disable caching
  - Cache hit statistics
- **Customizable Settings Panel**: User-configurable options
  - Adjustable delay between questions (0-10000ms)
  - Custom marker color picker
  - Cache enable/disable toggle
  - Settings persist across sessions
- **Dark Mode**: Toggle between light and dark themes
  - Preference persistence
  - Moon icon (🌙) toggle button
  - Improved readability in low-light conditions
- **Export/Import Configuration**: 
  - Export settings to JSON file (excluding API key for security)
  - Import settings from backup
  - Useful for configuration sharing and migration
- **Reset Statistics**: One-click reset for all statistics and cache
- **Testing Infrastructure**:
  - test-page.html for local testing
  - TESTING.md with comprehensive testing guide
- **Project Files**:
  - .gitignore for better version control
  - CHANGELOG.md for tracking changes

### Changed
- Updated manifest version from 2.5 to 2.6
- Enhanced UI in popup.html with statistics and settings sections
- Improved popup.js with settings management and data handling
- Enhanced content.js with caching logic and statistics tracking
- Updated README.md with new features documentation

### Fixed
- Improved hash function for better collision resistance
- Added error handling for storage API failures
- Enhanced error messages for better user feedback
- Improved confirmation dialogs for better accessibility

### Security
- Export function now excludes API key to prevent accidental exposure
- Added input validation for imported settings
- No security vulnerabilities detected by CodeQL

## [2.5] - Previous Version

### Features
- Google Gemini 2.5 Pro integration with fallback to Gemini 2.5 Flash
- Stealth mode with minimal UI changes
- Anti-cheat bypass (text selection, right-click, copy/paste)
- Hotkey support (Alt+S for all questions, Alt+Click for single question)
- Image recognition in questions and answers
- Visual debug logging in console
- Tooltip explanations for answers

---

## How to Use This Changelog

- **[Version]** indicates the release version number
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for security-related changes
