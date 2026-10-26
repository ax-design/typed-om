import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { registerProperties } from './register.js';
import type { PropertySpec } from './schema.js';

// A CSS.registerProperty that throws for a name it has registered, as a browser does, and counts its calls.
interface FakeCss {
    registerProperty(definition: { name: string }): void;
}

let calls: string[] = [];
let taken: Set<string>;
const saved = (globalThis as { CSS?: unknown }).CSS;

beforeEach(() => {
    calls = [];
    taken = new Set();
    (globalThis as { CSS?: FakeCss }).CSS = {
        registerProperty(definition) {
            calls.push(definition.name);
            if (taken.has(definition.name)) {
                const error = new Error('already registered');
                error.name = 'InvalidModificationError';
                throw error;
            }
            taken.add(definition.name);
        },
    };
});

afterEach(() => {
    (globalThis as { CSS?: unknown }).CSS = saved;
});

describe('registerProperties', () => {
    test('a name is asked of the browser once, however many schemas hold it', () => {
        const a: PropertySpec[] = [
            { name: '--once-a', syntax: { type: 'length' }, initial: '0px', inherits: false, register: true },
            { name: '--once-b', syntax: { type: 'number' }, initial: '1', inherits: true, register: true },
            { name: '--once-not', syntax: { type: 'number' }, initial: '1', inherits: true },
        ];
        const first = registerProperties(a);
        expect([...first].sort()).toEqual(['--once-a', '--once-b']);
        expect(calls).toEqual(['--once-a', '--once-b']);
        // Another schema with the same names and one more: only the new one is asked.
        const second = registerProperties([...a, { name: '--once-c', syntax: { type: 'length' }, initial: '0px', inherits: false, register: true }]);
        expect([...second].sort()).toEqual(['--once-a', '--once-b', '--once-c']);
        expect(calls).toEqual(['--once-a', '--once-b', '--once-c']);
    });

    test('a name that another copy registered is found registered, and not asked again', () => {
        taken.add('--other-copy');
        const schema: PropertySpec[] = [{ name: '--other-copy', syntax: { type: 'length' }, initial: '0px', inherits: false, register: true }];
        expect([...registerProperties(schema)]).toEqual(['--other-copy']);
        expect([...registerProperties(schema)]).toEqual(['--other-copy']);
        expect(calls).toEqual(['--other-copy']);
    });

    test('the mirrors of keyword and time specs are asked once too', () => {
        const schema: PropertySpec[] = [
            { name: '--mirror-w', syntax: { type: 'length', keywords: ['auto'] }, initial: 'auto', inherits: false, register: true },
            { name: '--mirror-t', syntax: { type: 'time' }, initial: '1s', inherits: false, register: true },
        ];
        registerProperties(schema);
        const asked = calls.length;
        expect(asked).toBeGreaterThan(2);
        registerProperties(schema);
        expect(calls.length).toBe(asked);
    });

    test('an error that is not a repeat is thrown', () => {
        (globalThis as { CSS?: FakeCss }).CSS = {
            registerProperty() {
                throw new SyntaxError('bad syntax');
            },
        };
        expect(() => registerProperties([{ name: '--bad-syntax', syntax: { type: 'length' }, initial: '0px', inherits: false, register: true }])).toThrow('bad syntax');
    });
});
