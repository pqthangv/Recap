// Google Play screenshots in an Android emulator: runs the App Store screenshot flow
// (.maestro/screenshots.yaml, or screenshots-<language>.yaml from scripts/screenshot-flows.js)
// with adb, up to the Create with AI screen, so nothing is sent to Gemini (the check-* screens are
// skipped). Maestro can't type other alphabets on Android (mobile-dev-inc/maestro#146), so text
// goes in through ADBKeyBoard, an input method that types what adb sends it.
// .github/workflows/android-screens.yml runs it on GitHub; it works with a PC's emulator too:
//
//   node scripts/android-screens.js --language es --size phone --db <demo.db> --out <folder>
//     [--apk <screenshot app>] [--keyboard <ADBKeyBoard apk>] [--serial emulator-5554]
//
// --db     the demo decks: MAKE_DEMO_DB=<demo.db> DEMO_LANGUAGE=es npx jest scripts/demo-db
// --apk    the screenshot build (EXPO_PUBLIC_DEMO_BOARD=1, debuggable so the database can be
//          copied in); left out = the one already installed
// --keyboard  installs ADBKeyBoard first; left out = it must be installed already
// --size   phone 1080 x 1920, tablet7 1215 x 2160 or tablet10 1620 x 2880 (the sizes the store
//          graphics script expects)
/* global __dirname */ // a Node script; the app's lint setup doesn't know Node's names
const { Buffer } = require('buffer');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_ID = 'com.recapcards.app';
const KEYBOARD = 'com.android.adbkeyboard/.AdbIME';
const SIZES = {
  phone: { size: '1080x1920', density: 420 },
  tablet7: { size: '1215x2160', density: 320 },
  tablet10: { size: '1620x2880', density: 320 },
};
// The flow's last screenshot here: its next step would send the topic to Gemini.
const LAST_SHOT = 'ai';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
if (!args.language || !SIZES[args.size] || !args.db || !args.out) {
  console.error(
    'Usage: node scripts/android-screens.js --language <en|vi|...> --size <phone|tablet7|tablet10>' +
      ' --db <demo.db> --out <folder> [--apk <app>] [--keyboard <ADBKeyBoard apk>] [--serial <id>]',
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serial = args.serial ? ['-s', args.serial] : [];
const adb = (...a) =>
  execFileSync('adb', [...serial, ...a], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
const shell = (...a) => adb('shell', ...a).toString('utf8');

// ---- The emulator ----------------------------------------------------------------------------

function install(apk) {
  try {
    adb('install', '-r', apk);
  } catch (e) {
    // Android 14 and later refuse apps made for very old Android versions.
    if (!String(e.stderr || e.message).includes('DEPRECATED_SDK')) throw e;
    adb('install', '-r', '--bypass-low-target-sdk-block', apk);
  }
}

async function setUpScreen() {
  const { size, density } = SIZES[args.size];
  shell('am', 'force-stop', APP_ID);
  shell('wm', 'size', size);
  shell('wm', 'density', String(density));
  shell('cmd', 'window', 'user-rotation', 'lock', '0');
  // Light look, normal text size, no spelling underlines: as on a new phone.
  shell('cmd', 'uimode', 'night', 'no');
  shell('settings', 'put', 'system', 'font_scale', '1.0');
  shell('settings', 'put', 'secure', 'spell_checker_enabled', '0');
  // Gesture navigation (the small bar at the bottom), as in the earlier screenshots.
  shell(
    'cmd',
    'overlay',
    'enable-exclusive',
    '--category',
    'com.android.internal.systemui.navbar.gestural',
  );
  // Switching the navigation redraws the status bar a moment later: let that happen first.
  for (
    let i = 0;
    i < 20 && shell('settings', 'get', 'secure', 'navigation_mode').trim() !== '2';
    i++
  ) {
    await sleep(500);
  }
  shell('settings', 'put', 'global', 'sysui_demo_allowed', '1');
  await sleep(5000);
}

/**
 * The tidy status bar of store screenshots ("demo mode"): 9:41, full battery, Wi-Fi, no
 * notifications. Set again before every screenshot: on GitHub's newly started emulator the status
 * bar was sometimes redrawn after it was set and showed the real time (2026-11-09), and a redraw
 * in demo mode can leave a second Wi-Fi icon; leaving demo mode and entering it again clears both.
 */
async function tidyStatusBar() {
  const demo = (...a) => shell('am', 'broadcast', '-a', 'com.android.systemui.demo', ...a);
  for (let attempt = 1; attempt <= 3; attempt++) {
    demo('-e', 'command', 'exit');
    await sleep(800);
    demo('-e', 'command', 'enter');
    demo('-e', 'command', 'clock', '-e', 'hhmm', '0941');
    demo('-e', 'command', 'network', '-e', 'mobile', 'hide');
    demo(
      '-e',
      'command',
      'network',
      '-e',
      'wifi',
      'show',
      '-e',
      'level',
      '4',
      '-e',
      'fully',
      'true',
    );
    demo('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false');
    demo('-e', 'command', 'notifications', '-e', 'visible', 'false');
    await sleep(1200);
    const state = shell('dumpsys', 'activity', 'service', 'com.android.systemui');
    if (/isInDemoMode=true/.test(state)) return;
    console.log(`   the status bar isn't in demo mode yet (try ${attempt})`);
    await sleep(2000);
  }
  throw new Error("Couldn't set the 9:41 status bar (demo mode)");
}

async function chooseKeyboard() {
  if (args.keyboard) install(args.keyboard);
  // Android lists a newly installed keyboard a few seconds later.
  for (let i = 0; i < 20 && !shell('ime', 'list', '-a', '-s').includes(KEYBOARD); i++) {
    await sleep(1000);
  }
  shell('ime', 'enable', KEYBOARD);
  shell('ime', 'set', KEYBOARD);
  const now = shell('settings', 'get', 'secure', 'default_input_method').trim();
  if (now !== KEYBOARD) {
    throw new Error(`The keyboard is "${now}", not ADBKeyBoard (install it with --keyboard)`);
  }
}

/** A fresh copy of the demo database, where expo-sqlite keeps it (needs a debuggable build). */
function copyDatabase() {
  shell('am', 'force-stop', APP_ID);
  adb('push', args.db, '/data/local/tmp/recap.db');
  const as = `run-as ${APP_ID}`;
  shell(
    `${as} mkdir -p files/SQLite && ` +
      `${as} rm -f files/SQLite/recap.db-wal files/SQLite/recap.db-shm && ` +
      `${as} cp /data/local/tmp/recap.db files/SQLite/recap.db`,
  );
}

// ---- What's on the screen --------------------------------------------------------------------

function dump() {
  try {
    shell('uiautomator', 'dump', '/sdcard/ui.xml');
    const xml = shell('cat', '/sdcard/ui.xml');
    if (!xml.includes('<hierarchy')) return null;
    const unescape = (s) =>
      s
        .replace(/&#10;/g, '\n')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    // Only what's really on the screen. A list row scrolled out of sight is still listed, with its
    // bottom above its top (e.g. [32,1875][1049,1668]); its "middle" was the Cancel row below the
    // list, so the tap closed the language list (2026-11-09). A sliver doesn't count either.
    return [...xml.matchAll(/<node [^>]*>/g)]
      .map((m) => {
        const attr = (name) =>
          unescape((m[0].match(new RegExp(` ${name}="([^"]*)"`)) || [])[1] || '');
        const [x1, y1, x2, y2] = (attr('bounds').match(/\d+/g) || [0, 0, 0, 0]).map(Number);
        const shown = x2 - x1 >= 24 && y2 - y1 >= 24;
        const node = { text: attr('text'), desc: attr('content-desc') };
        return { ...node, shown, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      })
      .filter((n) => n.shown);
  } catch {
    return null;
  }
}

function tap(node) {
  shell('input', 'tap', String(Math.round(node.x)), String(Math.round(node.y)));
}

async function nodes() {
  for (let i = 0; i < 5; i++) {
    const list = dump();
    if (!list) {
      await sleep(500);
      continue;
    }
    // A slow emulator sometimes says an app "isn't responding": keep waiting for it.
    const wait = list.find((n) => n.text === 'Wait');
    if (wait && list.some((n) => /isn.t responding/.test(n.text))) {
      tap(wait);
      await sleep(1500);
      continue;
    }
    return list;
  }
  return [];
}

/** Like Maestro: the label is a regex matched against the whole text or accessibility label. */
async function find(pattern) {
  const re = new RegExp(`^(?:${pattern})$`, 's');
  return (await nodes()).find((n) => (n.text && re.test(n.text)) || (n.desc && re.test(n.desc)));
}

async function waitFor(pattern, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const node = await find(pattern);
    if (node) return node;
    await sleep(700);
  }
  throw new Error(`Not on the screen after ${timeout / 1000} s: ${pattern}`);
}

function screenSize() {
  const out = shell('wm', 'size');
  const m = /Override size: (\d+)x(\d+)/.exec(out) || /Physical size: (\d+)x(\d+)/.exec(out);
  return { w: Number(m[1]), h: Number(m[2]) };
}

function swipe(fromY, toY, ms) {
  const x = String(Math.round(screenSize().w / 2));
  shell('input', 'swipe', x, String(Math.round(fromY)), x, String(Math.round(toY)), String(ms));
}

function swipeUp() {
  const { h } = screenSize();
  swipe(h * 0.75, h * 0.3, 400);
}

/**
 * The element once its list has stopped moving: a list keeps gliding a moment after a swipe, and
 * a tap on a moving list only stops it (2026-11-09: the AI screen's back language stayed "Auto").
 */
async function settled(pattern) {
  let last = await find(pattern);
  for (let i = 0; i < 10; i++) {
    await sleep(600);
    const now = await find(pattern);
    if (last && now && Math.abs(now.y - last.y) < 3) return now;
    last = now;
  }
  throw new Error(`Still moving after 6 s: ${pattern}`);
}

/** Types into the focused text box through ADBKeyBoard, then checks the text is there. */
async function type(text) {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  for (let attempt = 1; attempt <= 2; attempt++) {
    // The keyboard may not be attached to the box yet: start clean, then type.
    shell('am', 'broadcast', '-a', 'ADB_CLEAR_TEXT');
    shell('am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', b64);
    for (let i = 0; i < 8; i++) {
      await sleep(700);
      if ((await nodes()).some((n) => n.text.includes(text))) return;
    }
  }
  throw new Error(`The typed text didn't show up: ${text}`);
}

// ---- The flow --------------------------------------------------------------------------------

/** The flow's steps, as { cmd, value, props } (only the YAML shapes the flows use). */
function readFlow(file) {
  const unquote = (v) => {
    v = v.trim();
    return v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v;
  };
  const steps = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.trimStart().startsWith('#') || line === '---' || line.startsWith('appId')) {
      continue;
    }
    const top = /^- (\w+)(?::\s*(.*))?$/.exec(line);
    if (top) {
      steps.push({ cmd: top[1], value: top[2] ? unquote(top[2]) : '', props: {} });
      continue;
    }
    const prop = /^\s+(\w+):\s*(.*)$/.exec(line);
    if (prop && steps.length) steps[steps.length - 1].props[prop[1]] = unquote(prop[2]);
  }
  return steps;
}

async function runFlow(steps) {
  for (const [i, { cmd, value, props }] of steps.entries()) {
    console.log(`${i + 1}. ${cmd} ${value || props.visible || props.text || ''}`.trim());
    if (cmd === 'launchApp') {
      shell('am', 'force-stop', APP_ID);
      shell('am', 'start', '-n', `${APP_ID}/.MainActivity`);
      await sleep(2500);
    } else if (cmd === 'extendedWaitUntil') {
      await waitFor(props.visible, Number(props.timeout || 30000));
    } else if (cmd === 'tapOn') {
      const label = value || props.text;
      let node = await find(label);
      if (!node && props.optional === 'true') continue;
      if (!node) node = await waitFor(label);
      tap(node);
      await sleep(900);
    } else if (cmd === 'scrollUntilVisible') {
      let node = await find(props.text);
      for (let n = 0; !node && n < 12; n++) {
        swipeUp();
        await sleep(700);
        node = await find(props.text);
      }
      if (!node) throw new Error(`Not found by scrolling: ${props.text}`);
      node = await settled(props.text);
      const { h } = screenSize();
      if (props.centerElement === 'true' && node.y > h * 0.55) {
        swipe(node.y, h * 0.5, 600);
        await settled(props.text);
      }
    } else if (cmd === 'scroll') {
      swipeUp();
      await sleep(700);
    } else if (cmd === 'inputText') {
      await type(value);
      await sleep(500);
    } else if (cmd === 'pressKey') {
      if (value !== 'Enter') throw new Error(`Key not supported: ${value}`);
      shell('input', 'keyevent', '66');
      await sleep(700);
    } else if (cmd === 'waitForAnimationToEnd') {
      await sleep(1800);
    } else if (cmd === 'takeScreenshot') {
      if (!value.startsWith('check-')) {
        await tidyStatusBar();
        fs.writeFileSync(path.join(args.out, `${value}.png`), adb('exec-out', 'screencap', '-p'));
        console.log(`   saved ${value}.png`);
      }
      if (value === LAST_SHOT) return;
    } else {
      throw new Error(`Step not supported: ${cmd}`);
    }
  }
  throw new Error(`The flow has no "${LAST_SHOT}" screenshot`);
}

async function main() {
  const flow = path.join(
    __dirname,
    '..',
    '.maestro',
    args.language === 'en' ? 'screenshots.yaml' : `screenshots-${args.language}.yaml`,
  );
  const steps = readFlow(flow);
  fs.mkdirSync(path.join(args.out, 'debug'), { recursive: true });
  if (args.apk) install(args.apk);
  await chooseKeyboard();
  await setUpScreen();
  // The emulator sometimes misses a step: a stopped run is tried once more from the start.
  for (let attempt = 1; ; attempt++) {
    copyDatabase();
    try {
      await runFlow(steps);
      console.log(`Done: ${args.language} ${args.size}`);
      return;
    } catch (e) {
      console.error(`Stopped (attempt ${attempt}): ${e.message}`);
      const shot = path.join(args.out, 'debug', `stopped-${attempt}.png`);
      fs.writeFileSync(shot, adb('exec-out', 'screencap', '-p'));
      const texts = (await nodes()).map((n) => n.text || n.desc).filter(Boolean);
      console.error(`On the screen: ${JSON.stringify(texts)}`);
      if (attempt === 2) throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
