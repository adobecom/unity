# Shareable Prompt Bar Integration Journey
## POC Demo & Presentation Script

> **Audience:** Product Managers, Engineering Leadership, Stakeholders  
> **Duration:** 25-30 minutes  
> **Presenters:** [Your Name] + Mark (PM)  
> **Date:** [Demo Date]

---

## Presentation Overview

| Part | Duration | Content |
|------|----------|---------|
| Part 1: Context & Vision | 5 min | Why a common prompt bar? |
| Part 2: The Journey | 8 min | From npm to integrable state |
| Part 3: Live Demo | 10 min | Features & comparison |
| Part 4: Next Steps | 5 min | Roadmap & discussion |

---

# PART 1: CONTEXT & VISION

---

## SLIDE 1: Title Slide

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    SHAREABLE PROMPT BAR INTEGRATION                         │
│                                                                              │
│                    From POC to Production-Ready                             │
│                                                                              │
│                    ─────────────────────────────                            │
│                                                                              │
│                    Unity × Firefly Collaboration                            │
│                                                                              │
│                    [Your Name] | [Mark's Name]                              │
│                    [Date]                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Good [morning/afternoon] everyone. Today we're excited to share the journey of integrating Firefly's Shareable Prompt Bar into Unity - from our initial POC to where we are today with a production-ready solution.
>
> This has been a collaborative effort between Unity engineering and the Firefly product team, and we're here to walk you through what we learned, the challenges we overcame, and what's next."

---

## SLIDE 2: The Vision - One Prompt Bar Everywhere

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    THE VISION: UNIFIED FIREFLY EXPERIENCE                   │
│                                                                              │
│    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                │
│    │              │    │              │    │              │                │
│    │  Adobe.com   │    │   Firefly    │    │   Express    │                │
│    │              │    │              │    │              │                │
│    └──────────────┘    └──────────────┘    └──────────────┘                │
│           │                   │                   │                         │
│           └───────────────────┼───────────────────┘                         │
│                               │                                              │
│                               ▼                                              │
│                    ┌──────────────────────┐                                 │
│                    │  SAME PROMPT BAR     │                                 │
│                    │  SAME EXPERIENCE     │                                 │
│                    │  SAME FEATURES       │                                 │
│                    └──────────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "The Firefly team has a clear vision: **one prompt bar, everywhere**. 
>
> Whether a user is on Adobe.com, Firefly.adobe.com, or Express - they should see the same familiar interface. This creates consistency, reduces confusion, and means that when Firefly adds a new feature - like a new AI model - it's instantly available across all surfaces.
>
> Unity is one of Firefly's **flagship integration partners**. Our prompt bar on Adobe.com is often the first touchpoint users have with Firefly. So getting this integration right is critical."

---

## SLIDE 3: Why This Matters

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         WHY THIS MATTERS                                     │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                        FOR USERS                                 │      │
│    ├─────────────────────────────────────────────────────────────────┤      │
│    │  ✓ Consistent experience across Adobe                          │      │
│    │  ✓ Access to latest AI models automatically                    │      │
│    │  ✓ Familiar interface reduces learning curve                   │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                      FOR ADOBE                                   │      │
│    ├─────────────────────────────────────────────────────────────────┤      │
│    │  ✓ Unified brand experience                                     │      │
│    │  ✓ Faster feature rollouts                                      │      │
│    │  ✓ Reduced engineering duplication                              │      │
│    │  ✓ Centralized improvements benefit everyone                    │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Why does this matter? 
>
> **For users**: They get a consistent experience. When they learn how to use the prompt bar on Adobe.com, that knowledge transfers to Firefly, to Express, everywhere.
>
> **For Adobe**: We stop duplicating effort. The Firefly team builds features once, and everyone benefits. When they add GPT-4o or a new Flux model, we don't need to do any engineering work - it just appears."

---

# PART 2: THE JOURNEY

---

## SLIDE 4: Where We Started

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         WHERE WE STARTED                                     │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                                                                  │      │
│    │                    NPM PACKAGE                                   │      │
│    │                                                                  │      │
│    │    • Distributed as npm package                                 │      │
│    │    • Required build pipeline integration                        │      │
│    │    • Not compatible with Unity's architecture                   │      │
│    │    • Bundled dependencies conflicts                             │      │
│    │                                                                  │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                               │                                              │
│                               ▼                                              │
│                        ❌ NOT VIABLE                                        │
│                                                                              │
│    "We can't integrate an npm package into our CDN-based architecture"     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Let me take you back to where this journey started.
>
> The Firefly team initially distributed the prompt bar as an **npm package**. This works great for applications with build pipelines - React apps, Node projects. But Unity operates differently.
>
> We're CDN-based. We load scripts dynamically. We can't run `npm install` at runtime.
>
> So our first conversation with Firefly was: **'We need a different distribution model.'**"

---

## SLIDE 5: First Breakthrough - JS Bundle

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    FIRST BREAKTHROUGH: JS BUNDLE                            │
│                                                                              │
│    ┌───────────────────┐           ┌───────────────────┐                   │
│    │                   │           │                   │                   │
│    │   NPM Package     │    ──►    │   JS Bundle       │                   │
│    │   (Not viable)    │           │   (CDN hosted)    │                   │
│    │                   │           │                   │                   │
│    └───────────────────┘           └───────────────────┘                   │
│                                                                              │
│    Working with Firefly team:                                               │
│                                                                              │
│    ✓ Converted to standalone JS bundle                                     │
│    ✓ Hosted on Clio CDN (clio-assets.adobe.com)                            │
│    ✓ Web Component architecture (<firefly-prompt-bar-app>)                 │
│    ✓ Dynamic loading compatible                                            │
│                                                                              │
│    "Now we can load it like any other script!"                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "The Firefly team was incredibly responsive. They converted the npm package into a **standalone JavaScript bundle** hosted on their CDN.
>
> This was a game-changer. Now we could load it just like any other script - dynamically, on demand. The component uses Web Component standards, which means it's framework-agnostic and works perfectly with our vanilla JS architecture.
>
> This was our first major breakthrough. But it was just the beginning."

---

## SLIDE 6: The POC Begins - Discovering Gaps

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    POC BEGINS: DISCOVERING GAPS                             │
│                                                                              │
│    We integrated the bundle and found...                                    │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  GAP #1: Redirect on Error                                       │      │
│    │  ─────────────────────────────                                   │      │
│    │  Problem: Invalid prompts still redirected to Firefly           │      │
│    │  Impact: Poor UX, users leave page on errors                    │      │
│    │  Status: ✅ RESOLVED                                             │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  GAP #2: No Error Event Exposure                                 │      │
│    │  ─────────────────────────────                                   │      │
│    │  Problem: No way to intercept before redirect                   │      │
│    │  Impact: Can't validate or show custom errors                   │      │
│    │  Status: ✅ RESOLVED - prompt-advanced-generate event added     │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "With the bundle in hand, we started the POC. And that's when we discovered the gaps.
>
> **Gap #1: Redirect on Error**. When a user entered an invalid prompt - say, over 750 characters - the component would still redirect to Firefly. Users would leave our page only to see an error there. Terrible experience.
>
> **Gap #2: No Error Interception**. The component didn't expose any event we could use to validate before the redirect happened. We were powerless to stop it.
>
> This is where Mark and the product collaboration became crucial."

---

## SLIDE 7: More Gaps Discovered

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    MORE GAPS DISCOVERED                                      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  GAP #3: Missing Model Configuration                            │      │
│    │  ─────────────────────────────                                   │      │
│    │  Problem: Couldn't specify which AI models to show              │      │
│    │  Impact: All models shown, no curation possible                 │      │
│    │  Status: ✅ RESOLVED - settingsConfig API added                 │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  GAP #4: Styling Conflicts                                       │      │
│    │  ─────────────────────────────                                   │      │
│    │  Problem: Component styles clashed with our page                │      │
│    │  Impact: Broken layouts, inconsistent appearance                │      │
│    │  Status: ✅ RESOLVED - CSS custom properties exposed            │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  GAP #5: Auto-focus Behavior                                     │      │
│    │  ─────────────────────────────                                   │      │
│    │  Problem: Component auto-focused, scrolling page on load        │      │
│    │  Impact: Jarring UX, accessibility issues                       │      │
│    │  Status: ✅ RESOLVED - autoFocus prop added                     │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "The more we tested, the more gaps we found.
>
> **Model Configuration**: We couldn't control which AI models appeared. For different campaigns or pages, we might want to feature specific models.
>
> **Styling Conflicts**: The component's CSS was fighting with our page styles. Layouts broke. Things looked inconsistent.
>
> **Auto-focus**: The component would automatically focus the input on load, causing the page to scroll unexpectedly. Jarring for users, problematic for accessibility.
>
> Each of these required back-and-forth with the Firefly team."

---

## SLIDE 8: The Collaboration - Working with Product

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│              THE COLLABORATION: UNITY × FIREFLY × PRODUCT                   │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                                                                  │      │
│    │           Mark (PM)                                             │      │
│    │              │                                                   │      │
│    │              ▼                                                   │      │
│    │    ┌─────────────────┐                                          │      │
│    │    │  Gap Analysis   │                                          │      │
│    │    │  & Prioritization│                                         │      │
│    │    └─────────────────┘                                          │      │
│    │              │                                                   │      │
│    │      ┌───────┴───────┐                                          │      │
│    │      ▼               ▼                                          │      │
│    │  ┌───────────┐  ┌───────────┐                                   │      │
│    │  │ Unity Eng │  │ Firefly   │                                   │      │
│    │  │ (Us)      │  │ Team      │                                   │      │
│    │  └───────────┘  └───────────┘                                   │      │
│    │                                                                  │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    • Weekly syncs to review blockers                                        │
│    • Shared Jira board for tracking                                         │
│    • Quick turnaround on critical fixes                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "This is where the collaboration became key.
>
> Mark helped us prioritize which gaps were blockers versus nice-to-haves. He facilitated conversations with the Firefly team, translated our technical requirements into product asks, and kept everyone aligned.
>
> We had weekly syncs. Shared tracking. The Firefly team was responsive - they understood that if we couldn't integrate, their vision of 'one prompt bar everywhere' wouldn't include Adobe.com.
>
> [MARK CAN SPEAK HERE ABOUT THE PRODUCT PERSPECTIVE]"

---

## SLIDE 9: Key Technical Solutions

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    KEY TECHNICAL SOLUTIONS                                   │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  SOLUTION: Event Interception Pattern                           │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    promptBarApp.addEventListener('prompt-advanced-generate', (e) => {       │
│      const validation = this.validateInput(e.detail.prompt);                │
│      if (!validation.isValid) {                                             │
│        e.stopPropagation();  // ← STOP THE REDIRECT                         │
│        showErrorToast();     // ← SHOW OUR ERROR                            │
│      }                                                                       │
│    }, { capture: true });    // ← CAPTURE PHASE = RUNS FIRST               │
│                                                                              │
│    ─────────────────────────────────────────────────────────────────        │
│                                                                              │
│    Result:                                                                   │
│    ✓ We validate BEFORE the component acts                                 │
│    ✓ Invalid prompts stay on page                                          │
│    ✓ Users see our branded error experience                                │
│    ✓ We capture error analytics                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Let me share one of the key technical solutions we developed.
>
> The Firefly team added a new event: `prompt-advanced-generate`. This fires **before** the component processes the generation. By listening in the **capture phase**, we intercept it first.
>
> If validation fails, we call `stopPropagation()`. This stops the event from reaching the component's internal handlers. No redirect. User stays on page. We show our own error toast.
>
> This pattern lets us maintain control while still using their component. Best of both worlds."

---

## SLIDE 10: Where We Are Today

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    WHERE WE ARE TODAY                                        │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                                                                  │      │
│    │                    ✅ PRODUCTION-READY POC                       │      │
│    │                                                                  │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    Resolved Gaps:                                                           │
│    ├── ✅ Redirect prevention on errors                                     │
│    ├── ✅ Model configuration (curated list)                                │
│    ├── ✅ Styling integration (CSS custom properties)                       │
│    ├── ✅ Auto-focus control                                                │
│    ├── ✅ Environment configuration (stage/prod)                            │
│    ├── ✅ Analytics integration                                             │
│    └── ✅ Prefetch optimization for performance                             │
│                                                                              │
│    Ready for:                                                               │
│    • Feature flag controlled rollout                                        │
│    • A/B testing against legacy                                             │
│    • Gradual production deployment                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "And that brings us to today.
>
> After weeks of collaboration, we have a **production-ready POC**. Every gap we identified has been resolved - either by changes from the Firefly team or by integration patterns we developed.
>
> We're now ready for a controlled rollout. We've built in feature flags so authors can enable this per-page. We can A/B test. We can roll back instantly if needed.
>
> Let me show you what it looks like."

---

# PART 3: LIVE DEMO

---

## SLIDE 11: Demo Introduction

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         LIVE DEMO                                            │
│                                                                              │
│                    Legacy  ←→  Shareable                                    │
│                                                                              │
│    What we'll show:                                                         │
│                                                                              │
│    1. Visual comparison                                                     │
│    2. Model picker (new capability)                                         │
│    3. Error handling (our key innovation)                                   │
│    4. Successful generation flow                                            │
│    5. Performance optimizations                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Let me switch to the browser and show you both implementations side by side."

---

## DEMO SECTION (10 minutes)

### Demo 1: Visual Comparison (2 min)

**ACTION: Open both tabs - Legacy and Shareable**

> **SAY:**
> "On the left: our current legacy prompt bar - the one we built and maintain ourselves.
>
> On the right: the shareable prompt bar - Firefly's component that we've integrated.
>
> Notice the similarities - we worked hard to ensure visual parity. The experience should feel familiar to users. But look closer..."

**POINT OUT:**
- Model picker icon (shareable)
- Subtle styling differences
- Generate button styling

---

### Demo 2: Model Picker - New Capability (2 min)

**ACTION: Click model picker on shareable version**

> **SAY:**
> "This is something our legacy implementation doesn't have - a **built-in model picker**.
>
> Users can choose between:
> - Gemini Flash
> - Firefly Image 5
> - GPT-4o
> - Flux
>
> When Firefly adds a new model next month, it will automatically appear here. **Zero engineering work from us**.
>
> And through configuration, we can control which models appear. For a specific campaign, we might only show certain options."

---

### Demo 3: Error Handling - The Key Innovation (3 min)

> **SAY:**
> "Now let me show you the most important feature - our error handling innovation."

**ACTION: In LEGACY version, paste very long prompt (800+ chars), click Generate**

> **SAY:**
> "Watch the legacy version first... See how it just shows an error toast but the interaction feels limited?"

**ACTION: In SHAREABLE version, paste same long prompt, click Generate**

> **SAY:**
> "Now the shareable version... Watch carefully.
>
> The prompt is too long. But instead of redirecting to Firefly and showing an error there, we **intercept** the event, **stop** the redirect, and show our own error.
>
> The user stays on the page. They can fix their prompt. They don't lose context.
>
> This was one of the major gaps we identified and solved. The Firefly team added the event, we built the interception pattern."

---

### Demo 4: Successful Generation (2 min)

**ACTION: Type valid prompt "A robot painting a sunset"**

> **SAY:**
> "Now a successful flow. Short, valid prompt."

**ACTION: Click Generate**

> **SAY:**
> "We're redirected to Firefly, and generation begins.
>
> The key point: we control the experience on our page, Firefly handles the generation. Clean separation of concerns."

---

### Demo 5: Performance (1 min)

**ACTION: Open DevTools Network tab, refresh page**

> **SAY:**
> "A quick note on performance. See these entries?
>
> - **Preconnect** to firefly.adobe.com - we establish the connection early
> - **Prefetch** of the hub endpoint - warms the cache
>
> When the user clicks Generate, we've already done the slow network handshakes. The redirect is faster."

---

## SLIDE 12: Feature Comparison Summary

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    FEATURE COMPARISON                                        │
│                                                                              │
│    ┌────────────────────────┬─────────────┬─────────────────────────┐       │
│    │ Feature                │ Legacy      │ Shareable               │       │
│    ├────────────────────────┼─────────────┼─────────────────────────┤       │
│    │ Model Picker           │ ❌ No       │ ✅ Built-in             │       │
│    │ Auto Model Updates     │ ❌ Manual   │ ✅ Automatic            │       │
│    │ Error Interception     │ ⚠️ Limited  │ ✅ Full control         │       │
│    │ Styling Consistency    │ ⚠️ Ours     │ ✅ Spectrum (Adobe)     │       │
│    │ Maintenance            │ ❌ Us       │ ✅ Firefly team         │       │
│    │ New Features           │ ❌ Build    │ ✅ Automatic            │       │
│    │ Analytics              │ ✅ Full     │ ✅ Full (our layer)     │       │
│    │ Accessibility          │ ⚠️ Ours     │ ✅ Firefly (WCAG AA)    │       │
│    └────────────────────────┴─────────────┴─────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Let me summarize the comparison.
>
> The shareable prompt bar gives us capabilities we don't have today - model picker, automatic updates, consistent styling. And it shifts maintenance to the Firefly team.
>
> We keep full control of analytics. We keep our error handling. We get accessibility compliance built-in.
>
> It's a clear win."

---

# PART 4: NEXT STEPS

---

## SLIDE 13: Rollout Plan

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    ROLLOUT PLAN                                              │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │ PHASE 1: Controlled Pilot (Week 1-2)                            │      │
│    │ • Enable on 2-3 non-critical pages                              │      │
│    │ • Monitor analytics and errors                                  │      │
│    │ • Gather user feedback                                          │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                               │                                              │
│                               ▼                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │ PHASE 2: Expanded Rollout (Week 3-4)                            │      │
│    │ • Enable on high-traffic pages                                  │      │
│    │ • A/B test against legacy                                       │      │
│    │ • Measure conversion impact                                     │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                               │                                              │
│                               ▼                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │ PHASE 3: Default Switch (Week 5-6)                              │      │
│    │ • Shareable becomes default                                     │      │
│    │ • Legacy available as fallback                                  │      │
│    │ • Begin legacy deprecation planning                             │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "Here's our proposed rollout plan.
>
> **Phase 1**: Controlled pilot on a few pages. We monitor closely, catch any issues early.
>
> **Phase 2**: Expand to high-traffic pages. A/B test to measure real impact on conversions and engagement.
>
> **Phase 3**: Make shareable the default. Legacy remains available for emergencies.
>
> The key throughout: **instant rollback via authoring**. No code deploys needed to switch back."

---

## SLIDE 14: What We Need

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                    WHAT WE NEED                                              │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  FROM PRODUCT                                                    │      │
│    │  • Identify pilot pages                                         │      │
│    │  • Define success metrics                                        │      │
│    │  • Approve rollout timeline                                      │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  FROM ENGINEERING                                                │      │
│    │  • 2-3 sprints for production hardening                         │      │
│    │  • Testing infrastructure setup                                  │      │
│    │  • Documentation updates                                         │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │  ONGOING                                                         │      │
│    │  • Continued Firefly team collaboration                         │      │
│    │  • Regular sync for new features/issues                          │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "To move forward, here's what we need:
>
> **From Product**: Which pages should we pilot on? What metrics define success? Are we aligned on timeline?
>
> **From Engineering**: About 2-3 sprints to harden the POC for production - testing, documentation, edge cases.
>
> **Ongoing**: We need to maintain the relationship with the Firefly team. They've been great partners, and as they add features, we'll want to stay coordinated."

---

## SLIDE 15: Thank You & Q&A

### Slide Content:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         THANK YOU                                            │
│                                                                              │
│                    Questions & Discussion                                   │
│                                                                              │
│    ─────────────────────────────────────────────────────────────────        │
│                                                                              │
│    Key Takeaways:                                                           │
│                                                                              │
│    1. Unified prompt bar aligns with Adobe's vision                         │
│    2. POC journey identified and resolved critical gaps                     │
│    3. Solution is production-ready with instant rollback                    │
│    4. Cross-functional collaboration made this possible                     │
│                                                                              │
│    ─────────────────────────────────────────────────────────────────        │
│                                                                              │
│    Resources:                                                               │
│    • Architecture Doc: [link]                                               │
│    • POC Environment: [link]                                                │
│    • Jira Epic: [link]                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script:
> "To wrap up: this has been a journey of discovery, collaboration, and problem-solving.
>
> We started with an npm package we couldn't use. Through partnership with the Firefly team and Mark's product leadership, we now have a production-ready integration that gives us new capabilities while reducing our maintenance burden.
>
> I'm proud of what we've built, and excited for what's next.
>
> Questions?"

---

## ANTICIPATED QUESTIONS

### Q: "What if Firefly changes something and breaks us?"

> **A:** "Great concern. We have multiple safety nets:
> 1. Instant rollback via authoring - just remove a class
> 2. We're version-pinned to specific releases
> 3. The Firefly team has agreed to coordinate breaking changes
> 4. Our test suite will catch regressions"

### Q: "How much effort to maintain going forward?"

> **A:** "Significantly less than today. We stop building features - we just integrate. When Firefly adds a model, it's automatic. Our effort shifts from building to configuring."

### Q: "What about pages that need custom behavior?"

> **A:** "Legacy remains available. If a specific page has unique requirements that the shareable component can't support, authors can opt that page into legacy mode."

### Q: "Timeline to full rollout?"

> **A:** "If we start now: 2-3 sprints for production work, then 4-6 weeks of phased rollout. Full migration possible within a quarter."

---

## POST-PRESENTATION

- [ ] Share recording
- [ ] Distribute architecture document
- [ ] Schedule pilot page selection meeting
- [ ] Create Jira epic for production work
- [ ] Thank Firefly team for collaboration

---

*End of Presentation Script*
