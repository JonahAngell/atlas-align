---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# React

React rules and patterns for purity, immutability, hooks, state management, and performance

React patterns and rules for components, hooks, state management, and performance. Includes fundamental purity, immutability, and hook constraints that enable React to optimize rendering and prevent bugs.

Apply when: building React components, managing state, using hooks, optimizing performance, or reviewing React code for correctness.

---

## Purity

[HARD] Components and hooks must be pure during render. Given the same inputs (props, state, context), always return the same output.

| Rule                      | Details                                              |
| ------------------------- | ---------------------------------------------------- |
| Idempotent render         | Same inputs produce same output every time           |
| No side effects in render | Side effects belong in event handlers or `useEffect` |
| Local mutation only       | Mutate only values created within the current render |
| No DOM changes in render  | Use `useEffect` to synchronize with external systems |

---

## Immutability

[HARD] Never mutate props, state, hook arguments, hook return values, or values already passed to JSX.

| Value                | Rule                         | Fix                        |
| -------------------- | ---------------------------- | -------------------------- |
| Props                | Never mutate directly        | Create a copy              |
| State                | Never assign directly        | Use setter from `useState` |
| Hook arguments       | Don't modify after passing   | Spread into new object     |
| Hook return values   | Don't modify after receiving | Copy before modifying      |
| Values passed to JSX | Don't mutate after creation  | Create separate values     |

```tsx
// Bad: mutating props
function Post({ item }) {
  item.url = new URL(item.url, base);
  return <Link url={item.url}>{item.title}</Link>;
}

// Good: copy instead
function Post({ item }) {
  const url = new URL(item.url, base);
  return <Link url={url}>{item.title}</Link>;
}
```

---

## Hooks

[HARD] Call hooks only at the top level of function components or custom hooks. Never call hooks conditionally, in loops, after early returns, in event handlers, in class components, or inside `try`/`catch`/`finally`.

| Hook          | Purpose                        |
| ------------- | ------------------------------ |
| `useState`    | Local component state          |
| `useEffect`   | Side effects and lifecycle     |
| `useContext`  | Access context values          |
| `useRef`      | Mutable refs, DOM access       |
| `useMemo`     | Memoize expensive computations |
| `useCallback` | Memoize callback functions     |
| `useReducer`  | Complex state logic            |

| Allowed                         | Not Allowed                                         |
| ------------------------------- | --------------------------------------------------- |
| Top level of function component | Inside conditions or loops                          |
| Top level of custom hook        | After conditional `return`                          |
|                                 | Inside event handlers                               |
|                                 | Inside class components                             |
|                                 | Inside `useMemo`/`useReducer`/`useEffect` callbacks |
|                                 | Inside `try`/`catch`/`finally`                      |

| Dependency Array | Behavior                                          |
| ---------------- | ------------------------------------------------- |
| `[]`             | Run once on mount; return cleanup for unsubscribe |
| `[dep1, dep2]`   | Run when dependencies change                      |
| Omitted          | Run after every render (usually wrong)            |

Use `eslint-plugin-react-hooks` with `exhaustive-deps` to enforce hook rules automatically.

---

## Component Rendering

[HARD] Never call component functions directly. Use JSX so React manages rendering, reconciliation, and optimization.

| Pattern               | Status | Reason                                     |
| --------------------- | ------ | ------------------------------------------ |
| `<Article />`         | Good   | React manages rendering lifecycle          |
| `Article()`           | Bad    | Bypasses optimization and hook rules       |
| Hooks as props        | Bad    | Breaks local reasoning and static analysis |
| Dynamic hook mutation | Bad    | Wrap logic in a new static custom hook     |

---

## State Management

| Scope          | Solution                         |
| -------------- | -------------------------------- |
| Local          | `useState`, `useReducer`         |
| Component tree | Context API (infrequent changes) |
| Global         | Redux Toolkit, Zustand           |
| Server state   | TanStack Query, SWR              |

---

## Performance

| Technique      | When to Use                           |
| -------------- | ------------------------------------- |
| `React.memo`   | Prevent re-renders of pure components |
| `useMemo`      | Expensive computations                |
| `useCallback`  | Stable callback references            |
| `React.lazy`   | Code splitting                        |
| Virtualization | Long lists (react-window)             |

```tsx
// Bad - creates new object every render
<Child style={{ color: "red" }} />;

// Good - stable reference
const style = useMemo(() => ({ color: "red" }), []);
<Child style={style} />;
```

---

## Testing

| Practice             | Reason                       |
| -------------------- | ---------------------------- |
| Test behavior        | Not implementation details   |
| Use `screen` queries | Over container queries       |
| Prefer `userEvent`   | Over `fireEvent` for realism |
| Use `getByRole`      | Tests accessibility          |

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("increments counter", async () => {
  render(<Counter />);
  await userEvent.click(screen.getByRole("button"));
  expect(screen.getByText("Count: 1")).toBeInTheDocument();
});
```

---

## Security

| Rule                                           | Details                               |
| ---------------------------------------------- | ------------------------------------- |
| No `dangerouslySetInnerHTML` without DOMPurify | Prevents XSS attacks                  |
| Sanitize user input before display             | Use DOMPurify or framework escaping   |
| Validate props at boundaries                   | Especially data from external sources |
| Use Content Security Policy                    | Restrict script sources               |

---

## Quick Reference

| Task                 | Pattern                                            |
| -------------------- | -------------------------------------------------- |
| Keep render pure     | No side effects; same inputs produce same output   |
| Handle side effects  | Event handlers or `useEffect`, never during render |
| Update state         | Use setter from `useState`, never assign directly  |
| Modify props data    | Copy first, then modify the copy                   |
| Render a component   | `<Component />` in JSX, never `Component()`        |
| Call hooks correctly | Top level of function components or custom hooks   |
| Enforce hook rules   | Add `eslint-plugin-react-hooks` to ESLint config   |
| Memoize value        | `useMemo(() => compute(), [deps])`                 |
| Stable callback      | `useCallback(() => {}, [deps])`                    |
| Global state         | Context or Zustand/Redux                           |
| Local mutation       | OK to mutate values created within current render  |
| Enable StrictMode    | Wrap root in `<StrictMode>` to catch purity issues |

---

## Checklist

- [ ] Components return same output for same inputs (idempotent)
- [ ] No side effects during render (use event handlers or `useEffect`)
- [ ] Props and state never mutated directly
- [ ] Hook arguments and return values treated as immutable
- [ ] Values not mutated after being passed to JSX
- [ ] Components rendered via JSX, never called as functions
- [ ] Hooks called only at top level of function components or custom hooks
- [ ] No hooks inside conditions, loops, event handlers, or `try`/`catch`
- [ ] `eslint-plugin-react-hooks` configured in project
- [ ] Functional components with hooks (not class components)
- [ ] Keys for list items (not array index)
- [ ] Error boundaries for graceful failures
- [ ] Accessibility with semantic HTML and ARIA
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] `<StrictMode>` wrapping root component in development
- [ ] Performance: memoization where needed
