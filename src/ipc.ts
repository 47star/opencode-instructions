import { Ipc } from '@opencode/plugin/gui'
import { Schema } from 'effect'

export type SaveInput = {
  text: string
  revision: string
}

const Snapshot = Schema.Struct({
  path: Schema.String,
  text: Schema.String,
  revision: Schema.String,
})

export const Instructions = Ipc.define({
  id: 'opencode-instructions.file',
  methods: {
    read: { output: Snapshot },
    save: {
      input: Schema.Struct({ text: Schema.String, revision: Schema.String }),
      output: Snapshot,
    },
  },
})
