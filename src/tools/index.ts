import fs from 'fs'
import path from 'path'
import sourceMap from 'source-map'
import type formidable from 'formidable'
import type { IStack } from 'src/types'
import { SOURCE_MAP_PATH, TMP_PATH } from '../share'
import { parseStackFrames, sendResponse } from '../utils'

const clearTmp = () => {
  fs.readdir(TMP_PATH, (err, files) => {
    if (err)
      throw err

    for (const file of files) {
      fs.unlink(path.join(TMP_PATH, file), (err) => {
        if (err)
          throw err
      })
    }
  })
}

const parserSourceCode = async (dirPath: string, stacktrace: IStack.StackFrame[]) => {
  const sourceCodes = []

  if (!fs.existsSync(dirPath))
    return []

  const sourceMapPaths = fs.readdirSync(dirPath)

  for (const { lineno, colno, filename } of stacktrace) {
    const filePath = sourceMapPaths.find(path => filename.endsWith(path.replace('.map', '')))

    if (!filePath) {
      sourceCodes.push(null)
      continue
    }

    const sourceMapPath = path.join(dirPath, filePath)

    if (!fs.existsSync(sourceMapPath)) {
      sourceCodes.push(null)
      continue
    }

    const rawSourceMap = fs.readFileSync(sourceMapPath, 'utf-8').toString()
    const consumer = await new sourceMap.SourceMapConsumer(rawSourceMap)

    const originalPosition = consumer.originalPositionFor({
      line: lineno,
      column: colno,
    })

    if (!originalPosition.source) {
      consumer.destroy()
      sourceCodes.push(null)
      continue
    }

    const code = consumer
      .sourceContentFor(originalPosition.source)
      .split('\n')
      .slice(Math.max(originalPosition.line - 5, 0), originalPosition.line + 5)
      .join('\n')

    sourceCodes.push({
      code,
      filename,
      ...originalPosition,
      source: `${originalPosition.source.replace('webpack://', '')}`,
    })

    consumer.destroy()
  }

  return sourceCodes.map(item => item || {
    code: null,
    filename: null,
    column: null,
    name: null,
    source: null,
  })
}

export async function parserStack(stack: string, version?: string) {
  const stacktrace = parseStackFrames(stack)

  if (!stacktrace.length) {
    return sendResponse({
      type: 'Fail',
      message: 'Stacktrace parsing failed',
    })
  }

  if (version) {
    const targetDir = path.join(SOURCE_MAP_PATH, version)

    if (!fs.existsSync(targetDir)) {
      return sendResponse({
        type: 'Fail',
        message: 'Invalid version',
      })
    }

    return sendResponse({
      type: 'Success',
      data: { list: await parserSourceCode(targetDir, stacktrace) },
    })
  }

  const list = await parserSourceCode(TMP_PATH, stacktrace)
  clearTmp()

  return sendResponse({
    type: 'Success',
    data: { list },
  })
}

export function sourceMapStore(files: formidable.Files, options: formidable.Fields) {
  const { version, project } = options

  if (!version || !project) {
    return sendResponse({
      type: 'Fail',
      message: 'Missing field version or project',
    })
  }

  for (const key of Object.keys(files)) {
    const file = files[key]
    const target = path.join(SOURCE_MAP_PATH, project as string, version as string)
    const { filepath: source, newFilename: filename } = file as any

    if (!fs.existsSync(target))
      fs.mkdirSync(target, { recursive: true })

    fs.rename(source, path.join(target, filename), (err) => {
      if (err) {
        return sendResponse({
          type: 'Fail',
          message: 'Failed',
        })
      }
    })
  }

  return sendResponse({
    type: 'Success',
    message: 'Success',
  })
}

const isDirectory = (path: string) => fs.statSync(path).isDirectory()

export function readProjectTree() {
  return fs.readdirSync(SOURCE_MAP_PATH)
    .filter(file => isDirectory(`${SOURCE_MAP_PATH}/${file}`))
    .map(project => ({
      label: project,
      value: project,
      children: fs.readdirSync(`${SOURCE_MAP_PATH}/${project}`)
        .filter(file => isDirectory(`${SOURCE_MAP_PATH}/${project}/${file}`))
        .map(version => ({
          label: version,
          value: version,
        })),
    }))
}
