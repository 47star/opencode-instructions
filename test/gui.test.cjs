const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

async function fixture(t, options = {}) {
  const { Window } = await import('happy-dom')
  const window = new Window()
  global.window = window
  global.document = window.document
  const solid = require('solid-js')
  const web = require('solid-js/web')
  const module = { exports: {} }
  const SettingsPage = {}
  const bundle =
    process.env.INSTRUCTIONS_BUNDLE_PATH || path.join(__dirname, '../dist/gui-experimental.cjs')
  vm.runInNewContext(fs.readFileSync(bundle, 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (name === '@opencode/plugin/gui')
        return {
          Plugin: { define: (value) => value },
          Ipc: { define: (value) => value },
          SettingsPage,
          Style: {},
        }
      if (name === 'effect') return { Schema: { Struct: (value) => value, String: 'string' } }
      return require(name)
    },
  })
  const plugin = module.exports.default
  let page
  let text = 'Original'
  let failure = options.failure
  let confirm = true
  let saveFailure = options.saveFailure
  const calls = []
  const container = document.createElement('main')
  document.body.append(container)
  function section(props) {
    const node = document.createElement('section')
    web.insert(node, () => props.actions)
    web.insert(node, () => props.children)
    web.insert(node, () => props.footer)
    return node
  }
  solid.createRoot((dispose) => {
    t.after(dispose)
    plugin.setup({
      ui: {
        SettingsLayout: section,
        SettingsSection: section,
        SettingsRow: section,
        Button(props) {
          const button = document.createElement('button')
          web.insert(button, () => props.children)
          solid.createEffect(() => {
            button.disabled = props.disabled
          })
          button.addEventListener('click', props.onClick)
          return button
        },
      },
      t: (key) => plugin.i18n[options.locale || 'en'][key],
      dialogs: {
        confirm: async () => {
          if (options.confirmFailure) throw new Error('Confirmation failed')
          return confirm
        },
      },
      main: () => ({
        read: async () => {
          if (failure) throw new Error('Read failed')
          return { text, revision: 'revision', path: '/test/AGENTS.md' }
        },
        save: async (input) => {
          calls.push(input)
          if (saveFailure) throw new Error('Save failed')
          text = input.text
          return { text, revision: 'next', path: '/test/AGENTS.md' }
        },
      }),
      add(token, value) {
        if (token === SettingsPage) page = value
      },
    })
  })
  let unmount
  function mount() {
    unmount = web.render(() => page.render({}), container)
  }
  mount()
  t.after(() => {
    unmount()
    window.happyDOM.abort()
  })
  await new Promise((resolve) => setImmediate(resolve))
  return {
    container,
    calls,
    button: (label) =>
      [...container.querySelectorAll('button')].find((button) => button.textContent === label),
    input(value) {
      const textarea = container.querySelector('textarea')
      textarea.value = value
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
    },
    remount() {
      unmount()
      mount()
    },
    confirm(value) {
      confirm = value
    },
    recover() {
      failure = false
    },
    recoverSave() {
      saveFailure = false
    },
    shortcut(modifier) {
      const event = new window.KeyboardEvent('keydown', {
        key: 's',
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      })
      container.querySelector('textarea').dispatchEvent(event)
      return event.defaultPrevented
    },
    async settle() {
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}

test('draft survives page remount and saves the edited content', async (t) => {
  const ui = await fixture(t)
  ui.input('Edited')
  ui.remount()
  assert.equal(ui.container.querySelector('textarea').value, 'Edited')
  assert.equal(ui.button('Save').disabled, false)
  ui.button('Save').click()
  await ui.settle()
  assert.equal(ui.calls[0].text, 'Edited')
  assert.equal(ui.button('Save').disabled, true)
})

test('reload cancellation preserves draft and confirmation restores file', async (t) => {
  const ui = await fixture(t)
  ui.input('Draft')
  ui.confirm(false)
  ui.button('Reload').click()
  await ui.settle()
  assert.equal(ui.container.querySelector('textarea').value, 'Draft')
  ui.confirm(true)
  ui.button('Reload').click()
  await ui.settle()
  assert.equal(ui.container.querySelector('textarea').value, 'Original')
})

test('failed initial read disables editing and reload recovers', async (t) => {
  const ui = await fixture(t, { failure: true })
  assert.equal(ui.container.querySelector('textarea').disabled, true)
  assert.equal(ui.button('Save').disabled, true)
  assert.match(ui.container.textContent, /Read failed/)
  ui.recover()
  ui.button('Reload').click()
  await ui.settle()
  assert.equal(ui.container.querySelector('textarea').disabled, false)
  assert.equal(ui.container.querySelector('textarea').value, 'Original')
})

test('Korean locale uses translated controls and input label', async (t) => {
  const ui = await fixture(t, { locale: 'ko' })
  assert.ok(ui.button('저장'))
  assert.ok(ui.button('다시 불러오기'))
  assert.equal(
    ui.container.querySelector('textarea').getAttribute('aria-label'),
    '전역 AGENTS.md 편집',
  )
})

test('failed save retains the draft and allows retry', async (t) => {
  const ui = await fixture(t, { saveFailure: true })
  ui.input('Retained draft')
  ui.button('Save').click()
  await ui.settle()
  assert.equal(ui.container.querySelector('textarea').value, 'Retained draft')
  assert.match(ui.container.textContent, /Save failed/)
  assert.equal(ui.button('Save').disabled, false)
  ui.recoverSave()
  ui.button('Save').click()
  await ui.settle()
  assert.equal(ui.button('Save').disabled, true)
})

test('confirmation errors retain the draft and restore controls', async (t) => {
  const ui = await fixture(t, { confirmFailure: true })
  ui.input('Retained draft')
  ui.button('Reload').click()
  await ui.settle()
  assert.equal(ui.container.querySelector('textarea').value, 'Retained draft')
  assert.match(ui.container.textContent, /Confirmation failed/)
  assert.equal(ui.button('Reload').disabled, false)
})

test('Cmd+S and Ctrl+S save the current draft', async (t) => {
  const ui = await fixture(t)
  for (const modifier of ['metaKey', 'ctrlKey']) {
    ui.input(modifier)
    assert.equal(ui.shortcut(modifier), true)
    await ui.settle()
    assert.equal(ui.calls.at(-1).text, modifier)
    assert.equal(ui.button('Save').disabled, true)
  }
})
