import { createSignal } from 'solid-js'
import { SettingsPage, Style } from '@opencode/plugin/gui'
import type { Plugin } from '@opencode/plugin/gui'
import { Instructions } from './ipc'

type Status = 'loading' | 'saving' | 'saved' | ''
type EditorContext = Parameters<Plugin.Setup>[0]

export function setupEditor(ctx: EditorContext) {
  const file = ctx.main(Instructions)
  const ui = ctx.ui

  ctx.add(
    Style,
    `
    [data-component="textarea-v2"].instructions-editor { width: 100%; }
    .instructions-editor [data-slot="textarea-v2-textarea"] { max-height: 48vh; }
  `,
  )

  const [text, setText] = createSignal('')
  const [saved, setSaved] = createSignal('')
  const [revisionValue, setRevisionValue] = createSignal('')
  const [path, setPath] = createSignal('~/.config/opencode/AGENTS.md')
  const [status, setStatus] = createSignal<Status>('loading')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')

  const dirty = () => text() !== saved()

  function displayStatus() {
    if (error()) {
      return error()
    }

    if (status()) {
      return ctx.t(status())
    }

    if (dirty()) {
      return ctx.t('dirty')
    }

    return ''
  }

  async function load() {
    if (busy()) {
      return
    }

    setBusy(true)

    try {
      if (dirty()) {
        const confirmed = await ctx.dialogs.confirm({
          title: ctx.t('reload'),
          description: ctx.t('discard'),
        })

        if (!confirmed) {
          return
        }
      }

      setError('')
      setStatus('loading')
      const loaded = await file.read()
      setText(loaded.text)
      setSaved(loaded.text)
      setRevisionValue(loaded.revision)
      setPath(loaded.path)
      setStatus('')
    } catch (error) {
      setError(String(error instanceof Error ? error.message : error))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (busy() || !revisionValue() || !dirty()) {
      return
    }

    setBusy(true)
    setError('')
    setStatus('saving')

    try {
      const result = await file.save({ text: text(), revision: revisionValue() })
      setSaved(result.text)
      setRevisionValue(result.revision)
      setStatus('saved')
    } catch (error) {
      setError(String(error instanceof Error ? error.message : error))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  function Editor() {
    if (!revisionValue()) {
      void load()
    }

    return (
      <ui.SettingsLayout
        title="Instructions"
        description={ctx.t('description')}
        actions={
          <ui.Button
            variant="neutral"
            disabled={busy() || !revisionValue() || !dirty()}
            busy={busy()}
            onClick={() => void save()}
          >
            {ctx.t('save')}
          </ui.Button>
        }
      >
        <ui.SettingsSection
          title={ctx.t('section')}
          footer={
            <span class="text-11-regular text-v2-text-text-muted" role="status" aria-live="polite">
              {displayStatus()}
            </span>
          }
        >
          <ui.SettingsRow id="global" title="AGENTS.md" description={path()}>
            <ui.Button variant="ghost" disabled={busy()} onClick={() => void load()}>
              {ctx.t('reload')}
            </ui.Button>
          </ui.SettingsRow>
          <div class="flex min-w-0 flex-col gap-3 pt-3 pb-4">
            <div
              data-component="textarea-v2"
              class="instructions-editor"
              data-disabled={busy() || !revisionValue() ? '' : undefined}
            >
              <textarea
                rows="24"
                value={text()}
                disabled={busy() || !revisionValue()}
                spellcheck={false}
                aria-label={ctx.t('editor')}
                data-slot="textarea-v2-textarea"
                onInput={(event) => {
                  setText(event.currentTarget.value)
                  setStatus('')
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault()
                    void save()
                  }
                }}
              />
            </div>
          </div>
        </ui.SettingsSection>
      </ui.SettingsLayout>
    )
  }

  ctx.add(SettingsPage, {
    id: 'instructions',
    title: 'Instructions',
    get entries() {
      return [
        {
          id: 'global',
          title: ctx.t('editor'),
          keywords: 'instructions rules 지침 규칙',
        },
      ]
    },
    render: () => <Editor />,
  })
}
