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

// Registers the properties that ask for it. Returns the names that are registered after the
// call, including ones another copy of the package registered before (first registration
// wins, so definitions must never change between versions).
export function registerProperties(schema: PropertySpec[]): Set<string> {
    const registered = new Set<string>();
    if (!canRegister()) return registered;
    const css = CSS as unknown as CSSWithRegister;
    for (const spec of schema) {
        if (!spec.register) continue;
        try {
            css.registerProperty!({ name: spec.name, syntax: cssSyntax(spec.syntax), inherits: spec.inherits, initialValue: spec.initial });
            registered.add(spec.name);
        } catch (error) {
            // InvalidModificationError: already registered by an earlier copy.
            if (error && (error as Error).name === 'InvalidModificationError') registered.add(spec.name);
            else throw error;
        }
    }
    return registered;
}
