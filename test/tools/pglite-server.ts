/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { PGlite } from '@electric-sql/pglite';
import * as net from 'node:net';

export enum LogLevel {
  Error,
  Warn,
  Info,
  Debug,
}

export class Logger {
  private readonly prefix: string;

  constructor(
    private readonly logLevel: LogLevel = LogLevel.Info,
    prefix: string
  ) {
    this.prefix = `[${prefix}]:`;
  }

  public debug(...data: any[]) {
    if (this.logLevel < LogLevel.Debug) return;
    console.debug(this.prefix, ...data);
  }

  public info(...data: any[]) {
    if (this.logLevel < LogLevel.Info) return;
    console.info(this.prefix, ...data);
  }

  public warn(...data: any[]) {
    if (this.logLevel < LogLevel.Warn) return;
    console.warn(this.prefix, ...data);
  }

  public error(...data: any[]) {
    console.error(this.prefix, ...data);
  }
}
type MessageName =
  | MessageWithIdentifier
  | MessageWithoutIdentifier
  | 'Unknown'
  | 'InsufficientData';

type MessageWithIdentifier =
  | 'Bind'
  | 'Close'
  | 'CopyFail'
  | 'Describe'
  | 'Execute'
  | 'Flush'
  | 'FunctionCall'
  | 'GSSResponse'
  | 'Parse'
  | 'PasswordMessage'
  | 'Query'
  | 'SASLResponse' // same as "SASLInitialResponse"
  | 'Sync'
  | 'Terminate';

type MessageWithoutIdentifier =
  | 'CancelRequest'
  | 'GSSENCRequest'
  | 'SSLRequest'
  | 'StartupMessage';

export interface FrontendMessage {
  name: MessageName;
  length: number;
  buffer: Buffer;
}

const IDENT_LENGTH = 1;

const IDENT_TO_MESSAGE_NAME: Record<number, MessageWithIdentifier> = {
  ['B'.charCodeAt(0)]: 'Bind',
  ['C'.charCodeAt(0)]: 'Close',
  ['f'.charCodeAt(0)]: 'CopyFail',
  ['D'.charCodeAt(0)]: 'Describe',
  ['E'.charCodeAt(0)]: 'Execute',
  ['H'.charCodeAt(0)]: 'Flush',
  ['F'.charCodeAt(0)]: 'FunctionCall',
  ['p'.charCodeAt(0)]: 'GSSResponse',
  ['P'.charCodeAt(0)]: 'Parse',
  ['p'.charCodeAt(0)]: 'PasswordMessage',
  ['Q'.charCodeAt(0)]: 'Query',
  ['p'.charCodeAt(0)]: 'SASLResponse',
  ['S'.charCodeAt(0)]: 'Sync',
  ['X'.charCodeAt(0)]: 'Terminate',
};

const UNKNOWN_MESSAGE: FrontendMessage = {
  name: 'Unknown',
  length: 0,
  buffer: Buffer.alloc(0),
};

const INSUFFICIENT_DATA: FrontendMessage = {
  name: 'Unknown',
  length: 0,
  buffer: Buffer.alloc(0),
};

function isCancelRequest(buffer: Buffer): boolean {
  // 1234 5678
  return (
    buffer.at(4) === 0x04 &&
    buffer.at(5) === 0xd2 &&
    buffer.at(6) === 0x16 &&
    buffer.at(7) === 0x2e
  );
}

function isGSSENCRequest(buffer: Buffer): boolean {
  // 1234 5680
  return (
    buffer.at(4) === 0x04 &&
    buffer.at(5) === 0xd2 &&
    buffer.at(6) === 0x16 &&
    buffer.at(7) === 0x30
  );
}

function isSSLRequest(buffer: Buffer): boolean {
  // 1234 5679
  return (
    buffer.at(4) === 0x04 &&
    buffer.at(5) === 0xd2 &&
    buffer.at(6) === 0x16 &&
    buffer.at(7) === 0x2f
  );
}

function isStartupMessage(buffer: Buffer): boolean {
  // 0003 0000
  return (
    buffer.at(4) === 0x00 &&
    buffer.at(5) === 0x03 &&
    buffer.at(6) === 0x00 &&
    buffer.at(7) === 0x00
  );
}

// https://www.postgresql.org/docs/current/protocol.html
// https://www.postgresql.org/docs/current/protocol-message-formats.html
export function parseMessage(buffer: Buffer): FrontendMessage {
  if (buffer.length === 0) {
    return INSUFFICIENT_DATA;
  }

  if (isCancelRequest(buffer)) {
    const length = buffer.readUint32BE(0);
    return {
      name: 'CancelRequest',
      length,
      buffer: Buffer.from(buffer.subarray(0, length)),
    };
  }

  if (isGSSENCRequest(buffer)) {
    const length = buffer.readUint32BE(0);
    return {
      name: 'GSSENCRequest',
      length,
      buffer: Buffer.from(buffer.subarray(0, length)),
    };
  }

  if (isSSLRequest(buffer)) {
    const length = buffer.readUint32BE(0);
    return {
      name: 'SSLRequest',
      length,
      buffer: Buffer.from(buffer.subarray(0, length)),
    };
  }

  if (isStartupMessage(buffer)) {
    const length = buffer.readUint32BE(0);
    return {
      name: 'StartupMessage',
      length,
      buffer: Buffer.from(buffer.subarray(0, length)),
    };
  }

  const name = IDENT_TO_MESSAGE_NAME[buffer.at(0)!];
  if (!name) {
    return UNKNOWN_MESSAGE;
  }

  const length = buffer.readUint32BE(1) + IDENT_LENGTH;
  if (buffer.length < length) {
    return INSUFFICIENT_DATA;
  }

  return {
    name,
    length,
    buffer: Buffer.from(buffer.subarray(0, length)),
  };
}

function createCancelRequest(): Buffer {
  return new GrowableOffsetBuffer().toBuffer(); // todo!()
}

function createGSSENCRequest(): Buffer {
  return new GrowableOffsetBuffer().toBuffer(); // todo!()
}

// https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-SSL
// "The server then responds with a single byte containing S or N, indicating that it is willing or unwilling to perform SSL, respectively."
function createSSLRequestReponse(): Buffer {
  // SSL negotiation
  const sslNegotiation = new GrowableOffsetBuffer();
  sslNegotiation.write('N');
  return sslNegotiation.toBuffer();
}

function createStartupMessageReponse(): Buffer {
  // AuthenticationOk
  const authOk = new GrowableOffsetBuffer();
  authOk.write('R');
  authOk.writeUint32BE(8);
  authOk.writeUint32BE(0);

  // ParameterStatus
  const parameterStatus = new GrowableOffsetBuffer();
  const paramKey = 'server_version';
  // Some tools (eg. DBeaver and Datagrip) require `server_version` param to be announced during startup.
  // The value itself is not important, only the existence of it, as call to `SHOW server_version;`
  // which is used to display version in the UI,  will be redirected to the underlying `execProtocol` anyway.
  const paramValue = 'pglite';
  parameterStatus.write('S');
  parameterStatus.writeUint32BE(6 + paramKey.length + paramValue.length);
  parameterStatus.write(paramKey);
  parameterStatus.writeUint8(0);
  parameterStatus.write(paramValue);
  parameterStatus.writeUint8(0);

  // BackendKeyData
  const backendKeyData = new GrowableOffsetBuffer();
  backendKeyData.write('K');
  backendKeyData.writeUint32BE(12);
  backendKeyData.writeUint32BE(1);
  backendKeyData.writeUint32BE(2);

  // ReadyForQuery
  const readyForQuery = new GrowableOffsetBuffer();
  readyForQuery.write('Z');
  readyForQuery.writeUint32BE(5);
  readyForQuery.write('I');

  return Buffer.concat([
    authOk.toBuffer(),
    parameterStatus.toBuffer(),
    backendKeyData.toBuffer(),
    readyForQuery.toBuffer(),
  ]);
}

// https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-SIMPLE-QUERY
// "In the event of an error, ErrorResponse is issued followed by ReadyForQuery."
function createErrorReponse(message: string): Buffer {
  // ErrorResponse
  const errorResponse = new GrowableOffsetBuffer();
  errorResponse.write('E');
  errorResponse.writeUint32BE(7 + message.length);
  errorResponse.write('M');
  errorResponse.write(message);
  errorResponse.writeUint8(0);
  errorResponse.writeUint8(0);

  // ReadyForQuery
  const readyForQuery = new GrowableOffsetBuffer();
  readyForQuery.write('Z');
  readyForQuery.writeUint32BE(5);
  readyForQuery.write('I');

  return Buffer.concat([errorResponse.toBuffer(), readyForQuery.toBuffer()]);
}

export async function createMessageResponse(
  message: FrontendMessage,
  db: PGlite
): Promise<Buffer> {
  switch (message.name) {
    case 'CancelRequest': {
      return createCancelRequest();
    }
    case 'GSSENCRequest': {
      return createGSSENCRequest();
    }
    case 'SSLRequest': {
      return createSSLRequestReponse();
    }
    case 'StartupMessage': {
      return createStartupMessageReponse();
    }
    default: {
      try {
        const result = await db.execProtocol(message.buffer);
        return Buffer.from(result.data);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Unknown error message';
        return createErrorReponse(message);
      }
    }
  }
}

type ServerOptions = net.ServerOpts & {
  logLevel: LogLevel;
};

export function createServer(
  db: PGlite,
  options: Partial<ServerOptions> = { logLevel: LogLevel.Info }
) {
  const server = net.createServer(options);

  server.on('connection', function (socket) {
    let clientBuffer = Buffer.allocUnsafe(0);
    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    const logger = new Logger(options.logLevel, clientAddr);

    logger.info(`Client connected`);

    socket.on('data', async (data) => {
      clientBuffer = Buffer.concat([clientBuffer, data]);

      while (clientBuffer.length > 0) {
        const message = parseMessage(clientBuffer);

        logger.debug(`${'-'.repeat(42)}\n`);
        logger.debug(`> Current buffer`);
        logger.debug(`> Length: ${clientBuffer.length}`);
        logger.debug(`> Raw:`, clientBuffer);
        logger.debug(`> Text: ${clientBuffer.toString()}`);
        logger.debug(``);
        logger.debug(`>> Message name: ${message.name}`);
        logger.debug(`>> Message length: ${message.length}`);
        logger.debug(`>> Message buffer raw:`, message.buffer);
        logger.debug(`>> Message buffer text: ${message.buffer.toString()}`);
        logger.debug(``);

        if (message.name === 'InsufficientData') {
          continue;
        }

        if (message.name === 'Unknown' || message.name === 'Terminate') {
          socket.end();
          return;
        }

        const response = await createMessageResponse(message, db);
        socket.write(response);
        clientBuffer = Buffer.from(clientBuffer.subarray(message.length));
        logger.debug(`> Remaining buffer`);
        logger.debug(`> Length: ${clientBuffer.length}`);
        logger.debug(`> Raw:`, clientBuffer);
        logger.debug(`> Text: ${clientBuffer.toString() || '<empty>'}`);
        logger.debug(``);
      }
    });

    socket.on('end', () => {
      logger.info(`Client disconnected`);
    });

    socket.on('error', (err) => {
      logger.error(`Client error:`, err);
      socket.end();
    });
  });

  server.on('error', (err) => {
    throw err;
  });

  return server;
}

export class GrowableOffsetBuffer {
  #buffer = Buffer.alloc(16);
  #offset = 0;

  write(data: string) {
    this.updateCapacity(data.length);
    this.#buffer.write(data, this.#offset);
    this.#offset += data.length;
  }

  writeUint8(data: number) {
    this.updateCapacity(1);
    this.#buffer.writeUint8(data, this.#offset);
    this.#offset += 1;
  }

  writeUint32BE(data: number) {
    this.updateCapacity(4);
    this.#buffer.writeUint32BE(data, this.#offset);
    this.#offset += 4;
  }

  updateCapacity(chunkLength: number) {
    while (this.#buffer.byteLength < this.#offset + chunkLength) {
      const newBuffer = Buffer.alloc(this.#buffer.byteLength * 2);
      this.#buffer.copy(newBuffer, 0, 0, this.#offset);
      this.#buffer = newBuffer;
    }
  }

  toBuffer(): Buffer {
    return Buffer.from(this.#buffer.subarray(0, this.#offset));
  }
}
