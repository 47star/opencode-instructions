import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const archive = resolve(process.argv[2] || `${manifest.name}-${manifest.version}.tgz`)
const directory = await mkdtemp(join(tmpdir(), 'instructions-package-'))

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options })
  if (result.error) {
    throw result.error
  }
  assert.equal(result.status, 0, result.stderr || `${command} failed`)
  return result.stdout
}

try {
  const entries = run('tar', ['-tzf', archive]).trim().split('\n').sort()
  assert.deepEqual(entries, [
    'package/LICENSE',
    'package/README.md',
    'package/dist/gui-experimental.cjs',
    'package/package.json',
  ])

  run('tar', ['-xzf', archive, '-C', directory])
  const packaged = JSON.parse(await readFile(join(directory, 'package/package.json'), 'utf8'))
  assert.equal(packaged.name, manifest.name)
  assert.equal(packaged.version, manifest.version)
  assert.equal(packaged.exports['./gui-experimental'], './dist/gui-experimental.cjs')
  const bundle = join(directory, 'package/dist/gui-experimental.cjs')
  assert.equal(
    await readFile(bundle, 'utf8'),
    await readFile(join(root, 'dist/gui-experimental.cjs'), 'utf8'),
  )

  const tests = (await readdir(join(root, 'test')))
    .filter((name) => name.endsWith('.test.cjs'))
    .map((name) => join(root, 'test', name))
  run(process.execPath, ['--conditions=browser', '--test', ...tests], {
    env: { ...process.env, INSTRUCTIONS_BUNDLE_PATH: bundle },
    stdio: 'inherit',
  })
  console.log('Distribution contents and packaged bundle tests passed.')
} finally {
  await rm(directory, { recursive: true, force: true })
}
