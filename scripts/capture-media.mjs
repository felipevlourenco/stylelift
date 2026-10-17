// Renders the marketplace icon and README screenshots/GIF by driving a real VS Code
// (the one `pnpm test` downloads into .vscode-test) over the Chrome DevTools Protocol.
//   node scripts/capture-media.mjs icon     -> images/icon.png
//   node scripts/capture-media.mjs shots    -> images/*.png and images/demo.gif
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
import pngjs from 'pngjs';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vscodeDir = join(root, '.vscode-test');
const build = readdirSync(vscodeDir).find((d) => d.startsWith('vscode-darwin'));
const CODE = join(vscodeDir, build, 'Visual Studio Code.app/Contents/MacOS/Code');
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#7C3AED"/></linearGradient>
    <linearGradient id="arrow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FB923C"/><stop offset="1" stop-color="#FDE047"/></linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <g fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M100 52 Q76 52 76 76 L76 106 Q76 128 54 128 Q76 128 76 150 L76 180 Q76 204 100 204"/>
    <path d="M156 52 Q180 52 180 76 L180 106 Q180 128 202 128 Q180 128 180 150 L180 180 Q180 204 156 204"/>
  </g>
  <path d="M128 70 L100 108 H119 V184 H137 V108 H156 Z" fill="url(#arrow)" stroke="url(#arrow)" stroke-width="6" stroke-linejoin="round"/>
</svg>`;

const DEMO = `import React from 'react';
import { View, Text, Image } from 'react-native';

export function ProfileCard({ name, size }: { name: string; size: number }) {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
      <Image
        source={{ uri: 'https://example.com/avatar.png' }}
        style={{ width: size, height: size, borderRadius: 8 }}
      />
      <Text style={{ fontSize: 20, fontWeight: '600', color: '#111' }}>{name}</Text>
    </View>
  );
}
`;

const SETTINGS = {
	'workbench.startupEditor': 'none',
	'workbench.activityBar.location': 'hidden',
	'workbench.secondarySideBar.defaultVisibility': 'hidden',
	'workbench.tips.enabled': false,
	'window.commandCenter': false,
	'chat.disableAIFeatures': true,
	'editor.minimap.enabled': false,
	'editor.fontSize': 15,
	'editor.lineHeight': 24,
	'editor.fontFamily': 'Menlo, Monaco, monospace',
	'breadcrumbs.enabled': false,
	'typescript.validate.enable': false,
	'javascript.validate.enable': false,
	'telemetry.telemetryLevel': 'off',
	'update.mode': 'none',
	'extensions.autoUpdate': false,
	'security.workspace.trust.enabled': false,
	'workbench.colorTheme': 'Default Dark Modern',
};

async function launch(extraArgs) {
	const work = mkdtempSync(join(tmpdir(), 'stylelift-media-'));
	mkdirSync(join(work, 'user/User'), { recursive: true });
	mkdirSync(join(work, 'demo'));
	writeFileSync(join(work, 'user/User/settings.json'), JSON.stringify(SETTINGS, null, 2));
	writeFileSync(join(work, 'demo/ProfileCard.tsx'), DEMO);
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const proc = spawn(
		CODE,
		[join(work, 'demo'), ...extraArgs(work), `--extensionDevelopmentPath=${root}`, `--user-data-dir=${join(work, 'user')}`, `--extensions-dir=${join(work, 'ext')}`, `--remote-debugging-port=${PORT}`, '--skip-welcome', '--skip-release-notes', '--disable-telemetry', '--new-window'],
		{ env, stdio: 'ignore' },
	);
	let target;
	for (let i = 0; i < 120 && !target; i++) {
		await sleep(500);
		try {
			const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
			target = pages.find((p) => p.type === 'page' && /workbench/.test(p.url));
		} catch {
			// not up yet
		}
	}
	if (!target) {
		proc.kill();
		throw new Error('VS Code did not expose a workbench page');
	}
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});
	let id = 0;
	const pending = new Map();
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
		}
	};
	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			pending.set(++id, { resolve, reject });
			ws.send(JSON.stringify({ id, method, params }));
		});
	await send('Emulation.setFocusEmulationEnabled', { enabled: true });
	return { send, work, close: () => (ws.close(), proc.kill()) };
}

async function icon() {
	const { send, close } = await launch(() => []);
	try {
		const { result } = await send('Runtime.evaluate', {
			awaitPromise: true,
			returnByValue: true,
			expression: `(async () => {
				const img = new Image();
				img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(${JSON.stringify(ICON_SVG)});
				await img.decode();
				const c = document.createElement('canvas');
				c.width = c.height = 256;
				c.getContext('2d').drawImage(img, 0, 0, 256, 256);
				return c.toDataURL('image/png');
			})()`,
		});
		writeFileSync(join(root, 'images/icon.png'), Buffer.from(result.value.split(',')[1], 'base64'));
		console.log('wrote images/icon.png');
	} finally {
		close();
	}
}

const KEYS = {
	Enter: { code: 'Enter', vk: 13, text: '\r' },
	ArrowDown: { code: 'ArrowDown', vk: 40 },
	'.': { code: 'Period', vk: 190 },
	b: { code: 'KeyB', vk: 66 },
	g: { code: 'KeyG', vk: 71 },
	a: { code: 'KeyA', vk: 65 },
	Escape: { code: 'Escape', vk: 27 },
};

async function shots() {
	const W = 1100;
	const H = 800;
	const TITLE = 33; // CSS px of title bar to crop (it would read "[Extension Development Host]")
	const { send, work, close } = await launch((dir) => ['--goto', `${join(dir, 'demo/ProfileCard.tsx')}:6:24`]);
	const frames = [];
	try {
		await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
		const clip = (scale) => ({ x: 0, y: TITLE, width: W, height: H - TITLE, scale });
		const key = async (name, { meta = false, ctrl = false } = {}) => {
			const { code, vk, text } = KEYS[name];
			const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: (ctrl ? 2 : 0) | (meta ? 4 : 0) };
			await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', text, ...base });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
			await sleep(150);
		};
		const type = (text) => send('Input.insertText', { text });
		// `name` also names the PNG; every shot becomes a GIF frame shown for `ms`.
		const shot = async (name, ms, png = true) => {
			if (png) {
				const big = await send('Page.captureScreenshot', { format: 'png', clip: clip(2) });
				writeFileSync(join(root, `images/${name}.png`), Buffer.from(big.data, 'base64'));
			}
			const small = await send('Page.captureScreenshot', { format: 'png', clip: clip(1) });
			frames.push({ png: Buffer.from(small.data, 'base64'), ms });
			console.log('shot', name);
		};

		await sleep(6000); // window, extension host, first diagnostics
		await key('b', { meta: true }); // hide the explorer
		await sleep(1500);
		await shot('hint', 1800);

		await key('.', { meta: true });
		await sleep(900);
		await shot('actions', 2200);
		await key('Enter');
		await sleep(900);
		await shot('prompt', 1600);
		await key('Enter');
		await sleep(1200);
		await shot('result', 2800);

		// A style with dynamic values: static part is extracted, the rest stays inline.
		await key('g', { ctrl: true });
		await sleep(300);
		await type('9:22');
		await key('Enter');
		await sleep(700);
		await key('.', { meta: true });
		await sleep(900);
		await shot('dynamic-actions', 1500, false);
		await key('Enter');
		await sleep(900);
		await type('avatar');
		await sleep(300);
		await shot('dynamic-prompt', 1600, false);
		await key('Enter');
		await sleep(1200);
		await shot('dynamic', 3200);
	} finally {
		close();
	}

	const gif = GIFEncoder();
	for (const { png, ms } of frames) {
		const { data, width, height } = PNG.sync.read(png);
		const palette = quantize(data, 256);
		gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: ms });
	}
	gif.finish();
	writeFileSync(join(root, 'images/demo.gif'), gif.bytes());
	console.log('wrote images/demo.gif from', frames.length, 'frames; workdir', work);
}

const mode = process.argv[2];
if (mode === 'icon') {
	await icon();
} else if (mode === 'shots') {
	await shots();
} else {
	console.log('usage: node scripts/capture-media.mjs icon|shots');
}
