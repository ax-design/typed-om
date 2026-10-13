// Description of one custom property the caller wants to read and observe.
export type PropertySyntax =
    | { type: 'length' }
    | { type: 'length-percentage' }
    | { type: 'number' }
    // `keywords`: extra identifiers the property may hold instead of a color (returned as strings).
    | { type: 'color'; keywords?: string[] }
    // Allowed values. CSS-wide keywords are rejected. `none` is allowed for existing APIs, but
    // the keyword detector maps values to animation names, where `none` means "no animation":
    // a change *to* `none` is not seen by the detector (callers with other triggers are fine).
    // New schemas should avoid it.
    | { type: 'keyword'; values: string[] };

export interface PropertySpec {
    name: string;
    syntax: PropertySyntax;
    // CSS text of the initial value, also used as the var() fallback when unregistered.
    initial: string;
    inherits: boolean;
    // Register with CSS.registerProperty where available, so author transitions interpolate.
    register?: boolean;
    // Skip reading this property (it keeps its initial value) when an earlier property in the
    // schema holds one of these keywords. Saves reads for properties that cannot matter, such as
    // the size of an edge feature on a flat edge.
    skipWhen?: { property: string; values: string[] };
}

export interface LengthPercentage {
    px: number;
    // Percentage part, 50 for 50%.
    percent: number;
}

export type Rgba = [number, number, number, number];

export type PropertyValue = LengthPercentage | number | string | Rgba | null;

const RESERVED = ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'];

export function validateSchema(schema: PropertySpec[]): void {
    const seen: string[] = [];
    for (const spec of schema) {
        if (spec.skipWhen && seen.indexOf(spec.skipWhen.property) < 0) {
            throw new Error(`${spec.name}: skipWhen refers to ${spec.skipWhen.property}, which must come earlier in the schema`);
        }
        seen.push(spec.name);
        if (spec.name.indexOf('--') !== 0) throw new Error(`${spec.name} is not a custom property name`);
        if (spec.syntax.type !== 'keyword') continue;
        for (const value of spec.syntax.values) {
            if (RESERVED.indexOf(value) >= 0) throw new Error(`${spec.name}: keyword "${value}" cannot be observed`);
            if (!/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(value)) throw new Error(`${spec.name}: "${value}" is not an identifier`);
        }
    }
}

export function cssSyntax(syntax: PropertySyntax): string {
    switch (syntax.type) {
        case 'length':
            return '<length>';
        case 'length-percentage':
            return '<length-percentage>';
        case 'number':
            return '<number>';
        case 'color':
            return syntax.keywords && syntax.keywords.length ? `<color> | ${syntax.keywords.join(' | ')}` : '<color>';
        case 'keyword':
            return syntax.values.join(' | ');
    }
}
