import { describe, expect, test } from 'bun:test';
import { buildDetector, keywordMirrors } from './detector.js';
import type { PropertySpec } from './schema.js';

describe('keywordMirrors', () => {
    test('only keyword-capable numeric specs get a mirror', () => {
        const schema: PropertySpec[] = [
            { name: '--len', syntax: { type: 'length', keywords: ['auto'] }, initial: 'auto', inherits: false },
            { name: '--lp', syntax: { type: 'length-percentage', keywords: ['auto'] }, initial: 'auto', inherits: false },
            { name: '--num', syntax: { type: 'number', keywords: ['auto'] }, initial: 'auto', inherits: false },
            { name: '--plain', syntax: { type: 'length' }, initial: '0px', inherits: false },
            { name: '--color', syntax: { type: 'color', keywords: ['red'] }, initial: 'rgb(0,0,0)', inherits: true },
            { name: '--kw', syntax: { type: 'keyword', values: ['a', 'b'] }, initial: 'a', inherits: false },
        ];
        const ms = keywordMirrors(schema);
        expect(ms.map((m) => m.property)).toEqual(['--len', '--lp', '--num']);
        expect(ms.map((m) => m.name)).toEqual(['--ax-typed-om-kw-m0', '--ax-typed-om-kw-m1', '--ax-typed-om-kw-m2']);
        expect(ms.map((m) => m.syntax)).toEqual(['<length>', '<length-percentage>', '<number>']);
        expect(ms.map((m) => m.initial)).toEqual(['0px', '0px', '0']);
    });
});

describe('buildDetector keyword mirror', () => {
    test('keyword spec folds through the registered mirror with a zero fallback', () => {
        const schema: PropertySpec[] = [
            { name: '--w', syntax: { type: 'length', keywords: ['auto'] }, initial: 'auto', inherits: true, register: true },
        ];
        const css = buildDetector(schema).css;
        expect(css).toContain('--ax-typed-om-kw-m0: var(--w);');
        expect(css).toContain('var(--ax-typed-om-kw-m0, 0px)');
        // The raw property with its keyword initial must never enter the calc.
        expect(css).not.toContain('var(--w, auto)');
    });

    test('non-keyword numeric specs keep the raw property', () => {
        const schema: PropertySpec[] = [
            { name: '--plain', syntax: { type: 'length' }, initial: '0px', inherits: true, register: true },
        ];
        const css = buildDetector(schema).css;
        expect(css).toContain('var(--plain, 0px)');
        expect(css).not.toContain('kw-m');
    });
});
