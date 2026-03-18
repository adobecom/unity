# Shareable Prompt Bar Integration - Production Architecture

> **Document Version:** 1.0  
> **Last Updated:** January 30, 2026  
> **Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current POC Analysis](#2-current-poc-analysis)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Configuration Strategy](#4-configuration-strategy)
5. [File Structure](#5-file-structure)
6. [Implementation Details](#6-implementation-details)
7. [Authorable Configurations](#7-authorable-configurations)
8. [Performance Considerations](#8-performance-considerations)
9. [Event Flow & Validation](#9-event-flow--validation)
10. [Migration Path](#10-migration-path)
11. [Rollback Strategy](#11-rollback-strategy)
12. [Appendix](#appendix)

---

## 1. Executive Summary

### 1.1 Objective

Integrate the shareable `firefly-prompt-bar-app` web component as an alternative to the legacy custom prompt bar implementation, with a feature flag controlled via authoring.

### 1.2 Key Decisions

| Decision | Approach | Rationale |
|----------|----------|-----------|
| Feature Toggle | Class name `shareable-prompt-bar` in authored document | Easy author control, no code deploy needed |
| Code Separation | New file `shareable-prompt-bar.js` | Easy cleanup when legacy is deprecated |
| Config Management | Hybrid: Excel for dynamic values, JSON for static defaults | Flexibility + safety |
| Models List | Authorable via Excel | Enables quick updates without code changes |

### 1.3 Benefits

- **Unified Experience**: Same prompt bar across Adobe properties
- **Reduced Maintenance**: Component maintained by Firefly team
- **Feature Parity**: Automatic access to new features
- **Easy Rollback**: Author-controlled feature flag

---

## 2. Current POC Analysis

### 2.1 Changes Made

#### widget.js

| Change | Purpose | Production Ready |
|--------|---------|------------------|
| `prefetchFireflyHub()` | Preconnect to Firefly origin | ✅ Yes |
| `prefetchHubWithErrorCapture()` | Detect network errors for analytics | ✅ Yes |
| `initFireflyPromptBar()` | Initialize web component | ⚠️ Needs refactoring |
| `getPromptBarSettingsConfig()` | Hardcoded config with theme check | ❌ Move to config |
| `setupFireflyPromptBarEvents()` | Event bridging to widgetWrap | ✅ Yes |
| `handleSettingInteract()` focus/blur | CSS class toggle for styling | ✅ Yes |

#### action-binder.js

| Change | Purpose | Production Ready |
|--------|---------|------------------|
| `firefly-prompt-validate` listener | Intercept validation before redirect | ✅ Yes |
| `handlePromptValidate()` | Validate + stopPropagation on error | ✅ Yes |
| `validateInput()` | 750 character limit check | ✅ Yes |

### 2.2 Issues to Address

| Issue | Current State | Required Change |
|-------|---------------|-----------------|
| Feature flag | `if (true)` hardcoded | Read from authoring class |
| Config location | Hardcoded in `getPromptBarSettingsConfig()` | Move to config file |
| Script URLs | Static constants | Centralize in config |
| Code separation | Mixed in widget.js | Separate file for cleanup |

---

## 3. Proposed Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHORING LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Excel Sheet    │  │  Class Names    │  │  target-config  │              │
│  │  (models, etc)  │  │  (feature flag) │  │  .json          │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONFIGURATION LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    prompt-bar-config.js                              │    │
│  │  • Merges Excel + JSON configs                                       │    │
│  │  • Resolves environment-specific values                              │    │
│  │  • Provides validated configuration                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WIDGET LAYER                                      │
│  ┌────────────────────────┐          ┌────────────────────────┐             │
│  │      widget.js         │          │ shareable-prompt-bar.js │◄── NEW     │
│  │  (orchestrator)        │          │ (encapsulated logic)    │             │
│  │                        │          │                         │             │
│  │  • Feature flag check  │─────────►│ • Web component init    │             │
│  │  • Delegates to impl   │          │ • Event setup           │             │
│  │  • Legacy fallback     │          │ • Prefetch logic        │             │
│  └────────────────────────┘          └────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ACTION LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      action-binder.js                                │    │
│  │  • Listens to unified events (firefly-*)                            │    │
│  │  • Handles validation, analytics, errors                            │    │
│  │  • Agnostic to prompt bar implementation                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **widget.js** | Orchestration, feature flag detection, delegation |
| **shareable-prompt-bar.js** | Web component lifecycle, event bridging, prefetch |
| **prompt-bar-config.js** | Configuration parsing, merging, validation |
| **action-binder.js** | Business logic, validation, analytics (unchanged) |

---

## 4. Configuration Strategy

### 4.1 Configuration Hierarchy

```
Priority (highest to lowest):
┌─────────────────────────────────────────┐
│ 1. Excel Sheet (runtime, authorable)   │  ◄── Authors can override
├─────────────────────────────────────────┤
│ 2. target-config.json (per-block)      │  ◄── Block-specific defaults
├─────────────────────────────────────────┤
│ 3. prompt-bar-config.js (code)         │  ◄── System defaults
└─────────────────────────────────────────┘
```

### 4.2 Models List in Excel (Recommended)

**Excel Sheet Structure:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Row with icon-prompt-bar-models class:                                       │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ google:firefly:colligo:gemini-flash, adobe:firefly:colligo:image5,    │   │
│ │ openai:firefly:colligo:gpt-4o, blackforest:firefly:colligo:flux-max   │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Row with icon-prompt-bar-default-model class:                                │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ google:firefly:colligo:gemini-flash                                    │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Parsing Logic:**

```javascript
getModelsFromAuthoring() {
  const modelsEl = this.el.querySelector('.icon-prompt-bar-models');
  const modelsStr = modelsEl?.nextSibling?.textContent?.trim();
  if (!modelsStr) return null;
  return modelsStr.split(',').map(m => m.trim()).filter(Boolean);
}

getDefaultModelFromAuthoring() {
  const defaultEl = this.el.querySelector('.icon-prompt-bar-default-model');
  return defaultEl?.nextSibling?.textContent?.trim() || null;
}
```

### 4.3 Configuration File Structure

**prompt-bar-config.js:**

```javascript
export const PROMPT_BAR_DEFAULTS = {
  // Script URLs - single place to update versions
  scriptUrls: {
    promptBar: 'https://clio-assets.adobe.com/clio-playground/script-cache/{version}/prompt-bar-app/dist/main.bundle.js',
    spectrumTheme: 'https://clio-assets.adobe.com/clio-playground/script-cache/116.1.4/spectrum-theme/dist/main.bundle.js',
  },
  
  // Version management
  versions: {
    promptBar: '127.1.6',
  },
  
  // Origins
  fireflyOrigin: 'https://firefly.adobe.com',
  
  // Validation rules
  validation: {
    maxPromptLength: 750,
  },
  
  // Default settings per theme
  settingsConfig: {
    default: {
      hideMoreButton: true,
      openTarget: '_self',
      'image-generation': {
        placeholder: 'Describe the image you want to generate',
        hideModelPicker: true,
        settings: ['model'],
      },
      // ... other verbs
    },
    max25: {
      hideMoreButton: true,
      openTarget: '_self',
      'image-generation': {
        placeholder: 'Describe what you want to generate',
        hideModelPicker: false,
        settings: ['model'],
        highlightModelPicker: false,
      },
      // ... other verbs
    },
  },
};

export function getPromptBarScriptUrl() {
  const { scriptUrls, versions } = PROMPT_BAR_DEFAULTS;
  return scriptUrls.promptBar.replace('{version}', versions.promptBar);
}

export function buildPromptBarConfig(authoredConfig, targetConfig, theme) {
  const defaults = PROMPT_BAR_DEFAULTS.settingsConfig[theme] 
    || PROMPT_BAR_DEFAULTS.settingsConfig.default;
  
  return {
    ...defaults,
    ...targetConfig?.promptBarSettingsConfig,
    ...authoredConfig,
  };
}
```

---

## 5. File Structure

### 5.1 Recommended Structure (Flat)

```
workflow-firefly/
├── action-binder.js              # Unchanged - handles unified events
├── widget.js                     # Simplified - orchestrator only
├── widget.css                    # Styles for both implementations
├── target-config.json            # Block-level configuration
├── sprite.svg                    # Icons
├── sound-utils.js                # Audio utilities
│
├── shareable-prompt-bar.js       # ◄── NEW: Shareable implementation
└── prompt-bar-config.js          # ◄── NEW: Configuration management
```

### 5.2 Alternative Structure (With Folders)

```
workflow-firefly/
├── action-binder.js
├── widget.js
├── widget.css
├── target-config.json
├── sprite.svg
├── sound-utils.js
│
├── shareable/                    # ◄── NEW folder
│   ├── shareable-prompt-bar.js
│   ├── prompt-bar-config.js
│   └── prompt-bar-prefetch.js
│
└── legacy/                       # ◄── Future: Extract legacy code
    └── legacy-prompt-bar.js
```

### 5.3 Rationale

| Approach | Pros | Cons |
|----------|------|------|
| **Flat** | Simpler imports, fewer changes | All files in one folder |
| **With Folders** | Better organization, clear separation | More complex imports |

**Recommendation:** Start with flat structure, refactor to folders if complexity grows.

---

## 6. Implementation Details

### 6.1 Feature Flag Detection

**In widget.js:**

```javascript
async initWidget() {
  const useShareablePromptBar = this.shouldUseShareablePromptBar();
  
  if (useShareablePromptBar) {
    try {
      const { ShareablePromptBar } = await import('./shareable-prompt-bar.js');
      return new ShareablePromptBar(this).init();
    } catch (error) {
      window.lana?.log(`Shareable prompt bar failed, falling back to legacy: ${error}`, this.lanaOptions);
      return this.initLegacyWidget();
    }
  }
  
  return this.initLegacyWidget();
}

shouldUseShareablePromptBar() {
  // Priority 1: Class on element (author override)
  if (this.el.classList.contains('shareable-prompt-bar')) return true;
  if (this.el.classList.contains('legacy-prompt-bar')) return false;
  
  // Priority 2: Config setting
  return this.workflowCfg.targetCfg?.useShareablePromptBar ?? false;
}
```

### 6.2 ShareablePromptBar Class

**shareable-prompt-bar.js:**

```javascript
import { createTag } from '../../../scripts/utils.js';
import { 
  buildPromptBarConfig, 
  getPromptBarScriptUrl,
  PROMPT_BAR_DEFAULTS 
} from './prompt-bar-config.js';

export class ShareablePromptBar {
  constructor(widget) {
    this.widget = widget;
    this.el = widget.el;
    this.workflowCfg = widget.workflowCfg;
    this.widgetWrap = null;
    this.promptBarApp = null;
    this.config = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF-Shareable' };
  }

  async init() {
    this.prefetch();
    this.config = this.buildConfig();
    
    await this.loadDependencies();
    this.createWidgetStructure();
    this.createPromptBarApp();
    this.setupEvents();
    this.widget.addWidget();
    
    return this.workflowCfg.targetCfg.actionMap;
  }

  // Configuration
  buildConfig() {
    const authoredConfig = this.getAuthoredConfig();
    const theme = this.detectTheme();
    return buildPromptBarConfig(authoredConfig, this.workflowCfg.targetCfg, theme);
  }

  getAuthoredConfig() {
    return {
      models: this.getModelsFromAuthoring(),
      defaultModel: this.getDefaultModelFromAuthoring(),
      placeholder: this.getPlaceholderFromAuthoring(),
    };
  }

  detectTheme() {
    const isMax25 = document.querySelector('meta[name="theme"][content="max25"]')
      || document.querySelector('.theme-two');
    return isMax25 ? 'max25' : 'default';
  }

  // Prefetch
  prefetch() {
    this.addPreconnectLinks();
    this.prefetchHubWithErrorCapture();
  }

  addPreconnectLinks() {
    const origin = PROMPT_BAR_DEFAULTS.fireflyOrigin;
    if (document.querySelector(`link[href="${origin}"]`)) return;
    
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
    
    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = origin;
    document.head.appendChild(dnsPrefetch);
  }

  async prefetchHubWithErrorCapture() {
    try {
      await fetch(`${PROMPT_BAR_DEFAULTS.fireflyOrigin}/hub`, {
        method: 'HEAD',
        mode: 'no-cors',
        credentials: 'omit',
      });
    } catch (error) {
      window.lana?.log(`Firefly Hub prefetch failed: ${error.message}`, this.lanaOptions);
    }
  }

  // ... rest of implementation
}
```

### 6.3 Event Setup

```javascript
setupEvents() {
  const { promptBarApp, widgetWrap } = this;

  // Validation interception (capture phase)
  promptBarApp.addEventListener('prompt-advanced-generate', (e) => {
    widgetWrap.dispatchEvent(new CustomEvent('firefly-prompt-validate', {
      detail: { prompt: e.detail?.prompt, originalEvent: e },
    }));
  }, { capture: true });

  // Standard events
  promptBarApp.addEventListener('prompt-bar-app-generate', (e) => {
    widgetWrap.dispatchEvent(new CustomEvent('firefly-generate', {
      detail: {
        prompt: e.detail?.prompt || '',
        verb: this.selectedVerbType,
        modelId: this.selectedModelId,
        modelVersion: this.selectedModelVersion,
        ...e.detail,
      },
    }));
  });

  promptBarApp.addEventListener('prompt-bar-app-application-change', (e) => {
    if (e.detail?.application) {
      this.selectedVerbType = e.detail.application;
      widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    }
    widgetWrap.dispatchEvent(new CustomEvent('firefly-application-change', { detail: e.detail }));
  });

  promptBarApp.addEventListener('prompt-bar-app-setting-interact', (e) => {
    const { detail } = e;
    if (detail?.modelId) {
      this.selectedModelId = detail.modelId;
      widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    }
    if (detail?.modelVersion) {
      this.selectedModelVersion = detail.modelVersion;
      widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
    }
    if (detail?.settingId === 'prompt') {
      promptBarApp.classList.toggle('prompt-focused', detail?.type === 'focus');
    }
    widgetWrap.dispatchEvent(new CustomEvent('firefly-setting-interact', { detail }));
  });

  promptBarApp.addEventListener('prompt-bar-app-more-button-click', (e) => {
    widgetWrap.dispatchEvent(new CustomEvent('firefly-more-button-click', { detail: e.detail }));
  });
}
```

---

## 7. Authorable Configurations

### 7.1 Excel Sheet Authoring

| Config | Icon Class | Example Value | Type |
|--------|------------|---------------|------|
| Models list | `icon-prompt-bar-models` | `google:..., adobe:..., openai:...` | Comma-separated |
| Default model | `icon-prompt-bar-default-model` | `google:firefly:colligo:gemini-flash` | Single value |
| Placeholder | `icon-prompt-bar-placeholder` | `Describe what you want...` | Text |
| Hide more button | `icon-prompt-bar-hide-more` | (presence = true) | Boolean |
| Environment | `icon-prompt-bar-env` | `stage` or `prod` | Enum |
| Disabled verbs | `icon-prompt-bar-disabled-verbs` | `sound-fx, vector` | Comma-separated |

### 7.2 Class-Based Toggles

| Class Name | Effect |
|------------|--------|
| `shareable-prompt-bar` | Use shareable implementation |
| `legacy-prompt-bar` | Force legacy implementation |
| `hide-model-picker` | Hide model picker UI |
| `highlight-model-picker` | Add highlight to model picker |

### 7.3 target-config.json Settings

| Config | Type | Description |
|--------|------|-------------|
| `useShareablePromptBar` | boolean | Default implementation choice |
| `promptBarEnvironment` | object | `{ type, localeCode }` |
| `promptBarSettingsConfig` | object | Override settings per block |
| `verbsWithoutPromptSuggestions` | array | Verbs to hide suggestions |

### 7.4 Code-Only Settings (prompt-bar-config.js)

| Config | Reason |
|--------|--------|
| Script URLs | Requires code review for version updates |
| Validation rules | Business logic, needs testing |
| Event mappings | Implementation detail |
| Default fallbacks | Safety net |

---

## 8. Performance Considerations

### 8.1 Script Loading Strategy

```javascript
// In workflow.js - Early preload
static preloadShareablePromptBarScripts() {
  const scripts = [
    getPromptBarScriptUrl(),
    PROMPT_BAR_DEFAULTS.scriptUrls.spectrumTheme,
  ];
  
  scripts.forEach(url => {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = url;
    document.head.appendChild(link);
  });
}
```

### 8.2 Loading Timeline

```
Page Load
    │
    ├── Priority Fetch (workflow.js)
    │   ├── target-config.json
    │   ├── widget.js
    │   └── modulepreload prompt-bar scripts ◄── Early preload
    │
    ├── Widget Init
    │   ├── Feature flag check
    │   ├── Dynamic import shareable-prompt-bar.js (if needed)
    │   └── Prefetch Firefly origin
    │
    └── Prompt Bar Ready
```

### 8.3 Bundle Size Impact

| User Type | Legacy | Shareable |
|-----------|--------|-----------|
| Legacy users | ~50KB widget.js | No change |
| Shareable users | ~45KB widget.js | +~8KB shareable-prompt-bar.js |
| External component | N/A | ~200KB (separate domain, cached) |

### 8.4 Caching Strategy

| Resource | Cache Strategy |
|----------|----------------|
| Prompt bar script | CDN cached, versioned URL |
| Spectrum theme | CDN cached, versioned URL |
| Firefly hub preconnect | Connection reused |

---

## 9. Event Flow & Validation

### 9.1 Event Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              Prompt Bar Component          →        Unity Events            │
├─────────────────────────────────────────────────────────────────────────────┤
│ prompt-advanced-generate (captured)        → firefly-prompt-validate        │
│ prompt-bar-app-generate                    → firefly-generate               │
│ prompt-bar-app-application-change          → firefly-application-change     │
│ prompt-bar-app-setting-interact            → firefly-setting-interact       │
│ prompt-bar-app-more-button-click           → firefly-more-button-click      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Validation Flow (Preventing Redirect on Error)

```
User clicks "Generate"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ prompt-advanced-generate fires                                   │
│ (CAPTURED by widget with { capture: true })                     │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Dispatch firefly-prompt-validate (SYNCHRONOUS)                  │
│ Include: { prompt, originalEvent }                              │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ action-binder.js: handlePromptValidate()                        │
│                                                                  │
│ const validation = this.validateInput(prompt);                  │
│ if (!validation.isValid) {                                      │
│     originalEvent.stopPropagation();  ◄── STOPS REDIRECT        │
│     // Show error toast                                          │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────┬────────────────────────────────────┐
│ Valid                      │ Invalid                            │
├────────────────────────────┼────────────────────────────────────┤
│ Event continues            │ Event stopped                      │
│ prompt-bar-app-generate    │ Error toast shown                  │
│ Redirect to Firefly        │ User stays on page                 │
└────────────────────────────┴────────────────────────────────────┘
```

---

## 10. Migration Path

### Phase 1: Parallel Implementation (Current)

```
Timeline: Now
State:
  ├── Both implementations available
  ├── Feature flag: `shareable-prompt-bar` class
  ├── Default: Legacy
  └── Testing: Internal pages only
```

### Phase 2: Controlled Rollout

```
Timeline: +2-4 weeks
State:
  ├── Enable shareable for specific pages via authoring
  ├── Monitor analytics and errors
  ├── A/B test performance metrics
  └── Gather feedback
```

### Phase 3: Default Switch

```
Timeline: +4-8 weeks
State:
  ├── Change default to shareable
  ├── Legacy available via `legacy-prompt-bar` class
  └── Update documentation
```

### Phase 4: Legacy Cleanup

```
Timeline: +8-12 weeks
State:
  ├── Remove legacy code from widget.js
  ├── Delete: legacy-prompt-bar.js (if extracted)
  ├── Simplify widget.js (optional: merge shareable back)
  └── Update target-config.json
```

---

## 11. Rollback Strategy

### 11.1 Immediate Rollback (Authoring)

**No code deploy required:**

```
Option 1: Remove class
  Before: <div class="hero-marquee shareable-prompt-bar">
  After:  <div class="hero-marquee">

Option 2: Add legacy class
  Before: <div class="hero-marquee shareable-prompt-bar">
  After:  <div class="hero-marquee legacy-prompt-bar">
```

### 11.2 Config Rollback

**In target-config.json:**

```json
{
  "hero-marquee": {
    "useShareablePromptBar": false
  }
}
```

### 11.3 Emergency Kill Switch

**In widget.js:**

```javascript
const FORCE_LEGACY = false; // Set to true in emergency

async initWidget() {
  if (FORCE_LEGACY) {
    window.lana?.log('Force legacy mode enabled', this.lanaOptions);
    return this.initLegacyWidget();
  }
  // ... normal logic
}
```

### 11.4 Monitoring & Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate | > 1% | Alert team |
| Error rate | > 5% | Auto-rollback via config |
| Firefly hub prefetch failures | > 10% | Log to Lana |

---

## Appendix

### A.1 Implementation Checklist

**Files to Create:**
- [ ] `shareable-prompt-bar.js` - Main integration class
- [ ] `prompt-bar-config.js` - Configuration management
- [ ] `SHAREABLE-PROMPT-BAR-ARCHITECTURE.md` - This document

**Files to Modify:**
- [ ] `widget.js` - Add feature flag detection, delegation
- [ ] `target-config.json` - Add `useShareablePromptBar` option
- [ ] `workflow.js` - Add script preloading (optional)

**Files to Eventually Delete (Phase 4):**
- [ ] Legacy prompt bar code in `widget.js`
- [ ] Unused configuration options

### A.2 Testing Checklist

- [ ] Feature flag detection (class-based)
- [ ] Feature flag detection (config-based)
- [ ] Legacy fallback on error
- [ ] Models list from authoring
- [ ] Validation (750 char limit)
- [ ] stopPropagation prevents redirect
- [ ] Error toast displays
- [ ] Analytics logging
- [ ] Prefetch to Firefly origin
- [ ] All verbs (image, video, sound, vector)
- [ ] Theme detection (default, max25)
- [ ] Mobile responsiveness
- [ ] Keyboard accessibility

### A.3 Analytics Events

| Event | When | Data |
|-------|------|------|
| `firefly-prompt-validate` | Generate clicked | prompt, validation result |
| `firefly-generate` | Valid generation | prompt, verb, modelId |
| `firefly-application-change` | Verb changed | application |
| `firefly-setting-interact` | Model changed | modelId, modelVersion |
| Lana error | Prefetch failure | error message |

### A.4 Browser Support

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 90+ | Full support |
| Firefox | 90+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support |

### A.5 Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| firefly-prompt-bar-app | 127.1.6+ | Main component |
| spectrum-theme | 116.1.4 | Theming |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-30 | - | Initial draft |

---

*End of Document*
