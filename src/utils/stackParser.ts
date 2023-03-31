import type { IStack } from '../types'

// global reference to slice
const UNKNOWN_FUNCTION = '?'
const OPERA10_PRIORITY = 10
const OPERA11_PRIORITY = 20
const CHROME_PRIORITY = 30
const WINJS_PRIORITY = 40
const GECKO_PRIORITY = 50
const STACKTRACE_LIMIT = 50

function createFrame(
  filename: string,
  func: string,
  lineno?: number,
  colno?: number,
): IStack.StackFrame {
  const frame: IStack.StackFrame = {
    filename,
    function: func,
    // All browser frames are considered in_app
    in_app: true,
  }

  if (lineno !== undefined)
    frame.lineno = lineno

  if (colno !== undefined)
    frame.colno = colno

  return frame
}

/**
 * Safari web extensions, starting version unknown, can produce "frames-only" stacktraces.
 * What it means, is that instead of format like:
 *
 * Error: wat
 *   at function@url:row:col
 *   at function@url:row:col
 *   at function@url:row:col
 *
 * it produces something like:
 *
 *   function@url:row:col
 *   function@url:row:col
 *   function@url:row:col
 *
 * Because of that, it won't be captured by `chrome` RegExp and will fall into `Gecko` branch.
 * This function is extracted so that we can use it in both places without duplicating the logic.
 * Unfortunately "just" changing RegExp is too complicated now and making it pass all tests
 * and fix this case seems like an impossible, or at least way too time-consuming task.
 */
const extractSafariExtensionDetails = (
  func: string,
  filename: string,
): [string, string] => {
  const isSafariExtension = func.includes('safari-extension')
  const isSafariWebExtension = func.includes('safari-web-extension')
  return (isSafariExtension || isSafariWebExtension)
    ? [
        func.includes('@') ? func.split('@')[0] : UNKNOWN_FUNCTION,
        isSafariExtension
          ? `safari-extension:${filename}`
          : `safari-web-extension:${filename}`,
      ]
    : [func, filename]
}

// Chromium based browsers: Chrome, Brave, new Opera, new Edge
const chromeRegex
  = /^\s*at (?:(.*?) ?\((?:address at )?)?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[-a-z]+:|.*bundle|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i
const chromeEvalRegex = /\((\S*)(?::(\d+))(?::(\d+))\)/

const chrome: IStack.StackLineParserFn = (line) => {
  const parts = chromeRegex.exec(line)

  if (parts) {
    const isEval = parts[2] && parts[2].indexOf('eval') === 0 // start of line

    if (isEval) {
      const subMatch = chromeEvalRegex.exec(parts[2])

      if (subMatch) {
        // throw out eval line/column and use top-most line/column number
        parts[2] = subMatch[1] // url
        parts[3] = subMatch[2] // line
        parts[4] = subMatch[3] // column
      }
    }

    // Kamil: One more hack won't hurt us right? Understanding and adding more rules on top of these regexps right now
    // would be way too time consuming. (TODO: Rewrite whole RegExp to be more readable)
    const [func, filename] = extractSafariExtensionDetails(
      parts[1] || UNKNOWN_FUNCTION,
      parts[2],
    )

    return createFrame(
      filename,
      func,
      parts[3] ? +parts[3] : undefined,
      parts[4] ? +parts[4] : undefined,
    )
  }

  return null
}

const chromeStackParser: IStack.StackLineParser = [CHROME_PRIORITY, chrome]

// gecko regex: `(?:bundle|\d+\.js)`: `bundle` is for react native, `\d+\.js` also but specifically for ram bundles because it
// generates filenames without a prefix like `file://` the filenames in the stacktrace are just 42.js
// We need this specific case for now because we want no other regex to match.
const geckoREgex
  = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension|capacitor).*?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i
const geckoEvalRegex = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i

const gecko: IStack.StackLineParserFn = (line) => {
  const parts = geckoREgex.exec(line)

  if (parts) {
    const isEval = parts[3] && parts[3].includes(' > eval')
    if (isEval) {
      const subMatch = geckoEvalRegex.exec(parts[3])

      if (subMatch) {
        // throw out eval line/column and use top-most line number
        parts[1] = parts[1] || 'eval'
        parts[3] = subMatch[1]
        parts[4] = subMatch[2]
        parts[5] = '' // no column when eval
      }
    }

    let filename = parts[3]
    let func = parts[1] || UNKNOWN_FUNCTION;
    [func, filename] = extractSafariExtensionDetails(func, filename)

    return createFrame(
      filename,
      func,
      parts[4] ? +parts[4] : undefined,
      parts[5] ? +parts[5] : undefined,
    )
  }

  return null
}

export const geckoStackParser: IStack.StackLineParser = [GECKO_PRIORITY, gecko]

const winjsRegex
  = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i

const winjs: IStack.StackLineParserFn = (line) => {
  const parts = winjsRegex.exec(line)

  return parts
    ? createFrame(
      parts[2],
      parts[1] || UNKNOWN_FUNCTION,
      +parts[3],
      parts[4] ? +parts[4] : undefined,
    )
    : undefined
}

export const winjsStackParser: IStack.StackLineParser = [WINJS_PRIORITY, winjs]

const opera10Regex
  = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i

const opera10: IStack.StackLineParserFn = (line) => {
  const parts = opera10Regex.exec(line)
  return parts
    ? createFrame(parts[2], parts[3] || UNKNOWN_FUNCTION, +parts[1])
    : undefined
}

const opera10StackParser: IStack.StackLineParser = [OPERA10_PRIORITY, opera10]

const opera11Regex
  = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^)]+))\(.*\))? in (.*):\s*$/i

const opera11: IStack.StackLineParserFn = (line) => {
  const parts = opera11Regex.exec(line)
  return parts
    ? createFrame(
      parts[5],
      parts[3] || parts[4] || UNKNOWN_FUNCTION,
      +parts[1],
      +parts[2],
    )
    : undefined
}

const opera11StackParser: IStack.StackLineParser = [OPERA11_PRIORITY, opera11]

// Based on our own mapping pattern - https://github.com/getsentry/sentry/blob/9f08305e09866c8bd6d0c24f5b0aabdd7dd6c59c/src/sentry/lang/javascript/errormapping.py#L83-L108
const reactMinifiedRegexp = /Minified React error #\d+;/i

function getPopSize(stack: string): number {
  if (reactMinifiedRegexp.test(stack))
    return 1

  return 0
}

/**
 * @hidden
 */
export function stripSentryFramesAndReverse(
  stack: IStack.StackFrame[],
): IStack.StackFrame[] {
  if (!stack.length)
    return []

  let localStack = stack

  const firstFrameFunction = localStack[0].function || ''

  // If stack starts with one of our API calls, remove it (starts, meaning it's the top of the stack - aka last call)
  if (
    firstFrameFunction.includes('captureMessage')
    || firstFrameFunction.includes('captureException')
  )
    localStack = localStack.slice(1)

  // The frame where the crash happened, should be the last entry in the array
  return localStack
    .slice(0, STACKTRACE_LIMIT)
    .map(frame => ({
      ...frame,
      filename: frame.filename || localStack[0].filename,
      function: frame.function || '?',
    }))
    // .reverse()
}

/**
 * Creates a stack parser with the supplied line parsers
 *
 * StackFrames are returned in the correct order for Sentry Exception
 * frames and with Sentry SDK internal frames removed from the top and bottom
 */
function createStackParser(
  ...parsers: IStack.StackLineParser[]
): IStack.StackParser {
  const sortedParsers = parsers.sort((a, b) => a[0] - b[0]).map(p => p[1])

  return (stack: string, skipFirst = 0): IStack.StackFrame[] => {
    const frames: IStack.StackFrame[] = []

    for (const line of stack.split('\n').slice(skipFirst)) {
      for (const parser of sortedParsers) {
        const frame = parser(line)

        if (frame) {
          frames.push(frame)
          break
        }
      }
    }

    return stripSentryFramesAndReverse(frames)
  }
}

/** Parses stack frames from an error */
export function parseStackFrames(stack: string): IStack.StackFrame[] {
  // Access and store the stacktrace property before doing ANYTHING
  // else to it because Opera is not very good at providing it
  // reliably in other circumstances.

  const popSize = getPopSize(stack)

  try {
    return createStackParser(
      opera10StackParser,
      opera11StackParser,
      chromeStackParser,
      winjsStackParser,
      geckoStackParser,
    )(stack || '', popSize)
  }
  catch (e) {
    // no-empty
  }

  return []
}
