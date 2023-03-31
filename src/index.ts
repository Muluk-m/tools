import path from 'path'
import express from 'express'
import formidable from 'formidable'
import { parserStack } from './tools'
import { sendResponse } from './utils'

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json())

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

router.post('/upload', async (req, res) => {
  try {
    const form = formidable({
      keepExtensions: true,
      uploadDir: path.resolve(__dirname, '../.tmp/'),
    })

    globalThis.console.log(req.headers, form)

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.send(sendResponse({ type: 'Fail', message: err.message }))
        return
      }
      const filePath = (files.file as any)?.filepath

      res.send(
        sendResponse({
          type: 'Success',
          data: filePath,
        }),
      )
    })
  }
  catch (error) {
    globalThis.console.log(error)
    res.send(sendResponse({ type: 'Fail', message: error.message }))
  }
})

router.post('/parser-error', async (req, res) => {
  try {
    const form = formidable({
      keepExtensions: true,
      uploadDir: path.resolve(__dirname, '../.tmp/'),
    })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.send(sendResponse({ type: 'Fail', message: err.message }))
        return
      }

      const filePath = (files.file as any)?.filepath

      if (!filePath) {
        res.send(
          sendResponse({ type: 'Fail', message: 'Filepath is missing' }),
        )
        return
      }

      const response = await parserStack(fields.stack as string, filePath)
      res.send(response)
    })
  }
  catch (error) {
    globalThis.console.log(error)
    res.send(sendResponse({ type: 'Fail', message: error.message }))
  }
})

app.use('', router)
app.set('trust proxy', 1)

app.listen(3100, () =>
  globalThis.console.log('Server is running on port 3100'),
)
