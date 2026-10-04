# Frontend and visual slop

Ask a model for a "modern, clean" interface with no other constraint and it resolves those words
to the highest-frequency patterns in its training data. Every wave of generated UI converges on
the same median: purple gradients, glass panels, centered heroes, three-column card grids.

The failure is not that any one of these is bad. It is that they are chosen by default rather than
by decision, and a default is visible.

Two tiers below. **Aesthetic tells** need a human decision, so flag them and propose alternatives.
**Correctness failures** ride along with generated UI and should be fixed outright.

---

## Aesthetic tells — flag, do not silently rewrite

### F01 · The purple gradient

The signature marker. Violet-to-blue or violet-to-pink, applied to buttons, headings, backgrounds,
and decorative shapes at once.

**Grep for:**
```
from-purple-  to-blue-   from-violet-  to-indigo-   from-fuchsia-
#667eea   #764ba2   #6366f1   #8b5cf6   #a855f7
linear-gradient(135deg
```
`#667eea → #764ba2` at 135 degrees is the single most reproduced gradient in generated UI.

**Instead:** one accent color, chosen for the product. Gradients used once, as emphasis, not as a
theme. If a gradient is genuinely wanted, make it two neighboring hues rather than a sweep across
the wheel.

### F02 · Gradient text on the headline

```
bg-gradient-to-r from-X to-Y bg-clip-text text-transparent
```

Costs contrast, breaks selection styling, and reads as a template. Solid text.

### F03 · Glassmorphism everywhere

```
backdrop-blur   bg-white/10   bg-white/5   border-white/20   bg-opacity-
```

Blur is expensive to composite and mostly reduces legibility. Use it where there is genuinely a
layer to see through, such as a sticky header over content. Not on every card.

### F04 · Blurred background orbs

Large absolutely-positioned circles with heavy blur and low opacity, floating behind the hero.
Look for `absolute` plus `rounded-full` plus `blur-3xl` plus `opacity-`.

Purely decorative, universally generated. Delete or replace with something that means something.

### F05 · Unexamined default typeface

Inter, Roboto, or the system stack, chosen because it is the default rather than because it fits.
Inter is a good typeface. It is also the visual equivalent of a shrug.

**Instead:** pick deliberately, or say plainly that the typeface is a placeholder awaiting a design
decision. Do not present a default as a choice.

### F06 · The centered hero

Full-viewport section, centered stack, oversized headline, one-line subhead, two buttons side by
side (one filled, one outline or ghost), often a scroll-down chevron.

**Instead:** asymmetric layouts, content that starts above the fold, a real product screenshot,
or a shorter hero. Two CTAs of similar weight is usually one CTA too many.

### F07 · The three-column card grid

```
grid grid-cols-1 md:grid-cols-3 gap-8
```
with `rounded-2xl`, `shadow-xl`, `border`, `p-6`, an icon, a bolded title, and two lines of body
copy in each cell. Three features, always three, because of the same rule-of-three pull that shows
up in generated prose.

**Instead:** the number of features you actually have. Vary the cells if they carry different
weight. Consider a list.

### F08 · Emoji as iconography

🚀 ⚡ 🎯 ✨ 🔥 in feature cards and headings. Renders inconsistently across platforms, does not
inherit color, carries unintended screen-reader semantics.

**Instead:** a real icon set, or no icons.

### F09 · Uniform corner radius and shadow

`rounded-2xl` and `shadow-xl` on every surface regardless of elevation. Radius and shadow should
encode hierarchy. When everything is elevated, nothing is.

### F10 · Animate-on-scroll everything

Every section fading and translating in as it enters the viewport. Slows perceived load, fights
the reader, and usually ignores `prefers-reduced-motion`.

**Instead:** motion on things that change state. Respect the reduced-motion query, always.

### F11 · The generated dark mode

`#0a0a0a` or pure `#000` background, a neon accent, low-contrast gray body text. Real dark themes
use elevated near-blacks around `#121212` to `#1a1a1a` and desaturate accents rather than
brightening them.

### F12 · Fabricated social proof

Invented testimonials with invented names, "Trusted by" logo rows for companies that are not
customers, made-up metrics ("10,000+ developers", "99.99% uptime"), fake star ratings.

**This is not an aesthetic finding. Never generate it.** It is a factual claim about the world.
Use a placeholder that is visibly a placeholder, or omit the section.

### F13 · Filler copy

"Build faster. Ship smarter." "The all-in-one platform for modern teams." "Everything you need,
nothing you don't." Copy that would fit any product fits no product.

Run generated marketing copy through the `humanize-writing` skill if it is installed. The tells
are the same ones.

### F14 · Icon-only controls with no label

Buttons that are a bare icon with no accessible name. Fails screen readers, and often fails
sighted users too. Add a label or `aria-label`.

---

## Correctness failures — fix these

Generated UI omits the same accessibility and robustness work every time. These are not taste.

### F20 · No visible focus state

```css
outline: none;        /* with no replacement */
focus:outline-none    /* with no focus-visible: ring */
```
Keyboard users lose their place entirely. If you remove the default outline you must supply a
`:focus-visible` style. This is the most common accessibility defect in generated UI.

### F21 · Non-semantic interactive elements

`<div onClick>` and `<span onClick>` instead of `<button>`. Not focusable, no keyboard activation,
no role. Use the real element. If you truly cannot, you owe it `role`, `tabIndex`, and both
Enter and Space handlers, and you almost certainly can just use a `<button>`.

### F22 · Missing text alternatives

Images without `alt`, form inputs without an associated `<label>`, icon buttons without an
accessible name. Decorative images take `alt=""`, not a missing attribute.

### F23 · Contrast failures

`text-gray-400` and `text-gray-500` on white are the repeat offenders, along with white text on
mid-tone gradients and placeholder text as the only label. WCAG AA is 4.5:1 for body text and
3:1 for large text. Check it rather than eyeballing it.

### F24 · No loading, empty, or error states

Generated components render the success case only. Every component that fetches needs all four
states. Every list needs an empty state. Ask what renders while the data is in flight and what
renders when the request fails.

### F25 · Fixed pixel sizing

`w-[1200px]`, fixed heights on text containers, no fluid type. Breaks on small viewports and
under browser zoom. Use relative units and let content determine height.

### F26 · Unkeyed or index-keyed lists

`key={index}` in React reorders incorrectly on insert and delete. Use a stable identifier.

### F27 · Unsanitized HTML injection

`dangerouslySetInnerHTML`, `v-html`, `innerHTML =` with any value that is not a literal. This is
an XSS vector. Sanitize, or restructure so it is unnecessary.

### F28 · Layout shift

Images and embeds with no width and height, content injected above existing content, fonts
swapping without `font-display`. Reserve the space.

---

## Doing better than the defaults

When you have to make visual decisions without a designer, three things move the result more than
any individual rule.

**Take constraints from the product.** Brand colors, existing components, the domain. A finance
dashboard and a music app should not converge, and they only do so when the generator has nothing
to go on. Ask for constraints before inventing them.

**Use a spacing and type scale, and stick to it.** Arbitrary values (`p-[13px]`, `text-[15px]`)
are a symptom of no system. Consistency reads as intent more reliably than any specific choice.

**Follow the project's design system if one exists.** Look for `DESIGN.md`, a tokens file, a
Tailwind theme extension, a Figma export, or an existing component library. Matching an
established system beats generating a better one.

If the project has no design direction at all, say so and ask, rather than defaulting. The default
is what this file is about.

---

## Quick grep

```bash
# gradient and glass tells
grep -rniE 'from-(purple|violet|indigo|fuchsia)|#667eea|#764ba2|backdrop-blur|bg-clip-text' src/

# accessibility failures
grep -rniE 'outline-none|outline: *none|<div[^>]*onClick|key=\{i(ndex)?\}' src/
grep -rn '<img' src/ | grep -v 'alt='

# injection
grep -rniE 'dangerouslySetInnerHTML|v-html|innerHTML *=' src/

# low-contrast defaults
grep -rniE 'text-(gray|slate|zinc)-(300|400|500)' src/
```
