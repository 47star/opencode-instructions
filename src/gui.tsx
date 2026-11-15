import { Plugin } from '@opencode/plugin/gui'
import { setupEditor } from './editor'
import { instructionsPath, readInstructions, saveInstructions } from './file'
import { Instructions } from './ipc'
import { translations } from './i18n'

export default Plugin.define({
  os: ['macos', 'linux'],
  i18n: translations,
  main(ctx) {
    const path = instructionsPath()
    let writes = Promise.resolve()

    ctx.provide(Instructions, {
      read: () => readInstructions(path),
      save(input) {
        const result = writes.then(() => saveInstructions(path, input))
        writes = result.then(
          () => undefined,
          () => undefined,
        )
        return result
      },
    })
  },
  setup: setupEditor,
})
