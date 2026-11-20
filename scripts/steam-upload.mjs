// Uploads the Steam build (npm run dist:steam → release/steam/win-unpacked) to Steam
// with steamcmd (SteamPipe). The App ID and depot ID come from steam/ids.json; the
// Steam account that uploads is the argument: npm run steam:upload -- <account>.
// steamcmd asks for that account's password and Steam Guard code itself.
// The build is not made live: choose the build in Steamworks → SteamPipe → Builds.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const account = process.argv[2];
if (!account) fail('Usage: npm run steam:upload -- <Steam account that uploads builds>');
// Some Windows editors save a byte-order mark first.
const ids = JSON.parse(fs.readFileSync(path.join(root, 'steam', 'ids.json'), 'utf8').replace(/^﻿/, ''));
if (!/^\d+$/.test(String(ids.appId)) || !/^\d+$/.test(String(ids.depotId))) fail('Put the App ID and depot ID from Steamworks into steam/ids.json first.');

// Only a build made for Steam: it leaves updates to Steam instead of fetching them from GitHub.
const content = path.join(root, 'release', 'steam', 'win-unpacked');
const appAsar = path.join(content, 'resources', 'app.asar');
if (!fs.existsSync(path.join(content, 'Kadro.exe')) || !fs.existsSync(appAsar)) fail('No Steam build: run npm run dist:steam first.');
const pkg = JSON.parse(asar.extractFile(appAsar, 'package.json').toString('utf8'));
if (pkg.kadroStore !== 'steam') fail('release/steam/win-unpacked is not a Steam build: run npm run dist:steam.');

const steamcmd = process.env.STEAMCMD || 'C:\\steamcmd\\steamcmd.exe';
if (!fs.existsSync(steamcmd)) fail(`steamcmd not found at ${steamcmd}: install it (steam/README.md) or set STEAMCMD to its path.`);

const out = path.join(root, 'release', 'steam', 'output');
fs.mkdirSync(out, { recursive: true });
const q = (s) => JSON.stringify(s); // VDF strings: quotes and backslashes escaped the JSON way
const vdf = `"AppBuild"
{
	"AppID" ${q(String(ids.appId))}
	"Desc" ${q(`Kadro ${pkg.version}`)}
	"ContentRoot" ${q(content)}
	"BuildOutput" ${q(out)}
	"Depots"
	{
		${q(String(ids.depotId))}
		{
			"FileMapping"
			{
				"LocalPath" "*"
				"DepotPath" "."
				"recursive" "1"
			}
		}
	}
}
`;
const script = path.join(out, `app_build_${ids.appId}.vdf`);
fs.writeFileSync(script, vdf);
console.log(`Uploading Kadro ${pkg.version} to app ${ids.appId}, depot ${ids.depotId} as ${account}…`);
const r = spawnSync(steamcmd, ['+login', account, '+run_app_build', script, '+quit'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
