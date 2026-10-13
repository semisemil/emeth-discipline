#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const {
  ProjectApiError,
  ProjectIndexService,
} = require('./records/project-index.js');
const { ArchitectureService } = require('./architecture.js');

const HOST = '127.0.0.1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
});
const STATIC_CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});
const DEFAULT_ASSET_ROOT = path.join(__dirname, 'assets');

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (!key || !key.startsWith('--')) {
      throw new Error('Invalid dashboard server arguments.');
    }
    if (key === '--save-port') {
      values['save-port'] = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('Invalid dashboard server arguments.');
    }
    values[key.slice(2)] = value;
    index += 2;
  }
  const port = Number(values.port);
  if (!path.isAbsolute(values.directory || '')
      || !UUID.test(values['instance-id'] || '')
      || !Number.isInteger(port)
      || port < 0
      || port > 65535
      || typeof values.version !== 'string'
      || values.version.length === 0) {
    throw new Error('Invalid dashboard server arguments.');
  }
  return {
    directory: values.directory,
    instanceId: values['instance-id'],
    port,
    savePort: Object.hasOwn(values, 'save-port'),
    version: values.version,
  };
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may already have been moved.
    }
    throw error;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unlinkOwned(filePath, instanceId) {
  try {
    const value = readJson(filePath);
    if (value && value.instance_id === instanceId) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // Never remove state whose ownership cannot be established.
    }
  }
}

function sendParent(message) {
  if (typeof process.send === 'function' && process.connected) {
    process.send(message, () => process.disconnect());
  } else if (process.env.EMETH_DASHBOARD_START_RESULT) {
    writeJsonAtomic(process.env.EMETH_DASHBOARD_START_RESULT, message);
  }
}

function sendJson(request, response, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function sendEmpty(response, status, extraHeaders = {}) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Length': 0,
    ...extraHeaders,
  });
  response.end();
}

function sendError(request, response, status, code, message, extraHeaders = {}) {
  sendJson(request, response, status, { error: { code, message } }, extraHeaders);
}

function isContainedPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative));
}

function comparablePath(filePath) {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sameFileIdentity(expected, actual) {
  return expected.dev === actual.dev && expected.ino === actual.ino;
}

function closeDescriptor(descriptor) {
  if (descriptor === undefined) {
    return;
  }
  try {
    fs.closeSync(descriptor);
  } catch {
    // The descriptor may already have been closed after an I/O failure.
  }
}

function resolveStaticAsset(assetRoot, relativePath) {
  let descriptor;
  try {
    const resolvedRoot = path.resolve(assetRoot);
    const rootStatus = fs.lstatSync(resolvedRoot, { bigint: true });
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
      return null;
    }
    const canonicalRoot = fs.realpathSync.native(resolvedRoot);
    if (comparablePath(canonicalRoot) !== comparablePath(resolvedRoot)) {
      return null;
    }

    const candidatePath = path.resolve(resolvedRoot, relativePath);
    if (!isContainedPath(resolvedRoot, candidatePath)) {
      return null;
    }
    const canonicalCandidate = fs.realpathSync.native(candidatePath);
    if (!isContainedPath(canonicalRoot, canonicalCandidate)) {
      return null;
    }
    const candidateStatus = fs.statSync(canonicalCandidate, { bigint: true });
    const contentType = STATIC_CONTENT_TYPES[path.extname(canonicalCandidate).toLowerCase()];
    if (!candidateStatus.isFile() || !contentType) {
      return null;
    }

    descriptor = fs.openSync(canonicalCandidate, fs.constants.O_RDONLY);
    const openedStatus = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStatus.isFile() || !sameFileIdentity(candidateStatus, openedStatus)) {
      closeDescriptor(descriptor);
      descriptor = undefined;
      return null;
    }

    const currentCanonicalCandidate = fs.realpathSync.native(candidatePath);
    if (!isContainedPath(canonicalRoot, currentCanonicalCandidate)) {
      closeDescriptor(descriptor);
      descriptor = undefined;
      return null;
    }
    const currentCandidateStatus = fs.statSync(currentCanonicalCandidate, { bigint: true });
    if (!currentCandidateStatus.isFile()
        || !sameFileIdentity(openedStatus, currentCandidateStatus)) {
      closeDescriptor(descriptor);
      descriptor = undefined;
      return null;
    }

    const currentRootStatus = fs.lstatSync(resolvedRoot, { bigint: true });
    const currentCanonicalRoot = fs.realpathSync.native(resolvedRoot);
    if (!currentRootStatus.isDirectory()
        || currentRootStatus.isSymbolicLink()
        || !sameFileIdentity(rootStatus, currentRootStatus)
        || comparablePath(currentCanonicalRoot) !== comparablePath(canonicalRoot)) {
      closeDescriptor(descriptor);
      descriptor = undefined;
      return null;
    }
    return {
      contentType,
      descriptor,
      size: openedStatus.size.toString(),
    };
  } catch {
    closeDescriptor(descriptor);
    return null;
  }
}

function staticRelativePath(target) {
  if (target.pathname === '/') {
    const queryEntries = [...target.searchParams.entries()];
    if (queryEntries.length !== 0
        && (queryEntries.length !== 1
          || queryEntries[0][0] !== 'expected_version'
          || queryEntries[0][1].length === 0)) {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    return 'index.html';
  }
  if (target.pathname === '/dashboard') {
    const entries = [...target.searchParams.entries()];
    const names = new Set(entries.map(([name]) => name));
    if (entries.length > 2
        || names.size !== entries.length
        || entries.some(([name, value]) => (
          (name !== 'project' && name !== 'expected_version')
          || (name === 'project' && !UUID.test(value))
          || (name === 'expected_version' && value.length === 0)
        ))) {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    return 'dashboard.html';
  }
  if (target.pathname === '/architecture') {
    const entries = [...target.searchParams.entries()];
    const names = new Set(entries.map(([name]) => name));
    if (entries.length > 2
        || names.size !== entries.length
        || entries.some(([name, value]) => (
          (name !== 'project' && name !== 'document')
          || (name === 'project' && !UUID.test(value))
          || (name === 'document' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))
        ))) {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    return 'architecture.html';
  }
  if (target.search !== '') {
    throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
  }
  return target.pathname.slice(1);
}

function serveStaticAsset(request, response, target, assetRoot) {
  const asset = resolveStaticAsset(assetRoot, staticRelativePath(target));
  if (!asset) {
    return false;
  }
  try {
    const body = request.method === 'HEAD' ? undefined : fs.readFileSync(asset.descriptor);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': asset.contentType,
      'Content-Length': body ? body.length : asset.size,
    });
    response.end(body);
    return true;
  } finally {
    closeDescriptor(asset.descriptor);
  }
}

function parseRequestTarget(rawTarget) {
  if (typeof rawTarget !== 'string'
      || !rawTarget.startsWith('/')
      || rawTarget.startsWith('//')
      || rawTarget.includes('%')
      || rawTarget.includes('\\')
      || rawTarget.includes('\0')
      || rawTarget.split(/[/?#]/).includes('..')) {
    throw new ProjectApiError('request-target-invalid', '요청 경로가 올바르지 않습니다.', 400);
  }
  try {
    return new URL(rawTarget, 'http://127.0.0.1');
  } catch (error) {
    throw new ProjectApiError('request-target-invalid', '요청 경로가 올바르지 않습니다.', 400, error);
  }
}

function validateRequestBoundary(request) {
  const expectedHost = `${HOST}:${request.socket.localPort}`;
  const expectedOrigin = `http://${expectedHost}`;
  const origin = request.headers.origin;
  const rawHeaders = Array.isArray(request.rawHeaders) ? request.rawHeaders : [];
  let hostFieldCount = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === 'host') {
      hostFieldCount += 1;
    }
  }
  if (hostFieldCount !== 1 || request.headers.host !== expectedHost) {
    return {
      error: { code: 'host-forbidden', message: 'Host가 허용되지 않습니다.', status: 403 },
    };
  }
  if (origin !== undefined && origin !== expectedOrigin) {
    return {
      error: { code: 'origin-forbidden', message: 'Origin이 허용되지 않습니다.', status: 403 },
    };
  }
  return { expectedOrigin, origin };
}

function routeApiRequest(request, response, target, options, service, architectureService) {
  if (!target.pathname.startsWith('/api/')) {
    return false;
  }

  if ((request.method === 'GET' || request.method === 'HEAD')
      && target.pathname === '/api/v1/health'
      && target.search === '') {
    sendJson(request, response, 200, {
      schema_version: 1,
      instance_id: options.instanceId,
      version: options.version,
    });
    return true;
  }

  if ((request.method === 'GET' || request.method === 'HEAD')
      && target.pathname === '/api/v1/projects'
      && target.search === '') {
    sendJson(request, response, 200, { projects: service.listProjects() });
    return true;
  }

  const indexMatch = target.pathname.match(/^\/api\/v1\/projects\/([0-9a-f-]+)\/index$/i);
  if ((request.method === 'GET' || request.method === 'HEAD') && indexMatch) {
    if (target.search !== '' && target.search !== '?refresh=1') {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    sendJson(request, response, 200, service.getIndex(indexMatch[1], {
      refresh: target.search === '?refresh=1',
    }));
    return true;
  }

  const architectureIndexMatch = target.pathname.match(
    /^\/api\/v1\/projects\/([0-9a-f-]+)\/architecture(?:\/index)?$/i,
  );
  if (architectureIndexMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendError(request, response, 405, 'method-not-allowed', '허용되지 않은 method입니다.', {
        Allow: 'GET, HEAD',
      });
      return true;
    }
    if (target.search !== '') {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    sendJson(request, response, 200, architectureService.getIndex(architectureIndexMatch[1]));
    return true;
  }

  const architectureDocumentMatch = target.pathname.match(
    /^\/api\/v1\/projects\/([0-9a-f-]+)\/architecture\/documents\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/i,
  );
  if (architectureDocumentMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendError(request, response, 405, 'method-not-allowed', '허용되지 않은 method입니다.', {
        Allow: 'GET, HEAD',
      });
      return true;
    }
    if (target.search !== '') {
      throw new ProjectApiError('query-invalid', '허용되지 않은 query입니다.', 400);
    }
    sendJson(request, response, 200, architectureService.getDocument(
      architectureDocumentMatch[1],
      architectureDocumentMatch[2],
    ));
    return true;
  }

  const documentMatch = target.pathname.match(
    /^\/api\/v1\/projects\/([0-9a-f-]+)\/documents\/(issue|plan|spec|design)\/([A-Z]+-\d{4,})$/,
  );
  if ((request.method === 'GET' || request.method === 'HEAD')
      && documentMatch
      && target.search === '') {
    sendJson(request, response, 200, service.getDocument(
      documentMatch[1],
      documentMatch[2],
      documentMatch[3],
    ));
    return true;
  }

  const deleteMatch = target.pathname.match(/^\/api\/v1\/projects\/([0-9a-f-]+)$/i);
  if (request.method === 'DELETE' && deleteMatch && target.search === '') {
    service.forgetUnavailableProject(deleteMatch[1]);
    sendEmpty(response, 204);
    return true;
  }

  sendError(request, response, 404, 'not-found', 'Not found.');
  return true;
}

function createRequestHandler(options) {
  const service = options.projectService || new ProjectIndexService({
    registryOptions: options.registryOptions,
    now: options.now,
  });
  const architectureService = options.architectureService || new ArchitectureService({
    projectService: service,
  });
  const assetRoot = options.assetRoot ?? DEFAULT_ASSET_ROOT;

  return (request, response) => {
    const boundary = validateRequestBoundary(request);
    if (boundary.error) {
      sendError(
        request,
        response,
        boundary.error.status,
        boundary.error.code,
        boundary.error.message,
      );
      return;
    }
    const { expectedOrigin, origin } = boundary;
    if (!new Set(['GET', 'HEAD', 'DELETE']).has(request.method)) {
      sendError(request, response, 405, 'method-not-allowed', '허용되지 않은 method입니다.', {
        Allow: 'GET, HEAD, DELETE',
      });
      return;
    }
    if (request.method === 'DELETE' && origin !== expectedOrigin) {
      sendError(request, response, 403, 'origin-required', 'DELETE에는 동일 Origin이 필요합니다.');
      return;
    }

    let target;
    try {
      target = parseRequestTarget(request.url);
      if (target.hash) {
        throw new ProjectApiError('request-target-invalid', '요청 경로가 올바르지 않습니다.', 400);
      }
    } catch (error) {
      sendError(request, response, error.status || 400, error.code || 'request-target-invalid', error.message);
      return;
    }

    try {
      if (routeApiRequest(request, response, target, options, service, architectureService)) {
        return;
      }
      if ((request.method === 'GET' || request.method === 'HEAD')
          && serveStaticAsset(request, response, target, assetRoot)) {
        return;
      }

      sendError(request, response, 404, 'not-found', 'Not found.');
    } catch (error) {
      if (error instanceof ProjectApiError) {
        sendError(request, response, error.status, error.code, error.message);
        return;
      }
      sendError(request, response, 500, 'internal-error', '요청을 처리하지 못했습니다.');
    }
  };
}

function endSocketJson(socket, statusLine, value, extraHeaders = {}) {
  if (!socket.writable || socket.destroyed) {
    socket.destroy();
    return;
  }
  const body = JSON.stringify(value);
  const headers = [
    `HTTP/1.1 ${statusLine}`,
    'Connection: close',
    `Content-Security-Policy: ${SECURITY_HEADERS['Content-Security-Policy']}`,
    `X-Content-Type-Options: ${SECURITY_HEADERS['X-Content-Type-Options']}`,
    `Cache-Control: ${SECURITY_HEADERS['Cache-Control']}`,
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(body)}`,
    ...Object.entries(extraHeaders).map(([name, headerValue]) => `${name}: ${headerValue}`),
    '',
    '',
  ].join('\r\n');
  try {
    socket.end(Buffer.concat([Buffer.from(headers, 'ascii'), Buffer.from(body, 'utf8')]));
  } catch {
    socket.destroy();
  }
}

function createDashboardHttpServer(options) {
  const service = options.projectService || new ProjectIndexService({
    registryOptions: options.registryOptions,
    now: options.now,
  });
  const server = http.createServer(
    { requireHostHeader: false },
    createRequestHandler({ ...options, projectService: service }),
  );
  server.once('close', () => {
    if (typeof service.close === 'function') {
      service.close();
    }
  });
  server.on('clientError', (_error, socket) => {
    endSocketJson(socket, '400 Bad Request', {
      error: {
        code: 'request-target-invalid',
        message: '요청 경로가 올바르지 않습니다.',
      },
    });
  });
  server.on('connect', (request, socket) => {
    const boundary = validateRequestBoundary(request);
    if (boundary.error) {
      endSocketJson(socket, '403 Forbidden', {
        error: {
          code: boundary.error.code,
          message: boundary.error.message,
        },
      });
      return;
    }
    endSocketJson(socket, '405 Method Not Allowed', {
      error: {
        code: 'method-not-allowed',
        message: '허용되지 않은 method입니다.',
      },
    }, { Allow: 'GET, HEAD, DELETE' });
  });
  return server;
}

function startServer(options) {
  const settingsPath = path.join(options.directory, 'settings.json');
  const statePath = path.join(options.directory, 'server.json');
  const lockPath = path.join(options.directory, 'server-start.lock');
  let closing = false;
  let ready = false;

  const cleanup = () => {
    unlinkOwned(statePath, options.instanceId);
    unlinkOwned(lockPath, options.instanceId);
  };

  const server = createDashboardHttpServer({
    instanceId: options.instanceId,
    version: options.version,
    registryOptions: options.registryOptions,
  });

  const shutdown = (exitCode = 0) => {
    if (closing) {
      return;
    }
    closing = true;
    const fallback = setTimeout(() => {
      cleanup();
      process.exit(exitCode);
    }, 1000);
    fallback.unref();
    server.close(() => {
      cleanup();
      process.exit(exitCode);
    });
    if (!ready) {
      cleanup();
    }
  };

  server.on('error', (error) => {
    cleanup();
    sendParent({
      ok: false,
      reason: error.code === 'EADDRINUSE' ? 'port-unavailable' : 'start-failed',
    });
    process.exitCode = 1;
  });

  server.listen({ host: HOST, port: options.port, exclusive: true }, () => {
    try {
      const address = server.address();
      const port = address.port;
      fs.mkdirSync(options.directory, { recursive: true });
      if (options.savePort) {
        writeJsonAtomic(settingsPath, { schema_version: 1, port });
      }
      writeJsonAtomic(statePath, {
        schema_version: 1,
        instance_id: options.instanceId,
        pid: process.pid,
        port,
        version: options.version,
        started_at: new Date().toISOString(),
      });
      ready = true;
      unlinkOwned(lockPath, options.instanceId);
      sendParent({ ok: true, pid: process.pid, port });
    } catch (error) {
      cleanup();
      sendParent({ ok: false, reason: 'state-write-failed' });
      server.close(() => {
        process.exitCode = 1;
      });
    }
  });

  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));
  process.once('SIGHUP', () => shutdown(0));
  process.once('exit', cleanup);
  process.once('uncaughtException', () => shutdown(1));
  process.once('unhandledRejection', () => shutdown(1));
  return server;
}

if (require.main === module) {
  try {
    startServer(parseArguments(process.argv.slice(2)));
  } catch (error) {
    sendParent({ ok: false, reason: 'invalid-arguments' });
    process.stderr.write(`Emeth Discipline dashboard server failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  HOST,
  SECURITY_HEADERS,
  createDashboardHttpServer,
  createRequestHandler,
  parseArguments,
  parseRequestTarget,
  startServer,
};
