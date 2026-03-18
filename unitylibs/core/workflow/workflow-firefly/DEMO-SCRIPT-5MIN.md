# Shareable Prompt Bar: 5-Minute Lightning Demo

> **Duration:** 5 minutes  
> **Format:** 2 slides + live demo

---

## SLIDE 1: The Journey (60 seconds)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│          SHAREABLE PROMPT BAR: FROM POC TO PRODUCTION-READY                │
│                                                                              │
│   THE VISION                          THE JOURNEY                           │
│   ───────────                         ───────────                           │
│   One prompt bar,                     npm package → JS bundle               │
│   everywhere.                         ↓                                      │
│                                       5 gaps discovered                      │
│   Adobe.com                           ↓                                      │
│   Firefly.adobe.com     ←──→         Collaborated with Firefly + Mark      │
│   Express                             ↓                                      │
│                                       All gaps resolved ✅                   │
│                                                                              │
│   KEY GAPS RESOLVED:                                                        │
│   ✅ Redirect on error    ✅ Model configuration    ✅ Styling conflicts   │
│   ✅ Error interception   ✅ Auto-focus control     ✅ Performance          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script (60 sec):

> "Firefly's vision: **one prompt bar everywhere**. Same experience on Adobe.com, Firefly, Express.
>
> We're a flagship integration partner, so we did a POC. Initially it came as an npm package - **couldn't use it**. Firefly converted it to a JS bundle.
>
> Then we found **5 major gaps**: errors still redirected users, no way to intercept them, couldn't configure models, styling conflicts, unwanted auto-focus.
>
> Working with Mark and Firefly team over several weeks, **all resolved**. Let me show you."

---

## LIVE DEMO (3 minutes)

### Demo Flow:

**[0:00-0:30] Visual + Model Picker**

> "Here's the shareable prompt bar. Looks familiar, but notice this **model picker** - users can choose Gemini, GPT-4o, Flux. When Firefly adds new models, they appear automatically. **Zero engineering work from us.**"

*Click model picker, show options*

---

**[0:30-1:30] Error Handling (THE KEY DEMO)**

> "The critical fix: error handling."

*Paste long prompt (800+ chars)*

> "This prompt is too long. Watch what happens..."

*Click Generate*

> "See? **No redirect**. User stays on page. Error toast appears. They can fix and retry.
>
> Before our fix, they'd be redirected to Firefly just to see an error. Terrible UX.
>
> We achieved this with event interception - we catch the generate event, validate, and `stopPropagation()` if invalid."

---

**[1:30-2:15] Successful Flow**

*Clear prompt, type "A robot painting a sunset"*

> "Valid prompt now..."

*Click Generate*

> "Redirects to Firefly, generation starts. We control the experience on our page, Firefly handles generation."

---

**[2:15-3:00] Quick Comparison**

> "Quick comparison:
> - **Model picker**: We don't have it, they do ✅
> - **Auto model updates**: We manually build, they're automatic ✅
> - **Maintenance**: We maintain ours, Firefly maintains theirs ✅
> - **Analytics**: Full control in both ✅
>
> It's a clear upgrade."

---

## SLIDE 2: Next Steps (60 seconds)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                           NEXT STEPS                                         │
│                                                                              │
│   ROLLOUT PLAN                        WHAT WE NEED                          │
│   ────────────                        ────────────                          │
│                                                                              │
│   Week 1-2: Pilot (2-3 pages)         FROM PRODUCT:                         │
│       ↓                               • Identify pilot pages                │
│   Week 3-4: Expand + A/B test         • Define success metrics              │
│       ↓                                                                      │
│   Week 5-6: Default switch            FROM ENGINEERING:                     │
│                                       • 2-3 sprints production work         │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │  SAFETY: Instant rollback via authoring. No code deploy needed. │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│   QUESTIONS?                                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Script (60 sec):

> "Rollout plan: **Pilot** on 2-3 pages, **expand** with A/B testing, then **switch default**.
>
> Safety net: instant rollback via authoring. No code deploy needed.
>
> We need: pilot pages identified, success metrics defined, and 2-3 sprints for production hardening.
>
> **Bottom line**: We've turned a component we couldn't use into a production-ready integration. New capabilities, less maintenance, better user experience.
>
> Questions?"

---

## TIMING SUMMARY

| Section | Duration |
|---------|----------|
| Slide 1: Journey | 1:00 |
| Demo: Model Picker | 0:30 |
| Demo: Error Handling | 1:00 |
| Demo: Success Flow | 0:45 |
| Demo: Comparison | 0:45 |
| Slide 2: Next Steps | 1:00 |
| **TOTAL** | **5:00** |

---

## QUICK ANSWERS (if asked)

- **"What if Firefly breaks us?"** → Instant rollback, version-pinned, coordinated changes
- **"Maintenance effort?"** → Drops significantly, we configure not build
- **"Timeline?"** → Full migration possible within a quarter

---

*Keep it tight. Let the demo speak.*
