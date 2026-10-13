<h1 align="center">Typed OM</h1>

<p align="center">
  Typed reads and change detection of CSS custom properties for Axiom Design System, with or without CSS Typed OM.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ax-design/typed-om"><img src="https://img.shields.io/npm/v/@ax-design/typed-om.svg" alt="npm version"></a>
  <a href="https://github.com/ax-design/typed-om/actions/workflows/ci.yml"><img src="https://github.com/ax-design/typed-om/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT Licence" />
</p>

## Installation

```bash
// with npm
npm install @ax-design/typed-om

// with bun
bun add @ax-design/typed-om
```

and import it:

```javascript
import { StyleSchema, StyleBinding } from '@ax-design/typed-om';
```

## Usage

CSS Typed OM and `@property` are not available in every browser your users have, and reading `getComputedStyle` by hand means parsing `calc()`, `em` and colors yourself.
To read your custom properties as numbers, describe them once with a schema and bind it to your elements.
Here's an example:

```javascript
import { StyleSchema, StyleBinding } from '@ax-design/typed-om';

const schema = new StyleSchema([
  { name: '--my-radius', syntax: { type: 'length-percentage' }, initial: '0px', inherits: false, register: true },
  { name: '--my-color', syntax: { type: 'color' }, initial: 'black', inherits: true },
  { name: '--my-mode', syntax: { type: 'keyword', values: ['soft', 'hard'] }, initial: 'soft', inherits: false },
]);

// Inside your custom element, with a shadow root:
const binding = new StyleBinding(schema, this, this.shadowRoot);
binding.read();
binding.get('--my-radius'); // { px: 4, percent: 10 } for calc(10% + 4px)
binding.get('--my-color'); // [255, 0, 0, 1]
binding.get('--my-mode'); // 'soft'
```

Values in common forms (`12px`, `50%`, `calc(50% + 4px)`, `rgb()`, `#hex`, keywords) are parsed directly. Anything else (`calc(1em + 2px)`, `red`) goes through a hidden probe element, so the browser does the math.

`register: true` registers the property with `CSS.registerProperty` where it exists, so your transitions on it interpolate. Where it does not exist, everything still works and transitions jump to the end value.

### Watching changes

```javascript
binding.observe(() => {
  // Something changed: read again on the next frame.
});
binding.unobserve();
```

The detector lives in the shadow root and costs a little on every style change of the page, so attach it only while your element is visible.

### Skipping properties

A property can be skipped when another property makes it irrelevant, which saves reads:

```javascript
{ name: '--my-depth', syntax: { type: 'length' }, initial: '0px', inherits: false, skipWhen: { property: '--my-mode', values: ['soft'] } }
```

## Browser support

Typed OM works in browsers released since 2016 that support custom properties and Shadow DOM. Keyword values cannot be CSS-wide keywords (`initial`, `inherit` and so on), and changes of a keyword to `none` are not seen by the detector.
