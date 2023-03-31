import fs from 'fs'
import path from 'path'
import sourceMap from 'source-map'
import { parseStackFrames, sendResponse } from '../utils'

const clear = () => {
  const directoryPath = path.resolve(__dirname, '../../.tmp/')
  fs.readdir(directoryPath, (err, files) => {
    if (err)
      throw err

    for (const file of files) {
      fs.unlink(path.join(directoryPath, file), (err) => {
        if (err)
          throw err
      })
    }
  })
}

export async function parserStack(stack: string, filePath: string) {
  const map = fs.readFileSync(filePath).toString()
  const consumer = await new sourceMap.SourceMapConsumer(map)
  const stacktrace = parseStackFrames(stack)
  const codeList = stacktrace.map(({ lineno, colno, filename }) => {
    const originalPosition = consumer.originalPositionFor({
      line: lineno,
      column: colno,
    })

    if (!originalPosition.source) {
      return {
        ...originalPosition,
        code: '',
        filename,
      }
    }

    const code = consumer
      .sourceContentFor(originalPosition.source)
      .split('\n')
      .slice(Math.max(originalPosition.line - 5, 0), originalPosition.line + 5)
      .join('\n')

    return {
      code,
      filename,
      ...originalPosition,
      source: `${originalPosition.source.replace('webpack://', '')}`,
    }
  })

  if (codeList.length === 0) {
    return sendResponse({
      type: 'Fail',
      message: 'Failed to parser',
    })
  }

  consumer.destroy()
  clear()

  return sendResponse({
    type: 'Success',
    data: {
      codeList,
    },
  })
}
