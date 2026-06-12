import { _electron as electron } from 'playwright-core'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(__dirname, '..')
const REPO_PATH = APP_DIR
const SHOT_DIR = path.join(APP_DIR, 'assets')

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function waitFor(page, sel, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = await page.$(sel)
    if (el) return el
    await wait(200)
  }
  throw new Error(`Timeout waiting for ${sel}`)
}

console.log('Launching Electron...')
const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env: { ...process.env },
  timeout: 30000,
})

await wait(3000)

let page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow()
console.log('Window URL:', page.url())
console.log('Windows:', app.windows().map(w => w.url()))

await wait(2000)

// Override the git:open-dialog IPC handler in the main process to bypass native dialog
await app.evaluate(({ ipcMain }, repoPath) => {
  ipcMain.removeHandler('git:open-dialog')
  ipcMain.handle('git:open-dialog', async () => repoPath)
}, REPO_PATH)
console.log('git:open-dialog handler patched in main process')

// Click the "폴더 열기" button to open repo
const opened = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const btn = btns.find(b => b.textContent?.includes('열기') || b.textContent?.includes('Open'))
  if (btn) { btn.click(); return btn.textContent }
  return null
})
console.log('Clicked:', opened)

// Wait for repo to load (history list should appear)
console.log('Waiting for repo to load...')
await wait(5000)

// Check DOM state
const domState = await page.evaluate(() => {
  return {
    hasVbtn: !!document.querySelector('.vbtn'),
    hasCommitItem: !!document.querySelector('.citem'),
    bodyText: document.body.innerText.substring(0, 200),
    vbtnTexts: [...(document.querySelectorAll('.vbtn') || [])].map(b => b.textContent),
  }
})
console.log('DOM state:', JSON.stringify(domState, null, 2))

// Take History screenshot
await page.setViewportSize({ width: 1440, height: 900 })
const histShot = path.join(SHOT_DIR, 'screenshot-history.png')
await page.screenshot({ path: histShot })
console.log('screenshot-history.png saved')

// Click Diff tab
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.vbtn')]
  const btn = btns.find(b => b.textContent?.trim() === 'Diff')
  if (btn) btn.click()
})
await wait(2000)
const diffShot = path.join(SHOT_DIR, 'screenshot-diff.png')
await page.screenshot({ path: diffShot })
console.log('screenshot-diff.png saved')

// Click Stage tab
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.vbtn')]
  const btn = btns.find(b => b.textContent?.trim() === 'Stage')
  if (btn) btn.click()
})
await wait(2000)
const stageShot = path.join(SHOT_DIR, 'screenshot-stage.png')
await page.screenshot({ path: stageShot })
console.log('screenshot-stage.png saved')

// Click PR tab
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.vbtn')]
  const btn = btns.find(b => b.textContent?.trim() === 'PR')
  if (btn) btn.click()
})
await wait(3000)
const prShot = path.join(SHOT_DIR, 'screenshot-pr.png')
await page.screenshot({ path: prShot })
console.log('screenshot-pr.png saved')

await app.close()
console.log('Done.')
