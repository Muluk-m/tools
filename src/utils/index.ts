interface SendResponseOptions<T = any> {
  type: 'Success' | 'Fail'
  message?: string
  data?: T
}

export function sendResponse<T>(options: SendResponseOptions<T>) {
  if (options.type === 'Success') {
    return {
      message: options.message ?? null,
      data: options.data ?? null,
      success: true,
    }
  }

  return {
    message: options.message ?? 'Failed',
    data: options.data ?? null,
    success: false,
  }
}

export * from './stackParser'
