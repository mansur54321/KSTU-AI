# Architecture Improvement Plan

## Current shape

- `src/config.js` is the shared configuration and model-policy module.
- `src/background/background.js` owns external requests, update checks, logs, and remote cache access.
- `src/content/content.js` currently combines platform detection, question extraction, request orchestration, answer application, navigation, and UI notifications.
- `src/content/cache.js` combines cache identity, local persistence, remote transport, and result-page parsing.
- `src/popup/popup.js` combines settings state, key parsing, import/export, update checks, and rendering.

The code graph identifies `processQuestion()`, `start()`, and `init()` as the highest-coupling nodes with 11 edges each. The main content-script community has low cohesion (~0.14), so the next refactor should reduce responsibilities in those three functions rather than add more branches to them.

## Completed first step

- Centralized model IDs, fallback order, validation model, and generation options in `src/config.js`.
- Added behavior tests for basic, Pro, priority, fallback, validation, and deprecated generation parameters.
- Added CI checks for tests, JavaScript syntax, and manifest validity.

## Prioritized roadmap

### P0: Protect secrets and remote data

1. Move Gemini keys from `chrome.storage.sync` to `chrome.storage.local` with a one-time migration.
2. Exclude API keys from settings exports unless the user explicitly opts in.
3. Move stats/cache endpoints to HTTPS.
4. Remove the shared cache write token from the extension. Authenticate and validate writes server-side.

### P1: Deepen runtime modules

1. Extract a Gemini client module with one interface for validation and structured generation. Inject `fetch` in tests.
2. Split platform extraction into Moodle, Platonus, and Univer adapters that return one normalized question shape.
3. Make `processQuestion()` an orchestrator over cache, Gemini client, and answer application instead of implementing all three concerns.
4. Reduce `start()` to batch policy and progress reporting, and reduce `init()` to lifecycle/event wiring.
5. Keep solving orchestration independent from DOM extraction and DOM answer application.
6. Split cache identity from local and remote cache adapters. Keep signature verification inside the remote adapter.
7. Replace the background message `if` chain with a small action router that validates request shapes.

### P1: Expand behavior tests

1. Test Gemini request construction and retry classification with a fake fetch adapter.
2. Test cache hashing and legacy-key migration as pure behavior.
3. Test API-key parsing, masking, import allowlisting, and export redaction.
4. Add HTML fixtures for each supported platform and verify normalized question extraction.

### P2: Release and maintenance

1. Use one version source and verify that the Git tag matches `manifest.json` before release.
2. Add release notes generation from commits or a maintained changelog.
3. Add a browser smoke test that loads the unpacked extension and opens the popup.
4. Document storage fields and message action payloads.

## Target module seams

- Model policy: `selectModels(options)`, `getFallbackModels()`, `getGenerationConfig()`.
- Gemini client: `validateKey(key)`, `generateStructured(parts, models, keys)`.
- Platform adapter: `extractQuestions(document) -> Question[]`.
- Answer application: `applyAnswer(question, result, settings)`.
- Cache: `lookup(question)`, `store(question, answer)`.
