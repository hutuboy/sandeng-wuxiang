/* 真实浏览器录屏 → 演示视频（非合成动画）
 * CDP Page.startScreencast 捕获真实渲染帧；动作按「帧号」顺序触发，
 * 因此编码后的时间轴与镜头精确对齐。
 * 用法：node tools/make-demo.cjs
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require(path.join(__dirname, '..', '.tooling', 'node_modules', 'playwright-core'));
const ROOT = path.join(__dirname, '..');
const FRAMES = path.join(ROOT, '.demo-frames');
const OUT = path.join(ROOT, 'docs', '演示视频.mp4');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
/* ?guide=0 抑制首次新用户引导，避免演示视频时间轴被引导层打断 */
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?guide=0';
const FPS = 25, TOTAL = 400; // 400 帧 / 25fps = 16 秒

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--hide-scrollbars']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(500);

  const cdp = await ctx.newCDPSession(page);
  let n = 0, acking = 0, stopped = false;
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    if (!stopped) {
      fs.writeFileSync(path.join(FRAMES, 'f' + String(n++).padStart(5, '0') + '.jpg'), Buffer.from(data, 'base64'));
    }
    acking++;
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch (e) {}
    acking--;
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1, maxWidth: 1280, maxHeight: 800 });

  const deadline = Date.now() + 90000;
  async function waitFrame(target) {
    while (n < target && Date.now() < deadline) await sleep(15);
  }
  let topic = 'hour';
  const steps = [
    [62,  async () => { await page.click('#btn-start'); }],
    [72,  async () => { topic = await page.evaluate(() => window.SANDENG_APP.game.cs.clues[0].topic); }],
    [96,  async () => { await page.click('[data-guest="g0"]'); }],
    [102, async () => { await page.click(`[data-topic="${topic}"]`); }],
    [134, async () => { await page.click('[data-guest="g1"]'); }],
    [140, async () => { await page.click(`[data-topic="${topic}"]`); }],
    [172, async () => { await page.click('[data-guest="g2"]'); }],
    [178, async () => { await page.click(`[data-topic="${topic}"]`); }],
    [208, async () => { await page.click('[data-action="redecide"]').catch(() => {}); }],
    [248, async () => { await page.click('[data-action="close-modal"]').catch(() => {}); }],
    [262, async () => { await page.click('#btn-act-deduce'); }],
    [296, async () => { await page.click('[data-action="close-modal"]').catch(() => {}); }],
    [308, async () => { await page.click('#btn-accuse'); }],
    [320, async () => {
      const imp = await page.evaluate(() => window.SANDENG_APP.game.cs.impostorId);
      await page.click(`[data-action="accuse"][data-guest="${imp}"]`);
    }]
  ];
  for (const [frame, fn] of steps) {
    await waitFrame(frame);
    try { await fn(); } catch (e) { console.log('步骤 ' + frame + ' 跳过:', e.message.split('\n')[0]); }
  }
  await waitFrame(TOTAL);
  stopped = true;
  await cdp.send('Page.stopScreencast').catch(() => {});
  while (acking > 0) await sleep(30);
  await browser.close();

  const files = fs.readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).sort();
  console.log('捕获帧数:', files.length, '→', (files.length / FPS).toFixed(1), '秒');
  if (files.length < 200) throw new Error('画面帧过少，录屏失败');

  const ffmpeg = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-vf', 'scale=1280:-2', OUT
  ], { stdio: 'inherit' });
  const size = fs.statSync(OUT).size;
  console.log('已生成:', OUT, (size / 1024 / 1024).toFixed(2), 'MB');
  fs.writeFileSync(path.join(ROOT, 'tools', 'demo-video-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), frames: files.length, fps: FPS,
    durationSec: +(files.length / FPS).toFixed(2), output: 'docs/演示视频.mp4', bytes: size,
    method: 'CDP Page.startScreencast 真实渲染帧（按帧号驱动动作）+ ffmpeg/libx264'
  }, null, 2), 'utf8');
})().catch(e => { console.error(e); process.exit(1); });
