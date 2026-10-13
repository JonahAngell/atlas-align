---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# React Composition

React composition patterns for compound components, dependency injection, and explicit variants

React composition patterns for building flexible, maintainable component architectures using compound components, dependency-injected state, and explicit variants.

Apply when: designing React component APIs, structuring shared state, building reusable UI systems, or refactoring boolean-prop-heavy components.

---

## Rule Strength Tags

| Tag     | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| [HARD]  | Must not be broken. Refuse conflicting requests.                |
| [WARN]  | Default behavior. Explain trade-off if user wants to deviate.   |
| [GUIDE] | Recommendation. Follow unless user has clear reason to deviate. |

---

## Core Principles

| Principle                      | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| Composition over configuration | Build variants by assembling parts, not toggling booleans           |
| Dependency-injected state      | Providers supply state; UI components consume an interface          |
| Explicit variants              | Separate components per use case, shared internals                  |
| Children over render props     | Prefer `children` for structure; render props only for data passing |

---

## Avoid Boolean Prop Proliferation

[HARD] Do not add boolean props like `isThread`, `isEditing`, or `isDMThread` to customize component behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.

**Incorrect (boolean props create exponential complexity):**

```tsx
function Composer({
  onSubmit,
  isThread,
  channelId,
  isDMThread,
  dmId,
  isEditing,
  isForwarding,
}: Props) {
  return (
    <form>
      <Header />
      <Input />
      {isDMThread ? (
        <AlsoSendToDMField id={dmId} />
      ) : isThread ? (
        <AlsoSendToChannelField id={channelId} />
      ) : null}
      {isEditing ? (
        <EditActions />
      ) : isForwarding ? (
        <ForwardActions />
      ) : (
        <DefaultActions />
      )}
      <Footer onSubmit={onSubmit} />
    </form>
  );
}
```

**Correct (composition eliminates conditionals):**

```tsx
function ChannelComposer() {
  return (
    <Composer.Frame>
      <Composer.Header />
      <Composer.Input />
      <Composer.Footer>
        <Composer.Attachments />
        <Composer.Formatting />
        <Composer.Emojis />
        <Composer.Submit />
      </Composer.Footer>
    </Composer.Frame>
  );
}

function ThreadComposer({ channelId }: { channelId: string }) {
  return (
    <Composer.Frame>
      <Composer.Header />
      <Composer.Input />
      <AlsoSendToChannelField id={channelId} />
      <Composer.Footer>
        <Composer.Formatting />
        <Composer.Emojis />
        <Composer.Submit />
      </Composer.Footer>
    </Composer.Frame>
  );
}

function EditComposer() {
  return (
    <Composer.Frame>
      <Composer.Input />
      <Composer.Footer>
        <Composer.Formatting />
        <Composer.Emojis />
        <Composer.CancelEdit />
        <Composer.SaveEdit />
      </Composer.Footer>
    </Composer.Frame>
  );
}
```

Each variant is explicit about what it renders. Shared internals are reused without a monolithic parent.

---

## Compound Components

[WARN] Structure complex components as compound components with a shared context. Each subcomponent accesses shared state via context, not props. Consumers compose the pieces they need.

**Incorrect (monolithic component with render props and booleans):**

```tsx
function Composer({
  renderHeader,
  renderFooter,
  renderActions,
  showAttachments,
  showFormatting,
  showEmojis,
}: Props) {
  return (
    <form>
      {renderHeader?.()}
      <Input />
      {showAttachments && <Attachments />}
      {renderFooter ? (
        renderFooter()
      ) : (
        <Footer>
          {showFormatting && <Formatting />}
          {showEmojis && <Emojis />}
          {renderActions?.()}
        </Footer>
      )}
    </form>
  );
}
```

**Correct (compound components with shared context):**

```tsx
const ComposerContext = createContext<ComposerContextValue | null>(null);

function ComposerProvider({ children, state, actions, meta }: ProviderProps) {
  return (
    <ComposerContext value={{ state, actions, meta }}>
      {children}
    </ComposerContext>
  );
}

function ComposerFrame({ children }: { children: React.ReactNode }) {
  return <form>{children}</form>;
}

function ComposerInput() {
  const {
    state,
    actions: { update },
    meta: { inputRef },
  } = useContext(ComposerContext);
  return (
    <TextInput
      ref={inputRef}
      value={state.input}
      onChangeText={(text) => update((s) => ({ ...s, input: text }))}
    />
  );
}

function ComposerSubmit() {
  const {
    actions: { submit },
  } = useContext(ComposerContext);
  return <Button onPress={submit}>Send</Button>;
}

// Export as compound component
const Composer = {
  Provider: ComposerProvider,
  Frame: ComposerFrame,
  Input: ComposerInput,
  Submit: ComposerSubmit,
  Header: ComposerHeader,
  Footer: ComposerFooter,
  Attachments: ComposerAttachments,
  Formatting: ComposerFormatting,
  Emojis: ComposerEmojis,
};

// Usage — consumers explicitly compose exactly what they need
<Composer.Provider state={state} actions={actions} meta={meta}>
  <Composer.Frame>
    <Composer.Header />
    <Composer.Input />
    <Composer.Footer>
      <Composer.Formatting />
      <Composer.Submit />
    </Composer.Footer>
  </Composer.Frame>
</Composer.Provider>;
```

No hidden conditionals. State, actions, and meta are dependency-injected by a parent provider.

---

## Explicit Component Variants

[GUIDE] Instead of one component with many boolean props, create explicit variant components. Each variant composes the pieces it needs.

**Incorrect (one component, many modes):**

```tsx
<Composer
  isThread
  isEditing={false}
  channelId="abc"
  showAttachments
  showFormatting={false}
/>
```

**Correct (explicit variants):**

```tsx
// Usage — each variant is a standalone component
<ThreadComposer channelId="abc" />
<EditMessageComposer messageId="xyz" />
<ForwardMessageComposer messageId="123" />

// Implementation — each variant composes only what it needs
function ThreadComposer({ channelId }: { channelId: string }) {
  return (
    <ThreadProvider channelId={channelId}>
      <Composer.Frame>
        <Composer.Input />
        <AlsoSendToChannelField channelId={channelId} />
        <Composer.Footer>
          <Composer.Formatting />
          <Composer.Emojis />
          <Composer.Submit />
        </Composer.Footer>
      </Composer.Frame>
    </ThreadProvider>
  );
}

function EditMessageComposer({ messageId }: { messageId: string }) {
  return (
    <EditMessageProvider messageId={messageId}>
      <Composer.Frame>
        <Composer.Input />
        <Composer.Footer>
          <Composer.Formatting />
          <Composer.Emojis />
          <Composer.CancelEdit />
          <Composer.SaveEdit />
        </Composer.Footer>
      </Composer.Frame>
    </EditMessageProvider>
  );
}
```

Each variant is explicit about what provider/state it uses, what UI it includes, and what actions are available. No boolean prop combinations. Impossible to express invalid states.

---

## Children Over Render Props

[GUIDE] Use `children` for composition instead of `renderX` props. Children are more readable, compose naturally, and don't require understanding callback signatures.

**Incorrect (render props):**

```tsx
<Composer
  renderHeader={() => <CustomHeader />}
  renderFooter={() => (
    <>
      <Formatting />
      <Emojis />
    </>
  )}
  renderActions={() => <SubmitButton />}
/>
```

**Correct (compound components with children):**

```tsx
// Children for structural composition
<Composer.Frame>
  <CustomHeader />
  <Composer.Input />
  <Composer.Footer>
    <Composer.Formatting />
    <Composer.Emojis />
    <SubmitButton />
  </Composer.Footer>
</Composer.Frame>

// Exception: render props when the parent needs to pass data back
<List
  data={items}
  renderItem={({ item, index }) => <Item item={item} index={index} />}
/>
```

Use render props when the parent needs to provide data to the child. Use children when composing static structure.

---

## Generic Context Interface

[WARN] Define a generic interface for component context with three parts: `state`, `actions`, and `meta`. This interface is a contract that any provider can implement, enabling the same UI components to work with different state implementations.

```tsx
interface ComposerState {
  input: string;
  attachments: Attachment[];
  isSubmitting: boolean;
}

interface ComposerActions {
  update: (updater: (state: ComposerState) => ComposerState) => void;
  submit: () => void;
}

interface ComposerMeta {
  inputRef: React.RefObject<TextInput>;
}

interface ComposerContextValue {
  state: ComposerState;
  actions: ComposerActions;
  meta: ComposerMeta;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);
```

UI components consume the interface, not the implementation. Different providers implement the same interface, so the same UI works with any state source:

```tsx
// UI component — depends only on the context interface
function ComposerInput() {
  const {
    state,
    actions: { update },
    meta,
  } = useContext(ComposerContext);

  return (
    <TextInput
      ref={meta.inputRef}
      value={state.input}
      onChangeText={(text) => update((s) => ({ ...s, input: text }))}
    />
  );
}

// Provider A — local state for ephemeral forms
function ForwardMessageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const inputRef = useRef(null);
  const submit = useForwardMessage();

  return (
    <ComposerContext
      value={{
        state,
        actions: { update: setState, submit },
        meta: { inputRef },
      }}
    >
      {children}
    </ComposerContext>
  );
}

// Provider B — global synced state for channels
function ChannelProvider({ channelId, children }: Props) {
  const { state, update, submit } = useGlobalChannel(channelId);
  const inputRef = useRef(null);

  return (
    <ComposerContext
      value={{ state, actions: { update, submit }, meta: { inputRef } }}
    >
      {children}
    </ComposerContext>
  );
}
```

The same composed UI works with both providers. Swap the provider, keep the UI.

---

## Lift State into Providers

[WARN] Move state management into dedicated provider components. This allows sibling components outside the main UI to access and modify state without prop drilling or awkward refs.

**Incorrect (state trapped inside component):**

```tsx
function ForwardMessageComposer() {
  const [state, setState] = useState(initialState);
  const forwardMessage = useForwardMessage();

  return (
    <Composer.Frame>
      <Composer.Input />
      <Composer.Footer />
    </Composer.Frame>
  );
}

// Problem: ForwardButton and MessagePreview cannot access composer state
function ForwardMessageDialog() {
  return (
    <Dialog>
      <ForwardMessageComposer />
      <MessagePreview />
      <DialogActions>
        <CancelButton />
        <ForwardButton />
      </DialogActions>
    </Dialog>
  );
}
```

**Correct (state lifted to provider):**

```tsx
function ForwardMessageProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const forwardMessage = useForwardMessage();
  const inputRef = useRef(null);

  return (
    <Composer.Provider
      state={state}
      actions={{ update: setState, submit: forwardMessage }}
      meta={{ inputRef }}
    >
      {children}
    </Composer.Provider>
  );
}

function ForwardMessageDialog() {
  return (
    <ForwardMessageProvider>
      <Dialog>
        <Composer.Frame>
          <Composer.Input placeholder="Add a message, if you'd like." />
          <Composer.Footer>
            <Composer.Formatting />
            <Composer.Emojis />
          </Composer.Footer>
        </Composer.Frame>
        <MessagePreview />
        <DialogActions>
          <CancelButton />
          <ForwardButton />
        </DialogActions>
      </Dialog>
    </ForwardMessageProvider>
  );
}

// Lives OUTSIDE Composer.Frame but can still access state and actions
function ForwardButton() {
  const { actions } = useContext(ComposerContext);
  return <Button onPress={actions.submit}>Forward</Button>;
}

function MessagePreview() {
  const { state } = useContext(ComposerContext);
  return <Preview message={state.input} attachments={state.attachments} />;
}
```

Components that need shared state don't have to be visually nested inside each other — they just need to be within the same provider.

---

## Decouple State from UI

[GUIDE] The provider component should be the only place that knows how state is managed. UI components consume the context interface — they don't know if state comes from `useState`, Zustand, or a server sync.

**Incorrect (UI coupled to state implementation):**

```tsx
function ChannelComposer({ channelId }: { channelId: string }) {
  const state = useGlobalChannelState(channelId);
  const { submit, updateInput } = useChannelSync(channelId);

  return (
    <Composer.Frame>
      <Composer.Input
        value={state.input}
        onChange={(text) => updateInput(text)}
      />
      <Composer.Submit onPress={() => submit()} />
    </Composer.Frame>
  );
}
```

**Correct (state isolated in provider):**

```tsx
function ChannelProvider({
  channelId,
  children,
}: {
  channelId: string;
  children: React.ReactNode;
}) {
  const { state, update, submit } = useGlobalChannel(channelId);
  const inputRef = useRef(null);

  return (
    <Composer.Provider
      state={state}
      actions={{ update, submit }}
      meta={{ inputRef }}
    >
      {children}
    </Composer.Provider>
  );
}

// UI only knows about the context interface
function ChannelComposer() {
  return (
    <Composer.Frame>
      <Composer.Header />
      <Composer.Input />
      <Composer.Footer>
        <Composer.Submit />
      </Composer.Footer>
    </Composer.Frame>
  );
}

// Usage
function Channel({ channelId }: { channelId: string }) {
  return (
    <ChannelProvider channelId={channelId}>
      <ChannelComposer />
    </ChannelProvider>
  );
}
```

The same `Composer.Input` works with any provider because it only depends on the context interface, not the implementation.

---

## React 19 API Changes

> React 19+ only. Skip this section for React 18 or earlier.

[GUIDE] In React 19, `ref` is a regular prop (no `forwardRef` wrapper needed) and `use()` replaces `useContext()`.

| Change              | React 18                      | React 19                                       |
| ------------------- | ----------------------------- | ---------------------------------------------- |
| Ref forwarding      | `forwardRef<T, P>((p, r) =>)` | `function Comp({ ref, ...props }: Props)`      |
| Context consumption | `useContext(MyContext)`       | `use(MyContext)` (can be called conditionally) |

**Refs as regular props:**

```tsx
// React 18
const ComposerInput = forwardRef<TextInput, Props>((props, ref) => {
  return <TextInput ref={ref} {...props} />;
});

// React 19
function ComposerInput({
  ref,
  ...props
}: Props & { ref?: React.Ref<TextInput> }) {
  return <TextInput ref={ref} {...props} />;
}
```

**`use()` instead of `useContext()`:**

```tsx
// React 18
const value = useContext(MyContext);

// React 19
const value = use(MyContext);
```

---

## Quick Reference

| Task                        | Pattern                                         |
| --------------------------- | ----------------------------------------------- |
| Avoid boolean props         | Create explicit variant components              |
| Build complex components    | Compound components with shared context         |
| Compose structure           | `children` prop, not `renderX` callbacks        |
| Pass data to children       | Render props (only when parent provides data)   |
| Define component contract   | Generic context interface: state, actions, meta |
| Share state across siblings | Lift state into a provider component            |
| Swap state implementations  | Different providers, same context interface     |
| Forward refs (React 19)     | `ref` as a regular prop, no `forwardRef`        |
| Consume context (React 19)  | `use(Context)` instead of `useContext(Context)` |

---

## Checklist

- [ ] No boolean props for component variants
- [ ] Complex components use compound component pattern
- [ ] Shared state exposed via context with `state`, `actions`, `meta` interface
- [ ] State management isolated in provider components
- [ ] UI components consume context interface, not state implementation
- [ ] Children used for structural composition
- [ ] Render props used only when parent passes data to children
- [ ] Explicit variant components for each use case
- [ ] React 19 (optional): `use()` instead of `useContext()`, `ref` as prop
