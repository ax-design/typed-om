import { keywordMirrors, timeMirrors } from './detector.js';
import { cssSyntax } from './schema.js';
import type { PropertySpec } from './schema.js';

interface RegisterPropertyDefinition {
    name: string;
    syntax: string;
    inherits: boolean;
    initialValue: string;
}

type CSSWithRegister = { registerProperty?: (definition: RegisterPropertyDefinition) => void };

export function canRegister(): boolean {
    return typeof CSS !== 'undefined' && typeof (CSS as unknown as CSSWithRegister).registerProperty === 'function';
}

// The names this copy has registered or found registered. Asking the browser again throws for each
// one (an exception with its stack, for every property of every new schema: hundreds on a page of
// surfaces with different layers), so each name is asked once.
const known = new Set<string>();

// Registers the properties that ask for it. Returns the names that are registered after the
// call, including ones another copy of the package registered before (first registration
// wins, so definitions must never change between versions), and the time mirrors of the
// detector (see timeMirrors).
export function registerProperties(schema: PropertySpec[]): Set<string> {
    const registered = new Set<string>();
    if (!canRegister()) return registered;
    const css = CSS as unknown as CSSWithRegister;
    for (const spec of schema) {
        if (!spec.register) continue;
        if (known.has(spec.name)) {
            registered.add(spec.name);
            continue;
        }
        try {
            css.registerProperty!({ name: spec.name, syntax: cssSyntax(spec.syntax), inherits: spec.inherits, initialValue: spec.initial });
            registered.add(spec.name);
            known.add(spec.name);
        } catch (error) {
            // InvalidModificationError: already registered by an earlier copy.
            if (error && (error as Error).name === 'InvalidModificationError') {
                registered.add(spec.name);
                known.add(spec.name);
            } else throw error;
        }
    }
    // Numeric specs that may hold a keyword get a registered mirror with a pure numeric syntax,
    // so the keyword is rejected at computed-value time and the numeric hash stays legal. The
    // mirror is internal (never read by the reader) and its definition is derived from the
    // permanent schema contract, so a re-registration by another copy is the same definition.
    for (const m of keywordMirrors(schema)) {
        if (known.has(m.name)) continue;
        try {
            css.registerProperty!({ name: m.name, syntax: m.syntax, inherits: true, initialValue: m.initial });
        } catch (error) {
            // Already registered by an earlier copy with the identical definition.
            if (!error || (error as Error).name !== 'InvalidModificationError') throw error;
        }
        known.add(m.name);
    }
    // Time specs get a registered <time> mirror on the detector element, the only way to make a
    // time transition (and so be observed). Same definition for every schema, like the above.
    for (const m of timeMirrors(schema)) {
        if (known.has(m.name)) {
            registered.add(m.name);
            continue;
        }
        try {
            css.registerProperty!({ name: m.name, syntax: '<time>', inherits: false, initialValue: '0s' });
            registered.add(m.name);
            known.add(m.name);
        } catch (error) {
            if (error && (error as Error).name === 'InvalidModificationError') {
                registered.add(m.name);
                known.add(m.name);
            } else throw error;
        }
    }
    return registered;
}
