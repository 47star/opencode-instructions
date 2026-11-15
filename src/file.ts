import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SaveInput } from './ipc'

const externalModificationMessage = 'The file changed externally. Reload before saving.'

export function instructionsPath() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'opencode', 'AGENTS.md')
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code
}

async function ensureInstructionsFile(path: string) {
  await mkdir(dirname(path), { recursive: true })

  try {
    await lstat(path)
    return
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) {
      throw error
    }
  }

  try {
    await writeFile(path, '', { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error
    }
  }
}

function snapshot(path: string, text: string) {
  const revision = createHash('sha256').update(text).digest('hex')
  return { path, text, revision }
}

export async function readInstructions(path: string) {
  await ensureInstructionsFile(path)
  return snapshot(path, await readFile(path, 'utf8'))
}

export async function saveInstructions(path: string, input: SaveInput) {
  const current = snapshot(path, await readFile(path, 'utf8'))

  if (current.revision !== input.revision) {
    throw new Error(externalModificationMessage)
  }

  const target = await realpath(path)
  const mode = (await stat(target)).mode & 0o777
  const temporary = `${target}.${randomUUID()}.tmp`

  try {
    await writeFile(temporary, input.text, { flag: 'wx', mode })
    await chmod(temporary, mode)

    const latest = snapshot(path, await readFile(path, 'utf8'))
    const targetChanged = (await realpath(path)) !== target

    if (latest.revision !== input.revision || targetChanged) {
      throw new Error(externalModificationMessage)
    }

    await rename(temporary, target)
    return snapshot(path, input.text)
  } finally {
    await rm(temporary, { force: true })
  }
}
