// Builds the browser test page and runs it. Usage: bun test-browser/run.ts [chromium|firefox|webkit|safari ...]
import { join, resolve } from 'node:path';

const dir = import.meta.dir;
const dist = join(dir, 'dist');
if (!process.env.SKIP_BUILD) {
    const result = await Bun.build({ entrypoints: [join(dir, 'page.html')], outdir: dist });
    if (!result.success) throw new Error(result.logs.join('\n'));
}
const server = Bun.serve({
    port: 0,
    fetch(req) {
        const path = new URL(req.url).pathname;
        const file = Bun.file(join(dist, path === '/' ? 'page.html' : path));
        return file.size ? new Response(file) : new Response('', { status: 404 });
    },
});
const url = `http://127.0.0.1:${server.port}/`;

async function viaPlaywright(name: string) {
    const pw = (await import('playwright')) as any;
    const browser = await pw[name].launch();
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as any).__result, null, { timeout: 60000 });
    const result = await page.evaluate(() => (window as any).__result);
    await browser.close();
    return result;
}

async function viaSafari() {
    const port = 4460;
    const proc = Bun.spawn(['safaridriver', '-p', String(port)]);
    await Bun.sleep(1000);
    const call = async (method: string, path: string, body?: unknown) => {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const json = (await res.json()) as { value: any };
        if (json.value && json.value.error) throw new Error(json.value.message);
        return json.value;
    };
    const sid = (await call('POST', '/session', { capabilities: {} })).sessionId;
    try {
        await call('POST', `/session/${sid}/url`, { url });
        for (;;) {
            const r = await call('POST', `/session/${sid}/execute/sync`, { script: 'return window.__result || null', args: [] });
            if (r) return r;
            await Bun.sleep(200);
        }
    } finally {
        await call('DELETE', `/session/${sid}`);
        proc.kill();
    }
}

let failed = 0;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium']) {
    const result = name === 'safari' ? await viaSafari() : await viaPlaywright(name);
    if (result.error) {
        console.log(`${name}: ERROR ${result.error}`);
        failed++;
        continue;
    }
    const bad = result.checks.filter((c: any) => !c.ok);
    failed += bad.length;
    console.log(`${name}: ${result.checks.length - bad.length}/${result.checks.length} passed (registerProperty: ${result.canRegister})`);
    for (const c of bad) console.log(`  FAIL ${c.name}: ${c.detail}`);
}
server.stop();
process.exit(failed ? 1 : 0);
