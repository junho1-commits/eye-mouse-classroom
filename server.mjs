import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 5173
const root = join(dirname(fileURLToPath(import.meta.url)), 'dist')
const url = `http://${host}:${port}`

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

function openBrowser() {
  if (process.env.EYE_MOUSE_NO_BROWSER === '1') return
  const child = spawn('cmd.exe', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', url).pathname)
    const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '')
    let filePath = join(root, safePath === '/' ? 'index.html' : safePath)

    try {
      const info = await stat(filePath)
      if (info.isDirectory()) filePath = join(filePath, 'index.html')
    } catch {
      filePath = join(root, 'index.html')
    }

    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    response.end(content)
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('프로그램 파일을 읽지 못했습니다.')
    console.error(error)
  }
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    openBrowser()
    process.exit(0)
  }
  console.error(error)
  process.exit(1)
})

server.listen(port, host, () => {
  openBrowser()
  console.log(`눈으로 여는 교실: ${url}`)
  console.log('이 창은 프로그램을 종료할 때까지 유지해 주세요.')
})
