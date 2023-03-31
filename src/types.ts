export namespace IStack {
  export interface StackFrame {
    filename?: string
    function?: string
    lineno?: number
    colno?: number
    in_app?: boolean
  }

  export type StackParser = (stack: string, skipFirst?: number) => StackFrame[]
  export type StackLineParserFn = (line: string) => StackFrame | undefined
  export type StackLineParser = [number, StackLineParserFn]

  /** JSDoc */
  export interface Stacktrace {
    frames?: StackFrame[]
  }

  /** JSDoc */
  export interface Exception {
    type?: string
    value?: string
    stacktrace?: Stacktrace
  }
}
