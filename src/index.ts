import fs from 'fs'
import * as dotenv from 'dotenv'
import express from 'express'
import formidable from 'formidable'
import { parserStack, readProjectTree, sourceMapStore } from './tools'
import { sendResponse } from './utils'
import { TMP_PATH } from './share'

dotenv.config()

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
    if (!fs.existsSync(TMP_PATH))
      fs.mkdirSync(TMP_PATH, { recursive: true })
    const form = formidable({
      keepExtensions: true,
      uploadDir: TMP_PATH,
      filename: (name, extensions) => {
        return name + extensions
      },
    })

    form.parse(req, async (err, fields, files) => {
      if (err)
        res.send(sendResponse({ type: 'Fail', message: err.message }))

      res.send(sourceMapStore(files, fields))
    })
  }
  catch (error) {
    globalThis.console.log(error)
    res.send(sendResponse({ type: 'Fail', message: error.message }))
  }
})

router.post('/parser-error', async (req, res) => {
  try {
    if (!fs.existsSync(TMP_PATH))
      fs.mkdirSync(TMP_PATH, { recursive: true })

    const form = formidable({
      keepExtensions: true,
      uploadDir: TMP_PATH,
      filename: (name, extensions) => {
        return name + extensions
      },
    })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.send(sendResponse({ type: 'Fail', message: err.message }))
        return
      }

      const { stack, version } = fields as Record<string, string>

      if (files.file && !version) {
        res.send(
          sendResponse({ type: 'Fail', message: 'Filepath is missing' }),
        )
        return
      }

      if (version)
        res.send(await parserStack(stack, version))
      else
        res.send(await parserStack(stack))
    })
  }
  catch (error) {
    globalThis.console.log(error)
    res.send(sendResponse({ type: 'Fail', message: error.message }))
  }
})

router.get('/project/list', async (req, res) => {
  try {
    const projectList = readProjectTree()

    res.send(sendResponse({
      type: 'Success',
      data: {
        list: projectList,
      },
    }))
  }
  catch (error) {
    globalThis.console.log(error)
    res.send(sendResponse({ type: 'Fail', message: error.message }))
  }
})

app.use('', router)

app.listen(process.env.HOST, () =>
  globalThis.console.log(`Server is running on port ${process.env.HOST}`),
)
