# Shareable Prompt Bar POC Demo Script

> **Audience:** Product Managers  
> **Duration:** 15-20 minutes  
> **Presenter:** [Your Name]  
> **Date:** [Demo Date]

---

## Pre-Demo Checklist

- [ ] Two browser tabs ready:
  - Tab 1: Current production page (legacy prompt bar)
  - Tab 2: POC page (shareable prompt bar)
- [ ] DevTools Network tab open (for performance comparison)
- [ ] Console open (for error demonstration)
- [ ] Test with long prompt ready (800+ characters)
- [ ] Slides ready (if any)

---

## Demo Script

### SLIDE 1: Opening (1 minute)

> **SAY:**
> 
> "Good [morning/afternoon] everyone! Today I'm excited to show you a proof of concept for integrating the **Shareable Firefly Prompt Bar** into our Unity widget.
> 
> This is a strategic initiative that aligns with Adobe's goal of providing a **unified Firefly experience** across all our properties.
> 
> Let me walk you through what we've built and why it matters."

---

### SLIDE 2: The Opportunity (2 minutes)

> **SAY:**
> 
> "First, let's understand the opportunity here.
> 
> **Currently**, we maintain our own custom prompt bar implementation. While it works, there are challenges:"

**Show bullet points:**

| Challenge | Impact |
|-----------|--------|
| **Duplicate effort** | We build features the Firefly team already has |
| **Inconsistent UX** | Our prompt bar looks/behaves differently |
| **Maintenance burden** | Every Firefly update requires our engineering work |
| **Feature lag** | New Firefly features take time to reach our pages |

> **SAY:**
> 
> "The Firefly team has built a **shareable prompt bar component** that any Adobe property can use. By integrating this, we get:
> 
> - **Automatic feature updates** - When Firefly adds a new model, we get it instantly
> - **Consistent experience** - Users see the same prompt bar everywhere
> - **Reduced maintenance** - Firefly team owns the component
> - **Faster time-to-market** - No more rebuilding features"

---

### SLIDE 3: Live Demo - Side by Side (5 minutes)

> **SAY:**
> 
> "Let me show you both implementations side by side."

**ACTION: Open both browser tabs**

---

#### Demo Part 1: Visual Comparison

> **SAY:**
> 
> "On the left, you see our **current legacy prompt bar**.  
> On the right, you see the **new shareable prompt bar**.
> 
> Notice a few things:"

**POINT OUT:**

1. **Model Picker** (if visible)
   > "The shareable version has a built-in model picker. Users can choose between different AI models - Gemini, Firefly Image 5, GPT-4o, Flux. This is automatically provided by the Firefly team."

2. **Visual Polish**
   > "The styling is handled by the Spectrum design system, ensuring consistency with other Adobe products."

3. **Responsive Behavior**
   > "Watch what happens when I resize the window..."
   
   **ACTION: Resize browser window**
   
   > "The component adapts beautifully - this responsive behavior comes built-in."

---

#### Demo Part 2: Typing Experience

> **SAY:**
> 
> "Let me show you the typing experience."

**ACTION: Click into prompt field on shareable version**

> **SAY:**
> 
> "Notice when I focus on the input, we get visual feedback."

**ACTION: Type a sample prompt**
> "A majestic mountain landscape at sunset with a lake reflection"

> **SAY:**
> 
> "The input feels native and smooth. The component handles all the UX details - placeholder text, focus states, character handling."

---

#### Demo Part 3: Error Handling (Key Feature!)

> **SAY:**
> 
> "Now here's something really important from a **user experience and analytics perspective**.
> 
> What happens when a user enters an invalid prompt? Let me show you."

**ACTION: Paste a very long prompt (800+ characters)**

> Example long prompt:
> "Create an incredibly detailed and elaborate digital artwork featuring a sprawling futuristic cityscape at twilight with towering skyscrapers made of glass and steel reflecting the orange and purple hues of the setting sun, flying vehicles weaving between buildings, holographic advertisements floating in the air, pedestrians walking on elevated walkways, lush vertical gardens covering the sides of buildings, a massive central tower with a glowing energy core at its peak, clouds of steam rising from industrial districts in the distance, birds migrating across the colorful sky, and intricate architectural details on every structure with a cyberpunk aesthetic mixed with art deco influences"

**ACTION: Click Generate**

> **SAY:**
> 
> "Watch what happens - instead of redirecting to Firefly with an error, we catch this **before the navigation** and show a friendly error message right here.
> 
> **This is a key feature we built.** The prompt bar component normally handles the redirect internally. We intercept the event, validate the input, and if there's an error, we **stop the redirect** and show our own error toast.
> 
> This means:
> - Users don't leave the page on errors
> - We can capture error analytics
> - Better user experience overall"

---

#### Demo Part 4: Successful Generation

> **SAY:**
> 
> "Now let me show you a successful generation."

**ACTION: Type a valid short prompt**
> "A cute robot playing guitar"

**ACTION: Click Generate**

> **SAY:**
> 
> "And we're redirected to Firefly where the image generation begins.
> 
> The key point here is: **we control what happens on our page**, but the actual generation is handled by Firefly. We get the best of both worlds."

---

### SLIDE 4: Architecture Overview (2 minutes)

> **SAY:**
> 
> "Let me briefly explain how this works under the hood - at a high level."

**Show simple diagram:**

```
┌─────────────────────────────────────────────────────┐
│              Our Page (adobe.com)                    │
│  ┌─────────────────────────────────────────────┐    │
│  │     Shareable Prompt Bar Component          │    │
│  │     (loaded from Firefly CDN)               │    │
│  └─────────────────────────────────────────────┘    │
│                        │                             │
│                        ▼                             │
│  ┌─────────────────────────────────────────────┐    │
│  │     Our Validation & Analytics Layer        │    │
│  │     (Unity integration code)                │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  firefly.adobe.com  │
              │  (Image generation) │
              └─────────────────────┘
```

> **SAY:**
> 
> "The component is loaded from Firefly's CDN - so it's always up to date. We wrap it with our own validation and analytics layer. When the user clicks Generate, we check the input first. If valid, we let the component do its thing and redirect to Firefly."

---

### SLIDE 5: Configuration & Authoring (2 minutes)

> **SAY:**
> 
> "One thing that's important for product flexibility - **how do we configure this?**
> 
> We've designed it so authors can control key settings without code changes:"

**Show configuration options:**

| What Authors Can Control | How |
|--------------------------|-----|
| Which implementation to use | Add `shareable-prompt-bar` class |
| Available AI models | List in Excel sheet |
| Default model | Specify in Excel |
| Placeholder text | Customize per page |
| Which features are enabled | Toggle via authoring |

> **SAY:**
> 
> "This means Product can decide on a page-by-page basis whether to use the new prompt bar, and customize it for different audiences or campaigns."

---

### SLIDE 6: Performance (2 minutes)

> **SAY:**
> 
> "You might be wondering about performance. We've optimized this carefully."

**ACTION: Open DevTools Network tab, refresh the POC page**

> **SAY:**
> 
> "Let me highlight a few things:
> 
> 1. **Preconnect** - We establish a connection to Firefly's servers as soon as the widget loads. This saves 100-300ms when the user clicks Generate.
> 
> 2. **Script Loading** - The prompt bar component is about 200KB, but it's:
>    - Loaded from a fast CDN
>    - Cached after first load
>    - Loaded in parallel with our code
> 
> 3. **Error Monitoring** - We proactively check if Firefly is reachable. If there's an issue, we log it for analytics - even before the user tries to generate."

---

### SLIDE 7: Rollout Strategy (2 minutes)

> **SAY:**
> 
> "So how do we get from POC to production? Here's our proposed rollout:"

**Show phases:**

| Phase | Timeline | What Happens |
|-------|----------|--------------|
| **Phase 1** | Now | Both implementations available, feature flag controlled |
| **Phase 2** | +2-4 weeks | Enable on select pages, monitor metrics |
| **Phase 3** | +4-8 weeks | Make shareable the default |
| **Phase 4** | +8-12 weeks | Remove legacy code |

> **SAY:**
> 
> "The key point is: **we can roll back instantly via authoring**. If any issue arises, authors simply remove the class and we're back to the legacy implementation. No code deploy needed."

---

### SLIDE 8: Benefits Summary (1 minute)

> **SAY:**
> 
> "Let me summarize the benefits:"

| For Users | For Product | For Engineering |
|-----------|-------------|-----------------|
| Consistent experience across Adobe | Faster feature delivery | Less maintenance |
| Latest AI models automatically | Author-controlled rollout | Clean architecture |
| Better error handling | A/B testing capability | Easy future cleanup |
| Familiar interface | Analytics insights | Reduced tech debt |

---

### SLIDE 9: Q&A / Discussion (5 minutes)

> **SAY:**
> 
> "That's the POC demo. I'd love to hear your thoughts and answer any questions.
> 
> Some discussion points:
> 
> 1. **Which pages should we pilot this on first?**
> 2. **What success metrics should we track?**
> 3. **Are there specific features you'd like to see added?**
> 4. **Any concerns about the transition?**"

---

## Anticipated Questions & Answers

### Q: "What if Firefly's component has a bug?"

> **A:** "Great question. We have multiple safety nets:
> 1. Authors can instantly switch back to legacy via a simple class change
> 2. We have error monitoring that catches issues early
> 3. If the component fails to load entirely, we automatically fall back to our legacy implementation"

### Q: "How does this affect our page load time?"

> **A:** "The component is loaded asynchronously and shouldn't affect LCP. We've also added preconnect hints to speed up the eventual redirect to Firefly. In testing, we've seen no negative impact on Core Web Vitals."

### Q: "Can we customize the look and feel?"

> **A:** "Yes, to an extent. The component uses CSS custom properties that we can override. However, for major customizations, we'd need to work with the Firefly team. The benefit of less customization is guaranteed consistency."

### Q: "What about accessibility?"

> **A:** "The Firefly team builds the component to WCAG AA standards. We get accessibility features automatically, including keyboard navigation and screen reader support."

### Q: "How do we track analytics?"

> **A:** "We maintain full control over analytics. All events (generate, error, model selection) are captured by our code before being passed to the component. We can track everything we do today, plus more."

### Q: "What's the effort to go to production?"

> **A:** "Approximately 2-3 sprints of engineering work to:
> - Clean up POC code
> - Add comprehensive testing
> - Update documentation
> - Coordinate rollout
> 
> The architecture work is largely done in the POC."

---

## Demo Environment URLs

| Environment | URL | Notes |
|-------------|-----|-------|
| Legacy (Production) | [Your prod URL] | Current implementation |
| POC (Shareable) | [Your POC URL] | New implementation |
| Firefly Destination | https://firefly.adobe.com | Where users land after Generate |

---

## Technical Setup Notes

If demo environment needs refresh:
1. Ensure `shareable-prompt-bar` class is on the block
2. Check console for any errors
3. Verify network connectivity to Firefly CDN

---

## Post-Demo Follow-up

- [ ] Send recording to attendees
- [ ] Share architecture document
- [ ] Schedule follow-up for decision on pilot pages
- [ ] Create JIRA tickets for production work

---

*End of Demo Script*
