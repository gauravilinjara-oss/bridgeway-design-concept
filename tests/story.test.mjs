import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const chrome = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pagePath = fileURLToPath(new URL('../index.html', import.meta.url));
const prototypePath = fileURLToPath(new URL('../try-yourself/index.html', import.meta.url));
const pageUrl = process.env.BRIDGEWAY_URL || 'http://127.0.0.1:8742/';
const pageSource = readFileSync(pagePath, 'utf8');
const prototypeSource = readFileSync(prototypePath, 'utf8');

let html = '';
let prototypeHtml = '';
let prototypeLayoutHtml = '';
let profileDir = '';
let prototypeProfileDir = '';
let prototypeLayoutDir = '';
let prototypeLayoutProfileDir = '';

before(() => {
  profileDir = mkdtempSync(join(tmpdir(), 'bridgeway-story-test-'));
  try {
    html = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profileDir}`,
      '--virtual-time-budget=1800',
      '--dump-dom',
      pageUrl,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 6000,
      env: { ...process.env, BRIDGEWAY_PAGE_PATH: pagePath },
    });
  } catch (error) {
    // The page intentionally keeps ambient videos alive. Chrome can retain
    // the process after dumping a complete DOM, so use that real browser
    // output when the timeout is the only failure.
    if (error.code === 'ETIMEDOUT' && error.stdout) html = String(error.stdout);
    else throw error;
  }

  prototypeProfileDir = mkdtempSync(join(tmpdir(), 'bridgeway-prototype-test-'));
  try {
    prototypeHtml = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${prototypeProfileDir}`,
      '--virtual-time-budget=1800',
      '--dump-dom',
      new URL('try-yourself/', pageUrl).href,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 6000,
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' && error.stdout) prototypeHtml = String(error.stdout);
    else throw error;
  }

  prototypeLayoutDir = mkdtempSync(join(tmpdir(), 'bridgeway-prototype-layout-'));
  prototypeLayoutProfileDir = mkdtempSync(join(tmpdir(), 'bridgeway-prototype-layout-profile-'));
  const layoutPath = join(prototypeLayoutDir, 'prototype.html');
  const instrumentedPrototype = prototypeSource.replace('</body>', `<script>
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const form = document.getElementById('businessNameForm').getBoundingClientRect();
      const videoFrame = document.querySelector('.entry-film-frame').getBoundingClientRect();
      document.body.dataset.entryLayout = [window.innerWidth, form.width, form.bottom, videoFrame.width, videoFrame.top]
        .map(value => Math.round(value)).join(',');
    }));
  </script></body>`);
  writeFileSync(layoutPath, instrumentedPrototype);

  try {
    prototypeLayoutHtml = execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--force-device-scale-factor=1',
      '--window-size=1509,766',
      `--user-data-dir=${prototypeLayoutProfileDir}`,
      '--virtual-time-budget=1800',
      '--dump-dom',
      pathToFileURL(layoutPath).href,
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 6000,
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' && error.stdout) prototypeLayoutHtml = String(error.stdout);
    else throw error;
  }
});

after(() => {
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  if (prototypeProfileDir) rmSync(prototypeProfileDir, { recursive: true, force: true });
  if (prototypeLayoutDir) rmSync(prototypeLayoutDir, { recursive: true, force: true });
  if (prototypeLayoutProfileDir) rmSync(prototypeLayoutProfileDir, { recursive: true, force: true });
});

test('keeps product mechanics after Alex reaches the morning decision', () => {
  const morning = html.indexOf('id="mv2"');
  const channels = html.indexOf('id="channels"');
  const evidence = html.indexOf('id="knows"');

  assert.ok(morning >= 0, 'morning movement should render');
  assert.ok(channels > morning, 'channels should follow the human story');
  assert.ok(evidence > channels, 'business evidence should follow channels');
});

test('presents one six-beat story on cinematic and static layouts', () => {
  const beats = [...html.matchAll(/data-story-beat="([1-6])"/g)]
    .map((match) => Number(match[1]));
  const distinct = [...new Set(beats)].sort((a, b) => a - b);

  assert.deepEqual(distinct, [1, 2, 3, 4, 5, 6]);
  assert.match(html, /id="counterNum">01 \/ 06</);
});

test('ends with a single action that starts with the owner’s business', () => {
  const closeStart = html.indexOf('id="close"');
  const closeEnd = html.indexOf('</section>', closeStart);
  const close = html.slice(closeStart, closeEnd);

  assert.match(close, />Start with my business</);
  assert.equal((html.match(/Tonight's pile will be waiting, done\./g) || []).length, 0);
});

test('opens the interactive prototype from the persistent Try yourself action', () => {
  const tryYourself = html.match(/<a[^>]+id="tryme"[^>]*>/)?.[0] || '';

  assert.match(tryYourself, /href="\/try-yourself\/"/);
});

test('lets the first scroll gesture dismiss the cinematic opening', () => {
  const helperSource = pageSource.match(/function openingGestureFor\([^]*?\n  }/)?.[0];
  assert.ok(helperSource, 'opening gesture helper should exist');
  const openingGestureFor = Function(`${helperSource}; return openingGestureFor;`)();

  assert.deepEqual(openingGestureFor(false), { prevent: true, open: true });
  assert.deepEqual(openingGestureFor(true), { prevent: false, open: false });
});

test('coalesces repeated scroll events into one measurement frame', () => {
  const helperSource = pageSource.match(/function scrollFramePlanFor\([^]*?\n}/)?.[0];
  assert.ok(helperSource, 'scroll frame planning helper should exist');
  const scrollFramePlanFor = Function(`${helperSource}; return scrollFramePlanFor;`)();

  assert.deepEqual(scrollFramePlanFor(false), { measure: true, requestFrame: true });
  assert.deepEqual(scrollFramePlanFor(true), { measure: true, requestFrame: false });
});

test('requires a business name before the onboarding journey begins', () => {
  const helperSource = prototypeSource.match(/function normalizedBusinessName\([^]*?\n      }/)?.[0];
  assert.ok(helperSource, 'business name validation helper should exist');
  const normalizedBusinessName = Function(`${helperSource}; return normalizedBusinessName;`)();

  assert.equal(normalizedBusinessName('   '), '');
  assert.equal(normalizedBusinessName('  Unbound Fitness  '), 'Unbound Fitness');
});

test('places the advertisement immediately after the business-name prompt', () => {
  const formEnd = prototypeHtml.indexOf('</form>');
  const advertisement = prototypeHtml.indexOf('id="advertisementVideo"');
  const between = prototypeHtml.slice(formEnd, advertisement);

  assert.ok(formEnd >= 0, 'business-name form should render');
  assert.ok(advertisement > formEnd, 'advertisement should follow the form');
  assert.doesNotMatch(between, /<h2\b/);
  assert.doesNotMatch(prototypeHtml, /Your story keeps moving\.|A glimpse of how Bridgeway/);
});

test('keeps the business form compact while the advertisement spans the page', () => {
  const layout = prototypeLayoutHtml.match(/data-entry-layout="([\d,]+)"/)?.[1]
    .split(',').map(Number);
  assert.ok(layout, 'rendered entry layout should be measurable');
  const [viewportWidth, formWidth, formBottom, videoWidth, videoTop] = layout;

  assert.ok(formWidth <= 650, 'business form should remain compact');
  assert.ok(videoWidth >= viewportWidth * 0.85, `advertisement should use most of the viewport; layout ${layout.join('/')}`);
  assert.ok(videoWidth >= formWidth * 1.8, 'advertisement should be substantially wider than the form');
  assert.ok(videoTop > formBottom && videoTop - formBottom <= 100, 'advertisement should sit directly below the form area');
});

test('opens with four small-business owners and the supplied baker film', () => {
  assert.match(html, /class="owner-opening"/);
  assert.match(html, /Keep doing what only you can do\./);
  assert.equal((html.match(/class="owner-tile(?:\s|\")/g) || []).length, 4);
  assert.match(html, /id="ownerVideoBaker"[^>]+data-original-src="assets\/baker-video-1\.mp4"/);
});

test('ships accessible selection and motion-safe media states', () => {
  assert.equal((html.match(/class="owner-tile[^>]+aria-expanded="true"/g) || []).length, 1);
  assert.equal((html.match(/class="owner-tile is-placeholder/g) || []).length, 0);
  assert.equal((html.match(/data-original-src="assets\/(?:baker-video-1|gym-coach-video|cafe-owner-video|florist-video)\.mp4"/g) || []).length, 4);
  assert.match(html, /id="ownerVideoBaker"[^>]+muted=""[^>]+playsinline=""/);
  assert.match(html, /class="owner-progress" aria-hidden="true"/);
});

test('maps four viewport-length scroll beats to four owner chapters', () => {
  const helperSource = pageSource.match(/function ownerIndexForScroll\([^]*?\n}/)?.[0];
  assert.ok(helperSource, 'scroll mapping helper should exist');
  const ownerIndexForScroll = Function(`${helperSource}; return ownerIndexForScroll;`)();

  assert.equal(ownerIndexForScroll(0, 1000, 4), 0);
  assert.equal(ownerIndexForScroll(499, 1000, 4), 0);
  assert.equal(ownerIndexForScroll(501, 1000, 4), 1);
  assert.equal(ownerIndexForScroll(1499, 1000, 4), 1);
  assert.equal(ownerIndexForScroll(1501, 1000, 4), 2);
  assert.equal(ownerIndexForScroll(2501, 1000, 4), 3);
});

test('uses a four-chapter sticky owner stage before Alex’s story', () => {
  const opening = html.indexOf('id="ownerOpening"');
  const stage = html.indexOf('class="owner-opening-stage"', opening);
  const alexStory = html.indexOf('class="static-hero"', opening);

  assert.match(html, /id="ownerOpening"[^>]+data-scroll-chapters="4"/);
  assert.ok(stage > opening, 'sticky stage should live inside the owner opening');
  assert.ok(alexStory > stage, 'Alex’s story should follow the owner stage');
  assert.match(pageSource, /\.owner-opening\[data-scroll-chapters\]\{height:400svh/);
});

test('presents unnumbered owner films and avoids em dashes in visible copy', () => {
  const openingStart = html.indexOf('id="ownerOpening"');
  const openingEnd = html.indexOf('class="static-hero"', openingStart);
  const opening = html.slice(openingStart, openingEnd);
  const visibleCopy = html
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<style[^]*?<\/style>/gi, '')
    .replace(/<script[^]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  assert.doesNotMatch(opening, /<span>0[1-4]<\/span>/);
  assert.doesNotMatch(visibleCopy, /—/);
});

test('approval reward preserves the owner’s final control', () => {
  const helperSource = pageSource.match(/function approvalStateFor\([^]*?\n}/)?.[0];
  assert.ok(helperSource, 'approval state helper should exist');
  const approvalStateFor = Function(`${helperSource}; return approvalStateFor;`)();

  assert.deepEqual(approvalStateFor(false), {
    state: 'ready',
    label: 'Approve',
    status: 'Draft · not sent',
  });
  assert.deepEqual(approvalStateFor(true), {
    state: 'approved',
    label: 'Approved',
    status: 'Approved · still not sent',
  });
});

test('reward choreography starts on visibility without approving the draft', () => {
  const helperSource = pageSource.match(/function automaticRewardStateFor\([^]*?\n}/)?.[0];
  assert.ok(helperSource, 'automatic reward state helper should exist');
  const automaticRewardStateFor = Function(`${helperSource}; return automaticRewardStateFor;`)();

  assert.deepEqual(automaticRewardStateFor(false, false), {
    animate: false,
    approved: false,
    status: 'Draft · not sent',
  });
  assert.deepEqual(automaticRewardStateFor(true, false), {
    animate: true,
    approved: false,
    status: 'Ready for review · nothing sent',
  });
  assert.deepEqual(automaticRewardStateFor(true, true), {
    animate: false,
    approved: false,
    status: 'Ready for review · nothing sent',
  });
});

test('overnight handoff gathers drafts in a deliberate sequence', () => {
  const helperSource = pageSource.match(/function overnightStateFor\([^]*?\n}/)?.[0];
  assert.ok(helperSource, 'overnight state helper should exist');
  const overnightStateFor = Function(`${helperSource}; return overnightStateFor;`)();

  assert.deepEqual(overnightStateFor(0, 3), {
    ready: [false, false, false],
    complete: false,
  });
  assert.deepEqual(overnightStateFor(2, 3), {
    ready: [true, true, false],
    complete: false,
  });
  assert.deepEqual(overnightStateFor(3, 3), {
    ready: [true, true, true],
    complete: true,
  });
});

test('turns the three quiet information sections into one automatic nature sequence', () => {
  assert.match(html, /id="knows"[^>]+data-nature-beat="drift"/);
  assert.match(html, /id="scale"[^>]+data-nature-beat="gather"/);
  assert.match(html, /id="strain"[^>]+data-nature-beat="bloom"/);

  assert.match(pageSource, /src="assets\/bridgeway-cloud-shadow\.mp4"[^>]+autoplay/);
  assert.match(pageSource, /src="assets\/bridgeway-cloud-field\.mp4"[^>]+autoplay/);
  assert.match(pageSource, /src="assets\/bridgeway-yellow-bloom\.mp4"[^>]+autoplay/);
});
