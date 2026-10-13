import { attachDetector, buildDetector } from './detector.js';
import type { DetectorHandle, DetectorTemplate } from './detector.js';
import { StyleReader } from './reader.js';
import type { ReadStats } from './reader.js';
import { registerProperties } from './register.js';
import { validateSchema } from './schema.js';
import type { PropertySpec, PropertyValue } from './schema.js';

// One schema shared by many hosts: validated, registered and compiled once.
export class StyleSchema {
    readonly specs: PropertySpec[];
    readonly reader: StyleReader;
    readonly detector: DetectorTemplate;
    readonly registered: Set<string>;
    private index: { [name: string]: number } = {};

    constructor(specs: PropertySpec[]) {
        validateSchema(specs);
        this.specs = specs;
        this.registered = registerProperties(specs);
        this.reader = new StyleReader(specs);
        this.detector = buildDetector(specs, this.registered);
        specs.forEach((spec, i) => (this.index[spec.name] = i));
    }

    indexOf(name: string): number {
        const i = this.index[name];
        if (i === undefined) throw new Error(`${name} is not in the schema`);
        return i;
    }
}

// Per-host state: the latest values and an optional attached detector.
export class StyleBinding {
    readonly schema: StyleSchema;
    readonly host: Element;
    readonly root: ShadowRoot;
    values: PropertyValue[] = [];
    readonly stats: ReadStats = { slow: 0 };
    private handle: DetectorHandle | null = null;

    constructor(schema: StyleSchema, host: Element, root: ShadowRoot) {
        this.schema = schema;
        this.host = host;
        this.root = root;
    }

    read(): PropertyValue[] {
        return this.schema.reader.read(this.host, this.root, this.values, this.stats);
    }

    get(name: string): PropertyValue {
        return this.values[this.schema.indexOf(name)];
    }

    get observing(): boolean {
        return this.handle !== null;
    }

    observe(onChange: () => void): void {
        if (this.handle) return;
        this.handle = attachDetector(this.root, this.schema.detector, onChange);
    }

    unobserve(): void {
        if (!this.handle) return;
        this.handle.detach();
        this.handle = null;
    }
}
