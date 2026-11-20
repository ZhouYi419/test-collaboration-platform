import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, request, requestBlob, writeJson } from '../src/http.ts'

test('JSON 写请求统一编码并允许无请求体的退出和授权操作', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get('Content-Type'), 'application/json')
    return Response.json({ saved: true })
  })
  for (const method of ['POST', 'PATCH', 'PUT'] as const) {
    assert.deepEqual(await writeJson(method, 'issues/id/actions', { feedback: '处理说明' }), { saved: true })
    const options = fetch.mock.calls.at(-1)!.arguments[1]
    assert.ok(options)
    assert.equal(options.method, method)
    assert.deepEqual(JSON.parse(String(options.body)), { feedback: '处理说明' })
  }
  await writeJson('POST', 'auth/logout')
  const options = fetch.mock.calls.at(-1)!.arguments[1]
  assert.ok(options)
  assert.equal(options.body, undefined)
})

test('保留同源凭据、请求内容和服务端字段错误', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.method, 'POST')
    assert.equal(options.body, '{"title":"事项"}')
    return Response.json({ detail: {
      code: 'validation_error', message: '请检查表单输入', fields: { title: '请填写标题' },
    } }, { status: 422 })
  })
  await assert.rejects(request('issues', { method: 'POST', body: '{"title":"事项"}' }), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'validation_error')
    assert.deepEqual(error.fields, { title: '请填写标题' })
    return true
  })
  assert.equal(fetch.mock.callCount(), 1)
})

test('异常字段映射不会进入页面，合法字段仍可展示', async t => {
  const bodies = [null, [], '错误', { feedback: null, title: 42, description: '请填写描述' }]
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: {
    code: 'validation_error', message: '请检查表单输入', fields: bodies.shift(),
  } }, { status: 422 }))
  for (const fields of [{}, {}, {}, { description: '请填写描述' }]) {
    await assert.rejects(request('issues'), error => {
      assert.ok(error instanceof ApiError)
      assert.deepEqual(error.fields, fields)
      return true
    })
  }
})

test('网关 HTML 错误保留 HTTP 状态并提供可读提示', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad Gateway</html>', { status: 502 }))
  await assert.rejects(request('auth/me'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 502)
    assert.equal(error.code, 'request_failed')
    return true
  })
})

test('成功响应中的无效 JSON 不会冒充成功', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{'))
  await assert.rejects(request('auth/me'), { code: 'invalid_response' })
})

test('支持无内容响应和二进制附件', async t => {
  t.mock.method(globalThis, 'fetch', async (path: string) => path.endsWith('logout')
    ? new Response(null, { status: 204 }) : new Response(new Uint8Array([0, 128, 255])))
  assert.equal(await request('auth/logout', { method: 'POST' }), undefined)
  assert.deepEqual(new Uint8Array(await (await requestBlob('issues/file')).arrayBuffer()), new Uint8Array([0, 128, 255]))
})

test('连接失败不会自动重试写请求', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(request('issues/id/actions', { method: 'POST' }), { code: 'network_error' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('超时覆盖 JSON 与附件响应体读取', async t => {
  const timeouts: number[] = []
  let timeoutController: AbortController
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    timeouts.push(milliseconds)
    timeoutController = new AbortController()
    return timeoutController.signal
  })
  t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    const stream = new ReadableStream({ start(controller) {
      options.signal!.addEventListener('abort', () => controller.error(options.signal!.reason), { once: true })
      setImmediate(() => timeoutController.abort(new DOMException('timeout', 'TimeoutError')))
    } })
    return new Response(stream)
  })
  await assert.rejects(request('issues'), { code: 'request_timeout' })
  await assert.rejects(requestBlob('issues/file', { timeoutMs: 120_000 }), { code: 'request_timeout' })
  assert.deepEqual(timeouts, [60_000, 120_000])
})

test('调用方取消与超时分别反馈', async t => {
  t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    options.signal!.throwIfAborted()
    throw new Error('不应发出请求')
  })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(request('issues', { signal: controller.signal }), { code: 'request_cancelled' })
})
