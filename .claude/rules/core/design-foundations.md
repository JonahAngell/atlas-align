# Design Foundations

Design principles, interaction patterns, and visual standards

This blueprint provides rules around design thinking, basic UX, accessibility, visual, motion, and interaction principles for products. It defines how components should behave and communicate on a foundational level. It is framework-agnostic and applies to any stack.

This is the authoritative source for UX best practices and principles — follow these rules for all UX decisions.

Apply when: building new products, creating pages, designing layouts, reviewing front-end code, or making design decisions.

---

## UX Principles

- Understand the user, their task, and context before building. If unsure, ask.
- Every element serves the task. If it doesn't, ask.
- Reduce cognitive load: fewer choices, clearer hierarchy, less noise.
- Consistency: same patterns, behaviors, positions. Users never relearn.
- Progressive disclosure: show what's needed now, reveal complexity on demand.
- Make the right path obvious. Design the happy path, then edge cases, empty states, loading, and failure.
- Support undo, back, and cancel at every level. Default to non-destructive.
- Immediate feedback for every action — instant for toggles, progress for long tasks, clear for errors.
- Motion communicates origin, change, or confirmation. Everything else is noise — remove it.
- Accessibility is structural. Built into every decision, not added as a final pass.

---

## Structure & Layout

- Every view answers: where am I, where can I go, how do I get back.
- Minimize navigation depth. Every nesting level must justify itself.
- Prefer flexbox or stacking with the spacing system over nested grids.
- Mobile-first. Add complexity as space allows.
- Touch targets: 44px minimum. Expand hit areas with padding.
- Skeleton screens over spinners. Load regions independently, not the whole page.
- Data-dense views: summary first, detail on demand.
- Preserve user state across navigation — filters, scroll position, selections persist.

---

## Content Design

| Element       | Standard                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Errors        | What happened, why, and what to do next. Never "Something went wrong."                                                                 |
| Empty states  | What will appear, why empty, one action to take. Never skip.                                                                           |
| Buttons       | Verb describing the outcome. Prefer specific labels ('Save Changes,' 'Send Invite') over generic ('OK,' 'Continue').                   |
| Confirmations | Title = action, body = consequence, button = specific verb. Bulk actions show count.                                                   |
| Notifications | Routine success: silent or subtle. Reserve toasts for what needs attention. Errors always surface. Every toast includes a status icon. |
| First use     | Show value, guide first action. Design for the no-data state.                                                                          |
| System errors | Acknowledge failure, don't blame user, offer retry or next step. Design for offline and degraded states.                               |
| Tone          | Calm for errors, brief for success, serious for destructive. Never blame the user.                                                     |

---

## Spacing Rules

- Internal padding ≤ external spacing. Elements inside a component relate tightly; the component separates from neighbors with more space.
- Components have no outer spacing baked in. Layout owns the gap between components — use gap, not margin on individual items.
- Apply padding only when the component has a visible boundary (background, border).

---

## States

Interactive elements change appearance based on interaction.

| State    | Behavior                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hover    | Background one step darker in light mode, lighter in dark mode. Cursor pointer. Optional elevation +1. Transition fast.                                                        |
| Active   | Darker than hover. Flatten elevation. Optional scale(0.98).                                                                                                                    |
| Focus    | 2px solid ring, 2px offset, focus-ring color. Follows border-radius. 3:1 contrast (WCAG 2.4.11). :focus-visible only. Never suppress.                                          |
| Selected | Background accent/primary. Filled icon variant. Text shifts to on-brand color.                                                                                                 |
| Disabled | cursor: not-allowed. No hover/active/focus response. Use disabled tokens — never opacity on text.                                                                              |
| Error    | Border error color. Message below with icon. aria-invalid + aria-describedby.                                                                                                  |
| Loading  | Skeleton overlay preferred; spinner only for isolated actions (single button, inline save). Disable interaction. aria-busy. Feedback within 1s; progress indicator after 2–3s. |

- States are additive — each adds information on top of default.
- Never rearrange, resize, or reflow the component.
- Multiple states coexist (selected + hovered, focused + error).
- Never rely on color alone (WCAG 1.4.1) or icon alone — always pair with text.
- Focus is highest priority — missing focus is the most common accessibility failure.

### Component-Specific Patterns

- Toggle off-state: Track background = text-tertiary, not disabled or border (those disappear on dark surfaces). Thumb is always white.
- Modal actions: Right-aligned. Cancel = outline variant, primary action = primary variant. Use destructive only for irreversible or high-impact actions. Trap focus within the modal — tab cycles inside, escape closes, return focus to trigger on dismiss.
- Toasts, badges, progress bars: Border/accent uses feedback color directly (success, error, warning). Never mix feedback colors with neutral tokens — produces muddy tones in dark mode. Toasts use aria-live="polite" for routine updates, "assertive" for errors.
- Tabs: border-bottom on tab list. Active tab has 2px bottom border in primary color. Arrow keys navigate between tabs. ARIA: tablist, tab, tabpanel, aria-selected.

---

## Motion

- Include transitions on all state changes and component entrances/exits — motion adds polish.
- Motion guides attention, confirms actions, or communicates spatial relationships. Remove everything else.
- Use CSS transitions and animations. Reserve JavaScript animation for cases CSS cannot handle (scroll-linked, physics-based, sequenced). Entering elements decelerate. Exiting elements accelerate. Exit slightly faster than entrance. Never use linear for UI transitions — reserve it for continuous animations (spinners, progress loops).
- Reduced motion (prefers-reduced-motion): Remove sliding, scaling, rotating. Replace with opacity at fast or instant duration. Keep focus indicators and state changes visible. Never remove functional motion (scroll).

---

## Visual Rules

- WCAG AA required. Test all color pairings with a contrast checker. Compute the ratio — do not assume a token passes.
- Dark mode: default to system preference with a user toggle. Include when the builder requests it or the product requires it.
- Dark mode neutrals are cool blue-grays. Mixing with warm feedback colors (amber, green) produces muddy tones. Use feedback colors directly for status indicators.
- border-muted and surface-raised share identical dark-mode values (#1E293B). Small interactive elements on raised surfaces need higher-contrast alternatives (use text-tertiary).
- Never apply opacity to elements containing text — fails contrast. Use disabled tokens instead. Do not use opacity for placeholder text.
- Radius scales with component size. Inner radius = outer radius minus padding between elements.
- Minimum rendered font: 12px (0.75rem). This is the floor — never go smaller.
- Font: Figtree, sans-serif. Self-hosted only — no external font services.
- No hardcoded colors, spacing, or sizes.

---

## Quick Reference

| Task               | Pattern                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| Choose spacing     | Internal ≤ external. Layout owns gaps.                                 |
| Implement a state  | States table above. Additive, never rearrange.                         |
| Handle an error    | What happened + why + what to do. Icon + message. aria-describedby.    |
| Dark mode colors   | Feedback colors used directly. Never blend with neutrals.              |
| Add motion         | Communicate only. Decelerate in, accelerate out. Honor reduced-motion. |
| Design empty state | What will appear + why empty + one action to take.                     |
| Touch targets      | 44px minimum. Expand with padding if needed.                           |
| Choose radius      | Scale with size. Inner = outer minus padding.                          |

---

## Checklist

- [ ] WCAG AA compliance verified
- [ ] Contrast ratios computed — don't assume tokens pass
- [ ] No hardcoded colors, spacing, or sizes
- [ ] All states designed: empty, first-use, loading, error, offline
- [ ] Interactive states follow the States table — no invented approaches
- [ ] Spacing follows component guidance — internal padding ≤ external gaps, layout owns spacing between components
- [ ] Destructive or multi-step actions support undo, back, or cancel
- [ ] Action-oriented views have one clear primary action
- [ ] No placeholder content remaining — all text real or clearly marked as sample
- [ ] Transitions included on state changes and component entrances/exits
- [ ] Dark mode verified — no muddy blends, no disappearing borders
