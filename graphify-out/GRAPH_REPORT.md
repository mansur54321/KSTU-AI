# Graph Report - KSTU-AI  (2026-07-27)

## Corpus Check
- 11 files · ~9,136 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 150 nodes · 253 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2457e1bf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `processQuestion()` - 11 edges
2. `start()` - 11 edges
3. `init()` - 11 edges
4. `cacheLookup()` - 9 edges
5. `Gemini Stealth Solver (Chrome Extension)` - 9 edges
6. `askGeminiViaApi()` - 8 edges
7. `hashQuestion()` - 8 edges
8. `cacheFromAttemptView()` - 8 edges
9. `solveAndNext()` - 8 edges
10. `showStealthNotify()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `askGeminiViaApi()` --calls--> `getGenerationConfig()`  [INFERRED]
  src/background/background.js → src/config.js
- `processQuestion()` --calls--> `cacheLookup()`  [INFERRED]
  src/content/content.js → src/content/cache.js
- `processQuestion()` --calls--> `cacheStoreFromResult()`  [INFERRED]
  src/content/content.js → src/content/cache.js
- `init()` --calls--> `cacheFromAttemptView()`  [INFERRED]
  src/content/content.js → src/content/cache.js

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (31): askGeminiViaBackground(), askGeminiWithProFallback(), askGeminiWithRetry(), buildApiParts(), checkEnabled(), clickConfirmDialog(), extractQuestions(), finishTest() (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.24
Nodes (22): answerIdentity(), answerTextsToCurrentIds(), cacheFromAttemptView(), cacheKeys(), cacheLookup(), cacheStore(), cacheStoreFromResult(), collectImageTokens() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (20): action, default_icon, default_popup, default_title, background, service_worker, content_scripts, 128 (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.21
Nodes (18): askGeminiViaApi(), base64ToArrayBuffer(), cacheSignaturePayload(), checkForUpdates(), compareVersions(), describeParts(), errorMessage(), extractGeminiJson() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (16): Gemini Stealth Solver (Chrome Extension), Дисклеймер, Искусственный интеллект, Как использовать, Настройка, Обход защиты (Anti-Cheat), Основные возможности, Отладка (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.20
Nodes (9): Architecture Improvement Plan, Completed first step, Current shape, P0: Protect secrets and remote data, P1: Deepen runtime modules, P1: Expand behavior tests, P2: Release and maintenance, Prioritized roadmap (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.24
Nodes (4): checkUpdateStatus(), displayUpdateInfo(), parseApiKeys(), renderKeysInput()

### Community 7 - "Community 7"
Cohesion: 0.36
Nodes (6): getFallbackModels(), getGenerationConfig(), selectModels(), assert, {
    CONFIG,
    selectModels,
    getFallbackModels,
    getGenerationConfig
}, test

### Community 8 - "Community 8"
Cohesion: 0.40
Nodes (4): name, private, scripts, test

## Knowledge Gaps
- **45 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `permissions` (+40 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `processQuestion()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `init()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `cacheFromAttemptView()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `processQuestion()` (e.g. with `cacheLookup()` and `cacheStoreFromResult()`) actually correct?**
  _`processQuestion()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _45 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13781512605042018 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._