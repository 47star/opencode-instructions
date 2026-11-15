const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'instructions-editor-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'opencode'))
  const file = path.join(root, 'opencode', 'AGENTS.md')
  await fs.writeFile(file, '# 기존 지침\n', { mode: 0o640 })
  const bundle =
    process.env.INSTRUCTIONS_BUNDLE_PATH || path.join(__dirname, '../dist/gui-experimental.cjs')
  const source = await fs.readFile(bundle, 'utf8')
  const context = {
    module: { exports: {} },
    process: { env: { XDG_CONFIG_HOME: root } },
    require(name) {
      if (name === '@opencode/plugin/gui') {
        return { Plugin: { define: (value) => value }, Ipc: { define: (value) => value } }
      }
      if (name === 'effect') return { Schema: { Struct: (value) => value, String: 'string' } }
      if (name === 'solid-js') return {}
      if (name === 'solid-js/web') return { template: () => () => {}, delegateEvents: () => {} }
      return require(name)
    },
  }
  context.exports = context.module.exports
  vm.runInNewContext(source, context)
  let api
  context.module.exports.default.main({
    provide: (_token, implementation) => {
      api = implementation
    },
  })
  return { api, file, root }
}

test('한글 및 빈 내용 저장, 권한 유지, 임시 파일 정리', async (t) => {
  const { api, file, root } = await fixture(t)
  const before = await api.read()
  assert.equal(before.path, file)
  const text = '# 지침\n한글과 English, 이모지 ✅\n'
  const saved = await api.save({ text, revision: before.revision })
  assert.equal(await fs.readFile(file, 'utf8'), text)
  assert.equal((await fs.stat(file)).mode & 0o777, 0o640)
  assert.notEqual(saved.revision, before.revision)
  await api.save({ text: '', revision: saved.revision })
  assert.equal(await fs.readFile(file, 'utf8'), '')
  assert.deepEqual(await fs.readdir(path.join(root, 'opencode')), ['AGENTS.md'])
})

test('외부 수정은 보존하고 오래된 편집 저장을 거절', async (t) => {
  const { api, file } = await fixture(t)
  const before = await api.read()
  await fs.writeFile(file, '외부 수정\n')
  await assert.rejects(
    api.save({ text: '오래된 편집', revision: before.revision }),
    /changed externally/,
  )
  assert.equal(await fs.readFile(file, 'utf8'), '외부 수정\n')
  const latest = await api.read()
  await api.save({ text: '새 편집', revision: latest.revision })
  assert.equal(await fs.readFile(file, 'utf8'), '새 편집')
})

test('두 창의 동시 저장에서 두 번째 오래된 저장을 거절', async (t) => {
  const { api, file } = await fixture(t)
  const before = await api.read()
  const results = await Promise.allSettled([
    api.save({ text: '첫 번째', revision: before.revision }),
    api.save({ text: '두 번째', revision: before.revision }),
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.equal(await fs.readFile(file, 'utf8'), '첫 번째')
})

test('처음 사용하는 설정 디렉터리와 파일 생성', async (t) => {
  const { api, file, root } = await fixture(t)
  await fs.rm(path.join(root, 'opencode'), { recursive: true })
  const before = await api.read()
  assert.equal(before.text, '')
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  await api.save({ text: 'New instructions', revision: before.revision })
  assert.equal(await fs.readFile(file, 'utf8'), 'New instructions')
})

test('심볼릭 링크와 대상 파일 권한 유지', async (t) => {
  const { api, file, root } = await fixture(t)
  const target = path.join(root, 'shared.md')
  await fs.rename(file, target)
  await fs.symlink('../shared.md', file)
  const before = await api.read()
  await api.save({ text: 'Shared instructions', revision: before.revision })
  assert.equal((await fs.lstat(file)).isSymbolicLink(), true)
  assert.equal(await fs.readlink(file), '../shared.md')
  assert.equal(await fs.readFile(target, 'utf8'), 'Shared instructions')
  assert.equal((await fs.stat(target)).mode & 0o777, 0o640)
})

test('연결 대상이 없는 링크를 보존하고 읽기 오류 반환', async (t) => {
  const { api, file } = await fixture(t)
  await fs.unlink(file)
  await fs.symlink('missing.md', file)
  await assert.rejects(api.read(), { code: 'ENOENT' })
  assert.equal((await fs.lstat(file)).isSymbolicLink(), true)
})

test('saving does not recreate a file deleted after reading', async (t) => {
  const { api, file } = await fixture(t)
  const before = await api.read()
  await fs.unlink(file)
  await assert.rejects(api.save({ text: 'Draft', revision: before.revision }), { code: 'ENOENT' })
  await assert.rejects(fs.stat(file), { code: 'ENOENT' })
})

test('existing permission bits survive a restrictive umask', async (t) => {
  const { api, file } = await fixture(t)
  const before = await api.read()
  const originalMask = process.umask(0o077)
  try {
    await api.save({ text: 'Updated', revision: before.revision })
    assert.equal((await fs.stat(file)).mode & 0o777, 0o640)
  } finally {
    process.umask(originalMask)
  }
})
