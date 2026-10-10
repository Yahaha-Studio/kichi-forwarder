import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);
import {
  __commonJS,
  __require,
  __toESM
} from "./chunk-C5B3JRUS.js";

// ../../node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// ../../node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// ../../node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// ../../node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// ../../node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// ../../node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// ../kichi-core/src/catalog.ts
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ../kichi-core/src/host.ts
import { isIP } from "node:net";
var PLAIN_HOST_DEFAULT_PORT = "48870";
var SECURE_HOST_DEFAULT_PORT = "443";
function parseKichiHost(host) {
  const trimmed = host.trim();
  if (!trimmed) {
    throw new Error("Kichi host must be a non-empty string");
  }
  if (/[\\/?#@]/.test(trimmed)) {
    throw new Error(`Invalid Kichi host "${host}"`);
  }
  const bareIpVersion = isIP(trimmed);
  if (bareIpVersion !== 6) {
    const hasValidAuthorityShape = trimmed.startsWith("[") ? /^\[[^\]]+\](?::\d+)?$/.test(trimmed) : /^[^:]+(?::\d+)?$/.test(trimmed);
    if (!hasValidAuthorityShape) {
      throw new Error(`Invalid Kichi host "${host}"`);
    }
  }
  const authority = bareIpVersion === 6 ? `[${trimmed}]` : trimmed;
  let url;
  try {
    url = new URL(`kichi://${authority}`);
  } catch (error) {
    throw new Error(`Invalid Kichi host "${host}"`, { cause: error });
  }
  if (!url.hostname || url.username || url.password || url.pathname || url.search || url.hash) {
    throw new Error(`Invalid Kichi host "${host}"`);
  }
  const hostname = url.hostname.toLowerCase();
  const unwrappedHostname = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  const port = url.port || void 0;
  if (port === "0") {
    throw new Error(`Invalid Kichi host port in "${host}"`);
  }
  return {
    hostname,
    ...port ? { port } : {},
    usesPlainWebSocket: isIP(unwrappedHostname) !== 0 || unwrappedHostname === "localhost"
  };
}
function formatAuthority(hostname, port) {
  return `${hostname}${port ? `:${port}` : ""}`;
}
function normalizeKichiHost(host) {
  const parsed = parseKichiHost(host);
  const defaultPort = parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : SECURE_HOST_DEFAULT_PORT;
  const normalizedPort = parsed.port === defaultPort ? void 0 : parsed.port;
  return formatAuthority(parsed.hostname, normalizedPort);
}
function buildKichiWebSocketUrl(host) {
  const parsed = parseKichiHost(host);
  const protocol = parsed.usesPlainWebSocket ? "ws" : "wss";
  const defaultPort = parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : SECURE_HOST_DEFAULT_PORT;
  const normalizedPort = parsed.port === defaultPort ? void 0 : parsed.port;
  const urlPort = normalizedPort ?? (parsed.usesPlainWebSocket ? PLAIN_HOST_DEFAULT_PORT : void 0);
  return `${protocol}://${formatAuthority(parsed.hostname, urlPort)}/ws/agent`;
}

// ../kichi-core/src/catalog.ts
var BUNDLED_STATIC_CONFIG_PATH = new URL("../config/kichi-config.json", import.meta.url);
var BUNDLED_ENVIRONMENTS_CONFIG_PATH = new URL("../config/environments.json", import.meta.url);
var cachedStaticConfig = null;
var cachedStaticConfigMtime = 0;
function isAlbumConfig(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const config = value;
  return typeof config.albumCount === "number" && typeof config.trackCount === "number" && Array.isArray(config.track) && config.track.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const track = item;
    return typeof track.album === "string" && typeof track.name === "string" && Array.isArray(track.tags) && track.tags.every((tag) => typeof tag === "string");
  });
}
function loadRuntimeAlbumConfig() {
  return loadStaticConfig().album;
}
function getMusicTitleLookup() {
  return new Map(
    loadRuntimeAlbumConfig().track.map((item) => [item.name.toLowerCase(), item.name])
  );
}
function getMusicTitleEnum() {
  return loadRuntimeAlbumConfig().track.map((item) => item.name);
}
function getMusicSelectionCatalog() {
  const albums = /* @__PURE__ */ new Map();
  for (const track of loadRuntimeAlbumConfig().track) {
    const titles = albums.get(track.album);
    if (titles) {
      titles.push(track.name);
    } else {
      albums.set(track.album, [track.name]);
    }
  }
  return Array.from(albums, ([albumTitle, musicTitles]) => ({ albumTitle, musicTitles }));
}
function isActionDefinition(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const action = value;
  return typeof action.name === "string" && action.name.trim().length > 0 && (action.playback === "loop" || action.playback === "once") && (action.resumeAction === void 0 || typeof action.resumeAction === "string" && action.resumeAction.trim().length > 0);
}
function isPoseActions(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const actions = value;
  return ["stand", "sit", "lay", "floor"].every((pose) => Array.isArray(actions[pose]) && actions[pose].every((item) => isActionDefinition(item)));
}
function normalizeActionDefinitions(actions) {
  const normalized = {};
  for (const pose of ["stand", "sit", "lay", "floor"]) {
    const entries = actions[pose];
    const seen = /* @__PURE__ */ new Set();
    normalized[pose] = entries.map((entry) => {
      const name = entry.name.trim();
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new Error(`config/kichi-config.json contains duplicate action "${name}" for pose "${pose}"`);
      }
      seen.add(key);
      const playback = entry.playback;
      const resumeAction = typeof entry.resumeAction === "string" ? entry.resumeAction.trim() : void 0;
      if (playback === "loop" && resumeAction) {
        throw new Error(`config/kichi-config.json action "${name}" for pose "${pose}" cannot set resumeAction when playback is loop`);
      }
      return {
        name,
        playback,
        ...resumeAction ? { resumeAction } : {}
      };
    });
    const available = new Set(normalized[pose].map((entry) => entry.name.toLowerCase()));
    for (const entry of normalized[pose]) {
      if (entry.playback === "once" && !entry.resumeAction) {
        throw new Error(`config/kichi-config.json action "${entry.name}" for pose "${pose}" must set resumeAction when playback is once`);
      }
      if (entry.resumeAction && !available.has(entry.resumeAction.toLowerCase())) {
        throw new Error(`config/kichi-config.json action "${entry.name}" for pose "${pose}" references unknown resumeAction "${entry.resumeAction}"`);
      }
    }
  }
  return normalized;
}
function normalizeStaticConfig(value) {
  const raw = value && typeof value === "object" ? value : {};
  const actions = raw.actions;
  const album = raw.album;
  if (!isPoseActions(actions)) {
    throw new Error("config/kichi-config.json must include valid actions");
  }
  if (!isAlbumConfig(album)) {
    throw new Error("config/kichi-config.json must include a valid album object");
  }
  return {
    album,
    actions: normalizeActionDefinitions(actions)
  };
}
function loadStaticConfig() {
  const configPath = fileURLToPath(BUNDLED_STATIC_CONFIG_PATH);
  const stat = fs.statSync(configPath);
  if (!cachedStaticConfig || stat.mtimeMs !== cachedStaticConfigMtime) {
    const raw = fs.readFileSync(configPath, "utf-8");
    cachedStaticConfig = normalizeStaticConfig(JSON.parse(raw));
    cachedStaticConfigMtime = stat.mtimeMs;
  }
  return cachedStaticConfig;
}
var VALID_ENVIRONMENTS = ["steam", "steam-playtest", "test"];
var cachedEnvironmentsConfig = null;
var cachedEnvironmentsConfigMtime = 0;
function getEnvironmentsConfigPath() {
  return fileURLToPath(BUNDLED_ENVIRONMENTS_CONFIG_PATH);
}
function loadEnvironmentsConfig() {
  const configPath = getEnvironmentsConfigPath();
  const stat = fs.statSync(configPath);
  if (cachedEnvironmentsConfig && stat.mtimeMs === cachedEnvironmentsConfigMtime) {
    return cachedEnvironmentsConfig;
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (!raw || typeof raw !== "object") {
    throw new Error("config/environments.json must be a valid object");
  }
  const config = raw;
  for (const env of VALID_ENVIRONMENTS) {
    if (!(env in config)) {
      throw new Error(`config/environments.json missing environment "${env}"`);
    }
    const value = config[env];
    if (value !== null && typeof value !== "string") {
      throw new Error(`config/environments.json environment "${env}" must be a string or null`);
    }
  }
  cachedEnvironmentsConfig = config;
  cachedEnvironmentsConfigMtime = stat.mtimeMs;
  return cachedEnvironmentsConfig;
}
function isKichiEnvironment(value) {
  return typeof value === "string" && VALID_ENVIRONMENTS.includes(value);
}
function resolveEnvironmentHost(environment) {
  const config = loadEnvironmentsConfig();
  const configuredHost = config[environment];
  if (typeof configuredHost === "string" && configuredHost.trim()) {
    const host = configuredHost.trim();
    try {
      normalizeKichiHost(host);
      return { host };
    } catch (error) {
      return { error: `environment "${environment}" has an invalid host: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { error: `environment "${environment}" has no configured host \u2014 update config/environments.json first` };
}
function resolveJoinEnvironmentHost(params) {
  if (!isKichiEnvironment(params.environment)) {
    return { error: `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}` };
  }
  if (params.environment === "test") {
    const testHost = typeof params.host === "string" ? params.host.trim() : "";
    if (!testHost) {
      return { error: "host is required for the test environment" };
    }
    try {
      normalizeKichiHost(testHost);
      return { environment: params.environment, host: testHost };
    } catch (error) {
      return { environment: params.environment, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const resolved = resolveEnvironmentHost(params.environment);
  if (resolved.error) {
    return { environment: params.environment, error: resolved.error };
  }
  return { environment: params.environment, host: resolved.host };
}
function normalizeMusicTitles(value) {
  if (!Array.isArray(value)) {
    return { titles: [], invalidTitles: [] };
  }
  const musicTitleLookup = getMusicTitleLookup();
  const titles = [];
  const invalidTitles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string") {
      invalidTitles.push(String(item));
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    const canonicalTitle = musicTitleLookup.get(key);
    if (!canonicalTitle) {
      invalidTitles.push(trimmed);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    titles.push(canonicalTitle);
  }
  return { titles, invalidTitles };
}
function getActionDefinition(poseType, action) {
  const poseActions = loadStaticConfig().actions[poseType];
  const matched = poseActions.find((entry) => entry.name.toLowerCase() === action.toLowerCase());
  if (!matched) {
    throw new Error(`Unknown action "${action}" for poseType "${poseType}"`);
  }
  return matched;
}
function getActionPlayback(action) {
  return action.playback === "once" ? {
    mode: "once",
    resumeAction: action.resumeAction
  } : {
    mode: "loop"
  };
}

// ../../node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// ../kichi-core/src/service.ts
import * as fs2 from "fs";
import * as path from "path";
import { randomUUID } from "node:crypto";

// ../kichi-core/src/types.ts
var KICHI_EMOJI_NAMES = [
  "Heart",
  "Like",
  "Happy",
  "Celebrate",
  "Keep Going",
  "Peeking",
  "Laughing",
  "Sleeping",
  "Coffee",
  "Waving"
];
var ENVIRONMENT_WEATHERS = ["Sunny", "Cloudy", "Rainy", "Snowy"];
var ENVIRONMENT_TIMES = ["Auto", "Morning", "Day", "Evening", "Night"];
var MUSIC_ACTIONS = ["Next", "Previous"];
var MUSIC_PLAY_TYPES = ["Loop", "Random"];

// ../kichi-core/src/validation.ts
var IDLE_PLAN_POMODORO_PHASES = ["focus", "shortBreak", "longBreak", "none"];
var AVATAR_STATUSES = ["Idle", "Busy", "Activities", "Break"];
function normalizeEmojiName(value) {
  if (typeof value !== "string") {
    throw new Error("emojiName must be a string");
  }
  const emojiName = value.trim();
  if (!KICHI_EMOJI_NAMES.includes(emojiName)) {
    throw new Error(`emojiName must be one of: ${KICHI_EMOJI_NAMES.join(", ")}`);
  }
  return emojiName;
}
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizeEnvironmentControl(value) {
  if (!isPlainObject(value)) {
    throw new Error("environment must be an object");
  }
  for (const key of Object.keys(value)) {
    if (!["weather", "time", "lightingValue", "lightingEnabled", "ambientLightIntensity", "ambientLightEnabled", "musicAlbumTitle", "musicTitle", "musicPaused", "musicAction", "musicPlayType"].includes(key)) {
      throw new Error(`Unsupported environment field: ${key}`);
    }
  }
  const { weather, time, lightingValue, lightingEnabled, ambientLightIntensity, ambientLightEnabled, musicAlbumTitle, musicTitle, musicPaused, musicAction, musicPlayType } = value;
  if (weather === void 0 && time === void 0 && lightingValue === void 0 && lightingEnabled === void 0 && ambientLightIntensity === void 0 && ambientLightEnabled === void 0 && musicAlbumTitle === void 0 && musicTitle === void 0 && musicPaused === void 0 && musicAction === void 0 && musicPlayType === void 0) {
    throw new Error("environment must contain weather, time, lightingValue, lightingEnabled, ambientLightIntensity, ambientLightEnabled, musicAlbumTitle, musicTitle, musicPaused, musicAction, or musicPlayType");
  }
  if (weather !== void 0 && (typeof weather !== "string" || !ENVIRONMENT_WEATHERS.includes(weather))) {
    throw new Error(`weather must be one of: ${ENVIRONMENT_WEATHERS.join(", ")}`);
  }
  if (time !== void 0 && (typeof time !== "string" || !ENVIRONMENT_TIMES.includes(time))) {
    throw new Error(`time must be one of: ${ENVIRONMENT_TIMES.join(", ")}`);
  }
  if (lightingValue !== void 0 && (typeof lightingValue !== "number" || !Number.isFinite(lightingValue) || lightingValue < 0.1 || lightingValue > 2)) {
    throw new Error("lightingValue must be a finite number from 0.1 to 2; use lightingEnabled to turn lights off");
  }
  if (lightingEnabled !== void 0 && typeof lightingEnabled !== "boolean") {
    throw new Error("lightingEnabled must be a boolean");
  }
  if (ambientLightIntensity !== void 0 && (typeof ambientLightIntensity !== "number" || !Number.isFinite(ambientLightIntensity) || ambientLightIntensity < 0.5 || ambientLightIntensity > 3)) {
    throw new Error("ambientLightIntensity must be a finite number from 0.5 to 3; use ambientLightEnabled to turn ambient light off");
  }
  if (ambientLightEnabled !== void 0 && typeof ambientLightEnabled !== "boolean") {
    throw new Error("ambientLightEnabled must be a boolean");
  }
  if (musicAlbumTitle !== void 0 && (typeof musicAlbumTitle !== "string" || !musicAlbumTitle.trim())) {
    throw new Error("musicAlbumTitle must be a non-empty string");
  }
  if (musicTitle !== void 0 && (typeof musicTitle !== "string" || !musicTitle.trim())) {
    throw new Error("musicTitle must be a non-empty string");
  }
  if ((musicAlbumTitle !== void 0 || musicTitle !== void 0) && (musicPaused !== void 0 || musicAction !== void 0)) {
    throw new Error("musicAlbumTitle and musicTitle cannot be combined with musicPaused or musicAction");
  }
  if (musicPaused !== void 0 && typeof musicPaused !== "boolean") {
    throw new Error("musicPaused must be a boolean");
  }
  if (musicAction !== void 0 && (typeof musicAction !== "string" || !MUSIC_ACTIONS.includes(musicAction))) {
    throw new Error(`musicAction must be one of: ${MUSIC_ACTIONS.join(", ")}`);
  }
  if (musicPlayType !== void 0 && (typeof musicPlayType !== "string" || !MUSIC_PLAY_TYPES.includes(musicPlayType))) {
    throw new Error(`musicPlayType must be one of: ${MUSIC_PLAY_TYPES.join(", ")}`);
  }
  return {
    ...weather !== void 0 ? { weather } : {},
    ...time !== void 0 ? { time } : {},
    ...lightingValue !== void 0 ? { lightingValue } : {},
    ...lightingEnabled !== void 0 ? { lightingEnabled } : {},
    ...ambientLightIntensity !== void 0 ? { ambientLightIntensity } : {},
    ...ambientLightEnabled !== void 0 ? { ambientLightEnabled } : {},
    ...musicAlbumTitle !== void 0 ? { musicAlbumTitle: musicAlbumTitle.trim() } : {},
    ...musicTitle !== void 0 ? { musicTitle: musicTitle.trim() } : {},
    ...musicPaused !== void 0 ? { musicPaused } : {},
    ...musicAction !== void 0 ? { musicAction } : {},
    ...musicPlayType !== void 0 ? { musicPlayType } : {}
  };
}
function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function normalizeJoinTags(value) {
  if (value === void 0) {
    return { tags: [] };
  }
  if (!Array.isArray(value)) {
    return { error: "tags must be an array of strings" };
  }
  const tags = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of value) {
    if (typeof item !== "string") {
      return { error: "tags must be an array of strings" };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(trimmed);
  }
  return { tags };
}
function isIdlePlanPomodoroPhase(value) {
  return IDLE_PLAN_POMODORO_PHASES.includes(String(value));
}
function normalizeAvatarStatus(value, fieldPath) {
  if (typeof value !== "string" || !AVATAR_STATUSES.includes(value)) {
    return { error: `${fieldPath} must be one of: ${AVATAR_STATUSES.join(", ")}` };
  }
  return { avatarStatus: value };
}
function normalizeIdlePlan(value) {
  if (!isPlainObject(value)) {
    return { error: "idle plan payload must be an object" };
  }
  const requestId = value.requestId;
  const heartbeatIntervalSeconds = value.heartbeatIntervalSeconds;
  const goal = value.goal;
  const stages = value.stages;
  if (requestId !== void 0 && typeof requestId !== "string") {
    return { error: "requestId must be a string when provided" };
  }
  if (!isPositiveInteger(heartbeatIntervalSeconds)) {
    return { error: "heartbeatIntervalSeconds must be a positive integer" };
  }
  if (typeof goal !== "string" || !goal.trim()) {
    return { error: "goal is required" };
  }
  if (!Array.isArray(stages) || stages.length === 0) {
    return { error: "stages must contain at least one stage" };
  }
  const normalizedStages = [];
  let totalDurationSeconds = 0;
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const rawStage = stages[stageIndex];
    if (!isPlainObject(rawStage)) {
      return { error: `stages[${stageIndex}] must be an object` };
    }
    const name = rawStage.name;
    const purpose = rawStage.purpose;
    const pomodoroPhase = rawStage.pomodoroPhase;
    const avatarStatus = rawStage.avatarStatus;
    const durationSeconds = rawStage.durationSeconds;
    const actions = rawStage.actions;
    if (typeof name !== "string" || !name.trim()) {
      return { error: `stages[${stageIndex}].name is required` };
    }
    if (typeof purpose !== "string" || !purpose.trim()) {
      return { error: `stages[${stageIndex}].purpose is required` };
    }
    if (!isIdlePlanPomodoroPhase(pomodoroPhase)) {
      return {
        error: `stages[${stageIndex}].pomodoroPhase must be one of: ${IDLE_PLAN_POMODORO_PHASES.join(", ")}`
      };
    }
    const stageAvatarStatus = avatarStatus === void 0 ? pomodoroPhase === "focus" ? "Busy" : pomodoroPhase === "none" ? "Idle" : "Break" : avatarStatus;
    const normalizedAvatarStatus = normalizeAvatarStatus(stageAvatarStatus, `stages[${stageIndex}].avatarStatus`);
    if (normalizedAvatarStatus.error || normalizedAvatarStatus.avatarStatus === void 0) {
      return { error: normalizedAvatarStatus.error ?? `stages[${stageIndex}].avatarStatus is invalid` };
    }
    if (!isPositiveInteger(durationSeconds)) {
      return { error: `stages[${stageIndex}].durationSeconds must be a positive integer` };
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      return { error: `stages[${stageIndex}].actions must contain at least one action` };
    }
    const normalizedActions = [];
    let stageActionDurationSeconds = 0;
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const rawAction = actions[actionIndex];
      if (!isPlainObject(rawAction)) {
        return { error: `stages[${stageIndex}].actions[${actionIndex}] must be an object` };
      }
      const poseType = rawAction.poseType;
      const action = rawAction.action;
      const actionDurationSeconds = rawAction.durationSeconds;
      const bubble = rawAction.bubble;
      const log = rawAction.log;
      const propId = rawAction.propId;
      if (!["stand", "sit", "lay", "floor"].includes(String(poseType))) {
        return {
          error: `stages[${stageIndex}].actions[${actionIndex}].poseType must be stand, sit, lay, or floor`
        };
      }
      if (typeof action !== "string" || !action.trim()) {
        return { error: `stages[${stageIndex}].actions[${actionIndex}].action is required` };
      }
      if (!isPositiveInteger(actionDurationSeconds)) {
        return {
          error: `stages[${stageIndex}].actions[${actionIndex}].durationSeconds must be a positive integer`
        };
      }
      if (typeof bubble !== "string" || !bubble.trim()) {
        return { error: `stages[${stageIndex}].actions[${actionIndex}].bubble is required` };
      }
      if (typeof log !== "string" || !log.trim()) {
        return { error: `stages[${stageIndex}].actions[${actionIndex}].log is required` };
      }
      const normalizedPoseType = poseType;
      let actionDefinition;
      try {
        actionDefinition = getActionDefinition(normalizedPoseType, action.trim());
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : `Invalid action in stages[${stageIndex}].actions[${actionIndex}]`
        };
      }
      const playback = getActionPlayback(actionDefinition);
      if (playback.mode === "once" && actionDurationSeconds > 30) {
        return {
          error: `stages[${stageIndex}].actions[${actionIndex}] uses once action "${actionDefinition.name}" for ${actionDurationSeconds} seconds; once actions must stay at 30 seconds or less`
        };
      }
      stageActionDurationSeconds += actionDurationSeconds;
      normalizedActions.push({
        poseType: normalizedPoseType,
        action: actionDefinition.name,
        durationSeconds: actionDurationSeconds,
        bubble: bubble.trim(),
        log: log.trim(),
        ...typeof propId === "string" && propId.trim() ? { propId: propId.trim() } : {}
      });
    }
    if (stageActionDurationSeconds !== durationSeconds) {
      return {
        error: `stages[${stageIndex}] action durations must equal stage duration exactly (${stageActionDurationSeconds} !== ${durationSeconds})`
      };
    }
    totalDurationSeconds += durationSeconds;
    normalizedStages.push({
      name: name.trim(),
      purpose: purpose.trim(),
      pomodoroPhase,
      avatarStatus: normalizedAvatarStatus.avatarStatus,
      durationSeconds,
      actions: normalizedActions
    });
  }
  if (totalDurationSeconds !== heartbeatIntervalSeconds) {
    return {
      error: `idle plan total duration must equal heartbeatIntervalSeconds exactly (${totalDurationSeconds} !== ${heartbeatIntervalSeconds})`
    };
  }
  return {
    idlePlan: {
      ...typeof requestId === "string" && requestId.trim() ? { requestId: requestId.trim() } : {},
      heartbeatIntervalSeconds,
      goal: goal.trim(),
      totalDurationSeconds,
      stages: normalizedStages
    }
  };
}
function isPomodoroPhase(value) {
  return ["focus", "shortBreak", "longBreak"].includes(String(value));
}
function getPomodoroPhaseDuration(phase, kichiSeconds, shortBreakSeconds, longBreakSeconds) {
  if (phase === "shortBreak") {
    return shortBreakSeconds;
  }
  if (phase === "longBreak") {
    return longBreakSeconds;
  }
  return kichiSeconds;
}
function normalizeClockConfig(value) {
  if (!isPlainObject(value)) {
    return { error: "clock must be an object" };
  }
  const mode = value.mode;
  if (!["pomodoro", "countDown", "countUp"].includes(String(mode))) {
    return { error: "clock.mode must be pomodoro, countDown, or countUp" };
  }
  const running = typeof value.running === "boolean" ? value.running : true;
  if (mode === "pomodoro") {
    const kichiSeconds = value.kichiSeconds;
    const shortBreakSeconds = value.shortBreakSeconds;
    const longBreakSeconds = value.longBreakSeconds;
    const sessionCount = value.sessionCount;
    const currentSession = value.currentSession ?? 1;
    const phase = value.phase ?? "focus";
    if (!isPositiveInteger(kichiSeconds)) {
      return { error: "clock.kichiSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(shortBreakSeconds)) {
      return { error: "clock.shortBreakSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(longBreakSeconds)) {
      return { error: "clock.longBreakSeconds must be a positive integer" };
    }
    if (!isPositiveInteger(sessionCount)) {
      return { error: "clock.sessionCount must be a positive integer" };
    }
    if (!isPositiveInteger(currentSession)) {
      return { error: "clock.currentSession must be a positive integer" };
    }
    if (currentSession > sessionCount) {
      return { error: "clock.currentSession cannot be greater than clock.sessionCount" };
    }
    if (!isPomodoroPhase(phase)) {
      return { error: "clock.phase must be focus, shortBreak, or longBreak" };
    }
    const defaultRemainingSeconds = getPomodoroPhaseDuration(
      phase,
      kichiSeconds,
      shortBreakSeconds,
      longBreakSeconds
    );
    const remainingSeconds = value.remainingSeconds ?? defaultRemainingSeconds;
    if (!isNonNegativeInteger(remainingSeconds)) {
      return { error: "clock.remainingSeconds must be a non-negative integer" };
    }
    return {
      clock: {
        mode: "pomodoro",
        running,
        kichiSeconds,
        shortBreakSeconds,
        longBreakSeconds,
        sessionCount,
        currentSession,
        phase,
        remainingSeconds
      }
    };
  }
  if (mode === "countDown") {
    const durationSeconds = value.durationSeconds;
    if (!isPositiveInteger(durationSeconds)) {
      return { error: "clock.durationSeconds must be a positive integer" };
    }
    const remainingSeconds = value.remainingSeconds ?? durationSeconds;
    if (!isNonNegativeInteger(remainingSeconds)) {
      return { error: "clock.remainingSeconds must be a non-negative integer" };
    }
    return {
      clock: {
        mode: "countDown",
        running,
        durationSeconds,
        remainingSeconds
      }
    };
  }
  const elapsedSeconds = value.elapsedSeconds ?? 0;
  if (!isNonNegativeInteger(elapsedSeconds)) {
    return { error: "clock.elapsedSeconds must be a non-negative integer" };
  }
  return {
    clock: {
      mode: "countUp",
      running,
      elapsedSeconds
    }
  };
}

// ../kichi-core/src/service.ts
var MAX_NOTEBOARD_TEXT_LENGTH = 200;
var DEFAULT_LLM_RUNTIME_ENABLED = true;
var DEFAULT_GLANCE_DURATION_SECONDS = 1.8;
var SMS_STATE_FILE_NAME = "sms-state.json";
var BOT_MESSAGE_HISTORY_FILE_NAME = "bot-message-history.json";
var MAX_BOT_MESSAGE_HISTORY_ENTRIES = 30;
var KichiForwarderService = class {
  constructor(logger, options) {
    this.logger = logger;
    this.options = options;
  }
  logger;
  options;
  ws = null;
  stopped = false;
  reconnectTimeout = null;
  joinTimeout = null;
  identity = null;
  host = null;
  environment = null;
  joinResolve = null;
  pendingRequests = /* @__PURE__ */ new Map();
  onBotMessageReceived = null;
  cachedRoomContext = null;
  start() {
    const state = this.readStateFile();
    this.environment = state?.currentEnvironment ?? null;
    if (this.environment) {
      this.host = this.options.resolveEnvironmentHost(this.environment);
      if (!this.host && this.environment === "test" && state?.testHost) {
        this.host = state.testHost;
      }
    } else {
      this.host = null;
    }
    this.identity = this.host ? this.loadIdentity() : null;
    this.stopped = false;
    if (this.host) {
      this.connect("startup");
      return;
    }
    this.log("debug", "host is not configured yet; waiting for kichi_switch_host");
  }
  stop() {
    this.stopped = true;
    this.clearReconnectTimeout();
    this.rejectPendingRequests("Kichi websocket stopped");
    this.failPendingJoin("Kichi websocket stopped");
    this.closeSocket();
  }
  async switchHost(host, environment) {
    normalizeKichiHost(host);
    this.persistCurrentHost(host, environment);
    this.host = host;
    this.environment = environment ?? null;
    this.identity = this.loadIdentity();
    this.clearReconnectTimeout();
    this.rejectPendingRequests(`Kichi websocket switched to ${host}`);
    this.failPendingJoin(`Kichi websocket switched to ${host}`);
    this.closeSocket();
    if (!this.stopped) {
      this.connect("switch_host");
    }
    return this.getConnectionStatus();
  }
  async join(avatarId, botName, bio, tags, source) {
    if (!this.host) {
      return { success: false, error: "No Kichi host configured. Run kichi_switch_host first." };
    }
    if (this.ws?.readyState !== wrapper_default.OPEN && this.ws?.readyState !== wrapper_default.CONNECTING) {
      return {
        success: false,
        error: "Kichi websocket is not connected. Restart the gateway to reconnect before joining."
      };
    }
    return new Promise((resolve) => {
      this.failPendingJoin("Kichi join superseded by a new join request");
      this.identity = { avatarId };
      this.saveIdentity();
      this.joinResolve = resolve;
      const payload = { type: "join", avatarId, botName, bio, tags, source };
      const sendJoin = () => {
        if (this.joinResolve !== resolve) return;
        this.ws?.send(JSON.stringify(payload));
      };
      if (this.ws?.readyState === wrapper_default.OPEN) {
        sendJoin();
      } else {
        this.ws?.once("open", sendJoin);
      }
      this.joinTimeout = setTimeout(() => {
        if (this.joinResolve) {
          this.joinResolve = null;
          this.clearJoinTimeout();
          resolve({ success: false, error: "Timed out waiting for join_ack" });
        }
      }, 1e4);
    });
  }
  sendAction(status) {
    const actionDefinition = getActionDefinition(status.poseType, status.action);
    this.sendStatus(
      status.poseType,
      actionDefinition.name,
      status.bubble || status.action,
      typeof status.log === "string" ? status.log.trim() : "",
      getActionPlayback(actionDefinition),
      status.avatarStatus,
      status.propId
    );
  }
  sendStatus(poseType, action, bubble, log, playback, avatarStatus, propId) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) return;
    const payload = {
      type: "status",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      poseType,
      action,
      bubble,
      log,
      playback,
      avatarStatus,
      ...propId ? { propId } : {}
    };
    this.ws.send(JSON.stringify(payload));
  }
  async sendStatusVerified(poseType, action, bubble, log, playback, avatarStatus, propId) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const payload = {
      type: "status",
      requestId: randomUUID(),
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      poseType,
      action,
      bubble,
      log,
      playback,
      avatarStatus,
      ...propId ? { propId } : {}
    };
    return this.sendRequest(payload, "status_ack", 5e3);
  }
  sendHookNotify(hookType, bubble) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) return;
    const payload = {
      type: hookType,
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      bubble
    };
    this.ws.send(JSON.stringify(payload));
  }
  recordSmsLastMessageReceivedAt() {
    this.updateSmsState({ lastMessageReceivedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  sendIdlePlan(payload) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) return false;
    const outboundPayload = {
      type: "kichi_idle_plan",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      ...payload
    };
    this.ws.send(JSON.stringify(outboundPayload));
    return true;
  }
  syncMateDailySchedule(schedule) {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const payload = {
      type: "kichi_sync_mate_daily_schedule",
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      schedule
    };
    this.ws.send(JSON.stringify(payload));
  }
  sendClock(action, clock, requestId) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) return false;
    if (action === "set" && !clock) return false;
    const basePayload = {
      type: "clock",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      ...requestId ? { requestId } : {}
    };
    const payload = action === "set" ? {
      ...basePayload,
      action,
      clock
    } : {
      ...basePayload,
      action
    };
    this.ws.send(JSON.stringify(payload));
    return true;
  }
  async sendGlance(target, durationSeconds = DEFAULT_GLANCE_DURATION_SECONDS, requestId) {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    if (target !== "camera") {
      throw new Error("target must be camera");
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("duration must be a positive finite number");
    }
    const payload = {
      type: "kichi_glance",
      requestId: requestId?.trim() || randomUUID(),
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      target,
      duration: durationSeconds
    };
    return this.sendRequest(payload, "kichi_glance_ack", 5e3);
  }
  async sendEnvironmentControl(control, requestId) {
    const environment = normalizeEnvironmentControl(control);
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    const payload = {
      type: "kichi_environment",
      requestId: requestId?.trim() || randomUUID(),
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      environment
    };
    const ack = await this.sendRequest(payload, "kichi_environment_ack", 5e3);
    if (ack.success !== true) {
      throw new Error(`${ack.errorCode}: ${ack.errorMessage}`);
    }
    return ack;
  }
  async sendEmoji(emojiName, requestId) {
    const normalizedEmojiName = normalizeEmojiName(emojiName);
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const payload = {
      type: "kichi_emoji",
      requestId: requestId?.trim() || randomUUID(),
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      emojiName: normalizedEmojiName
    };
    const ack = await this.sendRequest(payload, "kichi_emoji_ack", 5e3);
    if (ack.success !== true) {
      throw new Error(`${ack.errorCode}: ${ack.errorMessage}`);
    }
    return ack;
  }
  async queryStatus(requestId) {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    const payload = {
      type: "query_status",
      requestId: requestId?.trim() || randomUUID(),
      avatarId: identity.avatarId,
      authKey: identity.authKey
    };
    const result = await this.sendRequest(payload, "query_status_result");
    if (result.currentUserActivity != null) {
      this.updateSmsLastActiveAt();
    }
    if (result.RoomContext && typeof result.RoomContext === "object") {
      this.cachedRoomContext = result.RoomContext;
    }
    return result;
  }
  createNotesBoardNote(propId, data) {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    if (data.trim().length > MAX_NOTEBOARD_TEXT_LENGTH) {
      throw new Error(`Note content must be ${MAX_NOTEBOARD_TEXT_LENGTH} characters or fewer`);
    }
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const payload = {
      type: "create_notes_board_note",
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      propId,
      data
    };
    this.ws.send(JSON.stringify(payload));
  }
  createMusicAlbum(albumTitle, musicTitles, requestId) {
    const identity = this.requireIdentity();
    if (!identity) {
      throw new Error("Missing Kichi identity");
    }
    if (!albumTitle.trim()) {
      throw new Error("albumTitle is required");
    }
    if (!Array.isArray(musicTitles) || musicTitles.length === 0) {
      throw new Error("musicTitles must contain at least one track title");
    }
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const normalizedRequestId = requestId?.trim() || randomUUID();
    const payload = {
      type: "create_music_album",
      requestId: normalizedRequestId,
      avatarId: identity.avatarId,
      authKey: identity.authKey,
      albumTitle: albumTitle.trim(),
      musicTitles
    };
    this.ws.send(JSON.stringify(payload));
    return normalizedRequestId;
  }
  async sendBotMessage(toAvatarId, depth, bubble, options) {
    if (!this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) {
      throw new Error("Kichi websocket is not connected");
    }
    const requestId = randomUUID();
    const payload = {
      type: "bot_message",
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey,
      toAvatarId,
      depth,
      bubble,
      requestId,
      ...options?.poseType ? { poseType: options.poseType } : {},
      ...options?.action ? { action: options.action } : {},
      ...options?.playback ? { playback: options.playback } : {},
      ...options?.log ? { log: options.log } : {},
      ...options?.history?.length ? { history: options.history } : {}
    };
    const ack = await this.sendRequest(payload, "bot_message_ack", 5e3);
    this.appendBotMessageTranscript({
      id: randomUUID(),
      requestId,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      direction: "sent",
      from: this.identity.avatarId,
      to: toAvatarId,
      depth,
      bubble
    });
    return ack;
  }
  isConnected() {
    return this.ws?.readyState === wrapper_default.OPEN && !!this.identity?.authKey;
  }
  getCachedRoomContext() {
    return this.cachedRoomContext;
  }
  hasValidIdentity() {
    return !!this.identity?.avatarId && !!this.identity?.authKey;
  }
  isLlmRuntimeEnabled() {
    return this.readStateFile()?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED;
  }
  getCurrentHost() {
    return this.host ?? "";
  }
  getAgentId() {
    return this.options.agentId;
  }
  getRuntimeDir() {
    return this.options.runtimeDir;
  }
  getStatePath() {
    return path.join(this.options.runtimeDir, "state.json");
  }
  getBotMessageHistoryPath() {
    return path.join(this.options.runtimeDir, BOT_MESSAGE_HISTORY_FILE_NAME);
  }
  readRecentBotMessageTranscript(limit = 10, avatarId) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer");
    }
    const normalizedAvatarId = typeof avatarId === "string" && avatarId.trim() ? avatarId.trim() : void 0;
    const entries = this.readBotMessageTranscriptStore().entries;
    const filtered = normalizedAvatarId ? entries.filter((entry) => entry.from === normalizedAvatarId || entry.to === normalizedAvatarId) : entries;
    return filtered.slice(-limit);
  }
  getIdentityPath() {
    if (!this.host) {
      return "";
    }
    return path.join(this.getIdentityDir(), "identity.json");
  }
  readSavedAvatarId() {
    if (!this.host) {
      return null;
    }
    return this.loadIdentity()?.avatarId ?? null;
  }
  requestRejoin() {
    if (!this.identity?.avatarId || !this.identity?.authKey) {
      return {
        accepted: false,
        mode: "unavailable",
        message: this.host ? "Missing authKey. Run kichi_join first." : "No Kichi host configured. Run kichi_switch_host first."
      };
    }
    if (this.ws?.readyState === wrapper_default.OPEN) {
      const sent = this.sendRejoinPayload();
      return {
        accepted: sent,
        mode: sent ? "sent" : "unavailable",
        message: sent ? "Rejoin payload sent." : "Unable to send rejoin payload."
      };
    }
    if (this.ws?.readyState === wrapper_default.CONNECTING) {
      return {
        accepted: true,
        mode: "waiting_open",
        message: "WebSocket is connecting. Rejoin will be sent automatically on open."
      };
    }
    if (this.stopped) {
      return {
        accepted: false,
        mode: "unavailable",
        message: "Service is not running."
      };
    }
    if (this.reconnectTimeout) {
      return {
        accepted: true,
        mode: "reconnecting",
        message: "WebSocket reconnect is already scheduled. Rejoin will be sent automatically on open."
      };
    }
    return {
      accepted: false,
      mode: "unavailable",
      message: "WebSocket is not connected. Restart the gateway or wait for the scheduled reconnect."
    };
  }
  getConnectionStatus() {
    const host = this.host ?? void 0;
    return {
      agentId: this.options.agentId,
      runtimeDir: this.getRuntimeDir(),
      statePath: this.getStatePath(),
      ...host ? {
        host,
        wsUrl: this.getWsUrl(),
        identityPath: this.getIdentityPath()
      } : {},
      ...this.environment ? { environment: this.environment } : {},
      hostConfigured: !!host,
      connected: this.isConnected(),
      websocketState: this.getWebsocketState(),
      hasIdentity: !!this.identity?.avatarId,
      avatarId: this.identity?.avatarId,
      hasAuthKey: !!this.identity?.authKey,
      pendingRequestCount: this.pendingRequests.size,
      reconnectScheduled: !!this.reconnectTimeout
    };
  }
  async leave() {
    if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) {
      return { success: false, error: "Failed or not connected" };
    }
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.ws?.off("message", handler);
        resolve(result);
      };
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "leave_ack") {
            const leaveAck = msg;
            if (leaveAck.success === false) {
              finish(this.buildAckFailure(leaveAck, "Leave failed"));
              return;
            }
            this.clearAuthKey();
            finish({ success: true });
          }
        } catch {
          this.log("warn", `failed to parse leave response (chars=${data.toString().length})`);
        }
      };
      this.ws.on("message", handler);
      this.ws.send(
        JSON.stringify({ type: "leave", avatarId: this.identity.avatarId, authKey: this.identity.authKey })
      );
      timer = setTimeout(() => {
        finish({ success: false, error: "Timed out waiting for leave_ack" });
      }, 1e4);
    });
  }
  connect(reason) {
    if (this.stopped || !this.host) return;
    if (this.ws?.readyState === wrapper_default.CONNECTING || this.ws?.readyState === wrapper_default.OPEN) {
      this.log("debug", `skipped websocket connect (${reason}) because socket is already ${this.getWebsocketState()}`);
      return;
    }
    this.clearReconnectTimeout();
    const wsUrl = this.getWsUrl();
    const ws = new wrapper_default(wsUrl);
    this.ws = ws;
    this.log("debug", `opening websocket (${reason}) to ${wsUrl}`);
    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.log("info", `connected to ${wsUrl} (${this.host})`);
      this.sendRejoinPayload();
    });
    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      this.handleMessage(data.toString());
    });
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.rejectPendingRequests("Kichi websocket closed");
      this.failPendingJoin("Kichi websocket closed");
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });
    ws.on("error", (error) => {
      if (this.ws !== ws) return;
      this.log("warn", `websocket error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  handleMessage(data) {
    try {
      const msg = JSON.parse(data);
      const messageType = typeof msg?.type === "string" && /^[a-z0-9_]+$/i.test(msg.type) ? msg.type : "unknown";
      this.log("debug", `ws recv type=${messageType} chars=${data.length}`);
      this.tryResolvePendingRequest(msg);
      if (msg.type === "join_ack") {
        const joinAck = msg;
        if (joinAck.success === false || !joinAck.authKey) {
          const failure = this.buildAckFailure(joinAck, "Join failed");
          this.log("warn", `join failed: ${failure.error}`);
          this.joinResolve?.(failure);
          this.joinResolve = null;
          this.clearJoinTimeout();
          return;
        }
        if (this.identity) {
          this.identity.authKey = joinAck.authKey;
          this.saveIdentity();
          this.updateSmsLastActiveAt();
          this.log("info", `joined as ${this.identity.avatarId}`);
        }
        this.joinResolve?.({ success: true });
        this.joinResolve = null;
        this.clearJoinTimeout();
      } else if (msg.type === "rejoin_failed" || msg.type === "auth_error") {
        this.log("warn", `auth failed: ${msg.reason || "unknown"}`);
        this.clearAuthKey();
      } else if (msg.type === "leave_ack") {
        const leaveAck = msg;
        if (leaveAck.success === false) {
          const failure = this.buildAckFailure(leaveAck, "Leave failed");
          this.log("warn", `leave failed: ${failure.error}`);
        } else {
          this.log("info", "left Kichi world");
        }
      } else if (msg.type === "bot_message_received") {
        const payload = msg;
        this.log("info", `bot_message_received depth=${payload.depth}`);
        this.appendBotMessageTranscript({
          id: randomUUID(),
          at: (/* @__PURE__ */ new Date()).toISOString(),
          direction: "received",
          from: payload.from,
          fromName: payload.fromName,
          to: this.identity?.avatarId,
          depth: payload.depth,
          bubble: payload.bubble
        });
        this.onBotMessageReceived?.(this, payload);
      }
    } catch {
      this.log("warn", `failed to handle websocket message (chars=${data.length})`);
    }
  }
  buildAckFailure(msg, fallbackError) {
    const errorCode = typeof msg.errorCode === "string" && msg.errorCode.trim().length > 0 ? msg.errorCode : void 0;
    const errorMessage = typeof msg.errorMessage === "string" && msg.errorMessage.trim().length > 0 ? msg.errorMessage : void 0;
    return {
      success: false,
      error: errorMessage ?? (errorCode ? `${fallbackError} (${errorCode})` : fallbackError),
      errorCode,
      errorMessage
    };
  }
  tryResolvePendingRequest(msg) {
    const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
    if (!requestId) {
      return;
    }
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    if (msg.type !== pending.expectedType) {
      pending.reject(
        new Error(
          `Unexpected response type for request ${requestId}: ${String(msg.type)} (expected ${pending.expectedType})`
        )
      );
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.resolve(msg);
  }
  rejectPendingRequests(reason) {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${reason} (${requestId})`));
    }
    this.pendingRequests.clear();
  }
  requireIdentity() {
    if (!this.identity?.avatarId || !this.identity?.authKey) {
      return null;
    }
    return {
      avatarId: this.identity.avatarId,
      authKey: this.identity.authKey
    };
  }
  sendRequest(payload, expectedType, timeoutMs = 1e4) {
    if (this.ws?.readyState !== wrapper_default.OPEN) {
      return Promise.reject(new Error("Kichi websocket is not connected"));
    }
    const requestId = payload.requestId?.trim() || randomUUID();
    const outboundPayload = { ...payload, requestId };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timed out waiting for ${expectedType}`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, {
        expectedType,
        timeout,
        resolve: (value) => resolve(value),
        reject
      });
      try {
        this.ws?.send(JSON.stringify(outboundPayload));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  loadIdentity() {
    if (!this.host) {
      return null;
    }
    try {
      const identityPath = this.getIdentityPath();
      if (!fs2.existsSync(identityPath)) return null;
      const data = JSON.parse(fs2.readFileSync(identityPath, "utf-8"));
      const avatarId = typeof data.avatarId === "string" && data.avatarId ? data.avatarId : null;
      if (avatarId) {
        return {
          avatarId,
          authKey: typeof data.authKey === "string" ? data.authKey : void 0
        };
      }
      return null;
    } catch (e) {
      this.log("warn", `failed to load identity: ${e}`);
      return null;
    }
  }
  saveIdentity() {
    if (!this.identity?.avatarId || !this.host) return;
    try {
      const identityDir = this.getIdentityDir();
      const identityPath = this.getIdentityPath();
      if (!fs2.existsSync(identityDir)) fs2.mkdirSync(identityDir, { recursive: true, mode: 448 });
      fs2.writeFileSync(identityPath, JSON.stringify(this.identity, null, 2), { mode: 384 });
    } catch (e) {
      this.log("error", `failed to save identity: ${e}`);
    }
  }
  clearAuthKey() {
    if (!this.identity) return;
    this.identity.authKey = void 0;
    this.saveIdentity();
    this.log("info", "authKey cleared");
  }
  sendRejoinPayload() {
    if (!this.identity?.avatarId || !this.identity?.authKey || this.ws?.readyState !== wrapper_default.OPEN) {
      return false;
    }
    this.ws.send(
      JSON.stringify({ type: "rejoin", avatarId: this.identity.avatarId, authKey: this.identity.authKey })
    );
    this.log("debug", `sent rejoin for ${this.identity.avatarId}`);
    return true;
  }
  getWebsocketState() {
    if (!this.ws) {
      return "idle";
    }
    if (this.ws.readyState === wrapper_default.CONNECTING) {
      return "connecting";
    }
    if (this.ws.readyState === wrapper_default.OPEN) {
      return "open";
    }
    if (this.ws.readyState === wrapper_default.CLOSING) {
      return "closing";
    }
    return "closed";
  }
  getIdentityDir() {
    if (!this.host) {
      throw new Error("No Kichi host configured");
    }
    return path.join(this.options.runtimeDir, "hosts", encodeURIComponent(this.host));
  }
  getSmsStatePath() {
    return path.join(this.options.runtimeDir, SMS_STATE_FILE_NAME);
  }
  getWsUrl() {
    if (!this.host) {
      throw new Error("No Kichi host configured");
    }
    return buildKichiWebSocketUrl(this.host);
  }
  persistCurrentHost(host, environment) {
    const previousState = this.readStateFile();
    const testHost = environment === "test" ? host : previousState?.testHost ?? void 0;
    const nextState = {
      ...environment ? { currentEnvironment: environment } : {},
      llmRuntimeEnabled: previousState?.llmRuntimeEnabled ?? DEFAULT_LLM_RUNTIME_ENABLED,
      ...testHost ? { testHost } : {}
    };
    fs2.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 448 });
    fs2.writeFileSync(this.getStatePath(), JSON.stringify(nextState, null, 2), { mode: 384 });
  }
  updateSmsLastActiveAt() {
    this.updateSmsState({ lastActiveAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  updateSmsState(patch) {
    try {
      const now = /* @__PURE__ */ new Date();
      const previousState = this.readSmsStateFile();
      const nextState = {
        date: now.toISOString().slice(0, 10),
        totalSent: 0,
        windows: { morning: 0, afternoon: 0, evening: 0 },
        lastTypes: [],
        ...previousState,
        ...patch
      };
      fs2.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 448 });
      fs2.writeFileSync(this.getSmsStatePath(), JSON.stringify(nextState, null, 2), { mode: 384 });
    } catch (e) {
      this.log("error", `failed to update sms state: ${e}`);
    }
  }
  appendBotMessageTranscript(entry) {
    const previousStore = this.readBotMessageTranscriptStore();
    const nextStore = {
      version: 1,
      entries: [...previousStore.entries, entry].slice(-MAX_BOT_MESSAGE_HISTORY_ENTRIES)
    };
    fs2.mkdirSync(this.options.runtimeDir, { recursive: true, mode: 448 });
    fs2.writeFileSync(this.getBotMessageHistoryPath(), JSON.stringify(nextStore, null, 2), { mode: 384 });
  }
  // Corrupt persistent files must never break hooks or message handling:
  // log, move the bad file aside for later inspection, and treat it as missing
  // so the next write rebuilds it.
  quarantineCorruptFile(filePath, reason) {
    this.log("warn", `${reason}; treating ${filePath} as missing`);
    try {
      fs2.renameSync(filePath, `${filePath}.corrupt`);
    } catch {
    }
  }
  readJsonFileOrQuarantine(filePath) {
    if (!fs2.existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
    } catch (e) {
      this.quarantineCorruptFile(filePath, `failed to read or parse ${filePath}: ${e}`);
      return null;
    }
  }
  readStateFile() {
    const statePath = this.getStatePath();
    const data = this.readJsonFileOrQuarantine(statePath);
    if (data === null) {
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      this.quarantineCorruptFile(statePath, `invalid state payload in ${statePath}`);
      return null;
    }
    return data;
  }
  readSmsStateFile() {
    const smsStatePath = this.getSmsStatePath();
    const data = this.readJsonFileOrQuarantine(smsStatePath);
    if (data === null) {
      return null;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      this.quarantineCorruptFile(smsStatePath, `invalid SMS state payload in ${smsStatePath}`);
      return null;
    }
    return data;
  }
  readBotMessageTranscriptStore() {
    const historyPath = this.getBotMessageHistoryPath();
    const emptyStore = { version: 1, entries: [] };
    const data = this.readJsonFileOrQuarantine(historyPath);
    if (data === null) {
      return emptyStore;
    }
    const store = data;
    if (!data || typeof data !== "object" || Array.isArray(data) || store.version !== 1 || !Array.isArray(store.entries) || !store.entries.every((entry) => this.isValidBotMessageTranscriptEntry(entry))) {
      this.quarantineCorruptFile(historyPath, `invalid bot message history payload in ${historyPath}`);
      return emptyStore;
    }
    return {
      version: 1,
      entries: store.entries
    };
  }
  isValidBotMessageTranscriptEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const entry = value;
    return typeof entry.id === "string" && (entry.requestId === void 0 || typeof entry.requestId === "string") && typeof entry.at === "string" && (entry.direction === "sent" || entry.direction === "received") && typeof entry.from === "string" && (entry.fromName === void 0 || typeof entry.fromName === "string") && (entry.to === void 0 || typeof entry.to === "string") && (entry.toName === void 0 || typeof entry.toName === "string") && typeof entry.depth === "number" && Number.isInteger(entry.depth) && entry.depth >= 0 && typeof entry.bubble === "string";
  }
  clearReconnectTimeout() {
    if (!this.reconnectTimeout) return;
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }
  clearJoinTimeout() {
    if (!this.joinTimeout) return;
    clearTimeout(this.joinTimeout);
    this.joinTimeout = null;
  }
  scheduleReconnect() {
    if (this.reconnectTimeout || this.stopped) {
      return;
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect("reconnect");
    }, 2e3);
  }
  closeSocket() {
    const socket = this.ws;
    this.ws = null;
    socket?.removeAllListeners();
    socket?.close();
  }
  failPendingJoin(reason) {
    if (!this.joinResolve) return;
    this.joinResolve({ success: false, error: reason });
    this.joinResolve = null;
    this.clearJoinTimeout();
  }
  logPrefix() {
    return `[kichi:${this.options.agentId}]`;
  }
  log(level, message) {
    const formatted = `${this.logPrefix()} ${message}`;
    switch (level) {
      case "debug":
        this.logger.debug(formatted);
        return;
      case "info":
        this.logger.info(formatted);
        return;
      case "warn":
        this.logger.warn(formatted);
        return;
      case "error":
        this.logger.error(formatted);
        return;
    }
  }
};

// src/tools.ts
var OPERATIONS = [
  "switch_host",
  "rejoin",
  "leave",
  "connection_status",
  "action",
  "glance",
  "emoji",
  "idle_plan",
  "clock",
  "environment",
  "query_status",
  "music_album_create",
  "noteboard_create",
  "bot_message_history",
  "bot_message"
];
var text = { type: "string", minLength: 1 };
var positiveInteger = { type: "integer", minimum: 1 };
var nonNegativeInteger = { type: "integer", minimum: 0 };
var flag = { type: "boolean" };
var poses = ["stand", "sit", "lay", "floor"];
var choice = (values) => ({ type: "string", enum: values });
var object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
var clockSchema = object({
  mode: choice(["pomodoro", "countDown", "countUp"]),
  running: flag,
  kichiSeconds: positiveInteger,
  shortBreakSeconds: positiveInteger,
  longBreakSeconds: positiveInteger,
  sessionCount: positiveInteger,
  currentSession: positiveInteger,
  phase: choice(["focus", "shortBreak", "longBreak"]),
  durationSeconds: positiveInteger,
  remainingSeconds: nonNegativeInteger,
  elapsedSeconds: nonNegativeInteger
}, ["mode"]);
var KICHI_JOIN_PARAMETERS = object({
  environment: choice(VALID_ENVIRONMENTS),
  host: text,
  avatarId: text,
  botName: text,
  bio: text,
  tags: { type: "array", items: text }
}, ["environment", "avatarId"]);
var schemas = {
  join: KICHI_JOIN_PARAMETERS,
  switch_host: object({ environment: choice(VALID_ENVIRONMENTS), host: text }, ["environment"]),
  rejoin: object({}),
  leave: object({}),
  connection_status: object({}),
  action: object({
    poseType: choice(poses),
    action: text,
    avatarStatus: choice(AVATAR_STATUSES),
    bubble: text,
    log: text,
    propId: text,
    verify: flag
  }, ["poseType", "action", "avatarStatus"]),
  glance: object({ target: choice(["camera"]), duration: { type: "number", exclusiveMinimum: 0 }, requestId: text }),
  emoji: object({ emojiName: choice(KICHI_EMOJI_NAMES), requestId: text }, ["emojiName"]),
  idle_plan: object({
    requestId: text,
    heartbeatIntervalSeconds: positiveInteger,
    goal: text,
    stages: {
      type: "array",
      minItems: 1,
      items: object({
        name: text,
        purpose: text,
        pomodoroPhase: choice(IDLE_PLAN_POMODORO_PHASES),
        avatarStatus: choice(AVATAR_STATUSES),
        durationSeconds: positiveInteger,
        actions: {
          type: "array",
          minItems: 1,
          items: object({
            poseType: choice(poses),
            action: text,
            durationSeconds: positiveInteger,
            bubble: text,
            log: text,
            propId: text
          }, ["poseType", "action", "durationSeconds", "bubble", "log"])
        }
      }, ["name", "purpose", "pomodoroPhase", "durationSeconds", "actions"])
    }
  }, ["heartbeatIntervalSeconds", "goal", "stages"]),
  clock: object({ action: choice(["set", "stop"]), clock: clockSchema, requestId: text }, ["action"]),
  environment: object({
    weather: choice(ENVIRONMENT_WEATHERS),
    time: choice(ENVIRONMENT_TIMES),
    lightingValue: { type: "number", minimum: 0.1, maximum: 2 },
    lightingEnabled: flag,
    musicPaused: flag,
    ambientLightIntensity: { type: "number", minimum: 0.5, maximum: 3 },
    ambientLightEnabled: flag,
    musicAlbumTitle: text,
    musicTitle: text,
    musicAction: choice(MUSIC_ACTIONS),
    musicPlayType: choice(MUSIC_PLAY_TYPES),
    requestId: text
  }),
  query_status: object({ requestId: text }),
  music_album_create: object({
    albumTitle: text,
    musicTitles: { type: "array", items: text, minItems: 1 },
    requestId: text
  }, ["albumTitle", "musicTitles"]),
  noteboard_create: object({ propId: text, data: { type: "string", minLength: 1, maxLength: 200 } }, ["propId", "data"]),
  bot_message_history: object({ avatarId: text, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  bot_message: object({
    toAvatarId: text,
    depth: nonNegativeInteger,
    bubble: text,
    poseType: choice(poses),
    action: text,
    log: text
  }, ["toAvatarId", "depth", "bubble"])
};
var usage = {
  switch_host: "Change environment and reconnect; host is required only for test.",
  rejoin: "Request rejoin with the saved identity; acceptance is not a server acknowledgement.",
  leave: "Leave and wait for acknowledgement.",
  connection_status: "Local connection and identity readiness. Use query_status for room state.",
  action: "Use actions[poseType]. verify defaults true; bubble/log should be short. Room props come from query_status.",
  glance: "Brief camera glance. Defaults: target=camera, duration=1.8 seconds.",
  emoji: "Show one supported emoji above the avatar's head. Use only for a direct expressive request; the server acknowledgement confirms forwarding, not client rendering.",
  idle_plan: "Action durations must total each stage; stages must total heartbeatIntervalSeconds. Once actions: at most 30 seconds each. Stage avatarStatus is optional: focus defaults to Busy, shortBreak/longBreak to Break, and none to Idle.",
  clock: "Visual timer only. set requires clock; stop forbids it. Pomodoro requires kichiSeconds,shortBreakSeconds,longBreakSeconds,sessionCount; countDown requires durationSeconds. running=true,currentSession=1,phase=focus,elapsedSeconds=0 by default; remainingSeconds defaults to the phase duration.",
  environment: "Set room weather, time, House lighting, scene ambient light, or music playback; at least one setting is required. Auto restores automatic time. lightingValue sets House lighting intensity from 0.1 to 2; lightingEnabled switches all House lights on or off. ambientLightIntensity sets scene ambient light intensity from 0.5 to 3; ambientLightEnabled switches ambient light on or off. musicAlbumTitle and/or musicTitle select music by exact name; names are trimmed and must not be empty. Selection cannot be combined with musicPaused (including false) or musicAction, but can be combined with musicPlayType. musicPaused=true pauses current music; false resumes it. musicAction selects the Next or Previous track. musicPlayType selects Loop (sequential) or Random playback. The server checks room permissions. A successful acknowledgement means the server forwarded the control.",
  query_status: "Room, avatars, props, notes, timer and quotas. Query before notes or music.",
  music_album_create: "Use exact track titles from this schema. Query status for today's availability first.",
  noteboard_create: "Query status for board propId and quota first. Do not repeat recent notes.",
  bot_message_history: "Recent bot conversations only; limit defaults to 10, maximum 30.",
  bot_message: "Resolve the recipient with query_status; * broadcasts. Increment received depth. Optional poseType/action must be supplied together; use describe(action) for names."
};
function listKichiOperations() {
  return OPERATIONS;
}
function operationName(name) {
  if (!OPERATIONS.includes(name)) {
    throw new Error(`Unknown Kichi operation: ${name}`);
  }
  return name;
}
function describeKichiOperation(name) {
  const operation = operationName(name);
  let parameters = schemas[operation];
  if (operation === "music_album_create") {
    parameters = { ...parameters, properties: {
      ...parameters.properties,
      musicTitles: { type: "array", items: choice(getMusicTitleEnum()), minItems: 1 }
    } };
  }
  const result = { parameters, usage: usage[operation] };
  if (operation === "environment") {
    result.usage += ` Known built-in album and track names: ${JSON.stringify(getMusicSelectionCatalog())}. Other available albums and tracks, including custom albums, can also be selected by exact name.`;
  }
  if (operation === "action") {
    const actions = loadStaticConfig().actions;
    result.actions = Object.fromEntries(poses.map((pose) => [pose, actions[pose].map((entry) => entry.name)]));
  } else if (operation === "idle_plan") {
    result.actions = loadStaticConfig().actions;
  }
  return result;
}
function validate(schema, value, field) {
  switch (schema.type) {
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
      const record = value;
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown parameter: ${field}.${key}`);
        validate(schema.properties[key], record[key], `${field}.${key}`);
      }
      for (const key of schema.required) {
        if (!Object.hasOwn(record, key)) throw new Error(`${field}.${key} is required`);
      }
      return;
    }
    case "array":
      if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
      if (schema.minItems !== void 0 && value.length < schema.minItems) throw new Error(`${field} requires at least ${schema.minItems} item(s)`);
      value.forEach((item, index) => validate(schema.items, item, `${field}[${index}]`));
      return;
    case "string":
      if (typeof value !== "string") throw new Error(`${field} must be a string`);
      if (schema.minLength !== void 0 && value.trim().length < schema.minLength) throw new Error(`${field} must not be blank`);
      if (schema.maxLength !== void 0 && value.trim().length > schema.maxLength) throw new Error(`${field} must be at most ${schema.maxLength} characters`);
      if (schema.enum && !schema.enum.includes(value)) throw new Error(`${field} must be one of: ${schema.enum.join(", ")}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
      return;
    case "integer":
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value) || schema.type === "integer" && !Number.isInteger(value)) throw new Error(`${field} must be a finite ${schema.type}`);
      if (schema.minimum !== void 0 && value < schema.minimum) throw new Error(`${field} must be >= ${schema.minimum}`);
      if (schema.maximum !== void 0 && value > schema.maximum) throw new Error(`${field} must be <= ${schema.maximum}`);
      if (schema.exclusiveMinimum !== void 0 && value <= schema.exclusiveMinimum) throw new Error(`${field} must be > ${schema.exclusiveMinimum}`);
  }
}
function requireSuccess(operation, result) {
  if (result.success !== false && !result.errorCode) return;
  const detail = [result.errorCode, result.errorMessage, result.error, result.message].filter((value) => typeof value === "string" && value.length > 0).join(": ");
  throw new Error(`Kichi ${operation} failed${detail ? `: ${detail}` : ""}`);
}
function connectionStatus(service) {
  const status = service.getConnectionStatus();
  return {
    connected: status.connected,
    environment: status.environment,
    host: status.host,
    avatarId: status.avatarId,
    websocketState: status.websocketState,
    hasIdentity: status.hasIdentity,
    hasAuthKey: status.hasAuthKey,
    pendingRequestCount: status.pendingRequestCount,
    reconnectScheduled: status.reconnectScheduled
  };
}
function targetEnvironment(parameters) {
  if (parameters.environment !== "test" && parameters.host !== void 0) throw new Error("host is only accepted for the test environment");
  const target = resolveJoinEnvironmentHost(parameters);
  if (target.error) throw new Error(target.error);
  if (!target.host || !target.environment) throw new Error("Kichi environment did not resolve to a host");
  return { host: target.host, environment: target.environment };
}
async function executeKichiOperation(service, name, args) {
  const operation = name === "join" ? "join" : operationName(name);
  validate(schemas[operation], args, "parameters");
  const p = args;
  const string = (key) => p[key].trim();
  const optionalString = (key) => p[key] === void 0 ? void 0 : string(key);
  switch (operation) {
    case "join": {
      const target = targetEnvironment(p);
      const avatarId = string("avatarId");
      const tags = normalizeJoinTags(p.tags);
      if (tags.error) throw new Error(tags.error);
      const current = service.getConnectionStatus();
      const sameHost = current.host !== void 0 && normalizeKichiHost(current.host) === normalizeKichiHost(target.host);
      if (current.connected && (!sameHost || current.avatarId !== avatarId)) {
        requireSuccess("leave before join", await service.leave());
      }
      if (!sameHost || current.environment !== target.environment) await service.switchHost(target.host, target.environment);
      const joined = await service.join(avatarId, optionalString("botName") ?? "Codex", optionalString("bio") ?? "A coding companion.", tags.tags, "codex");
      requireSuccess(operation, joined);
      return { confirmed: true, avatarId, environment: target.environment };
    }
    case "switch_host": {
      const target = targetEnvironment(p);
      await service.switchHost(target.host, target.environment);
      return connectionStatus(service);
    }
    case "rejoin": {
      const result = service.requestRejoin();
      if (!result.accepted) throw new Error(result.message);
      return { accepted: true, confirmed: false, mode: result.mode };
    }
    case "leave":
      requireSuccess(operation, await service.leave());
      return { confirmed: true };
    case "connection_status":
      return connectionStatus(service);
    case "bot_message_history":
      return { entries: service.readRecentBotMessageTranscript(p.limit === void 0 ? 10 : p.limit, optionalString("avatarId")) };
  }
  if (!service.isConnected() || !service.hasValidIdentity()) throw new Error("Not connected to Kichi; join first");
  switch (operation) {
    case "action": {
      const poseType = p.poseType;
      const action = getActionDefinition(poseType, string("action"));
      const bubble = optionalString("bubble") ?? action.name;
      const log = optionalString("log") ?? "";
      const avatarStatus = p.avatarStatus;
      const propId = optionalString("propId");
      if (p.verify !== false) {
        const ack = await service.sendStatusVerified(poseType, action.name, bubble, log, getActionPlayback(action), avatarStatus, propId);
        return { confirmed: true, poseType: ack.poseType, action: ack.action, ...ack.warning ? { warning: ack.warning } : {} };
      }
      service.sendAction({ poseType, action: action.name, bubble, log, avatarStatus, ...propId ? { propId } : {} });
      return { sent: true, confirmed: false };
    }
    case "glance": {
      const ack = await service.sendGlance("camera", p.duration === void 0 ? 1.8 : p.duration, optionalString("requestId"));
      return { confirmed: true, target: ack.target };
    }
    case "emoji": {
      const ack = await service.sendEmoji(string("emojiName"), optionalString("requestId"));
      return {
        sent: true,
        confirmed: false,
        requestId: ack.requestId,
        emojiName: ack.emojiName,
        message: "Server accepted and broadcast the emoji; client rendering is not confirmed."
      };
    }
    case "idle_plan": {
      const result = normalizeIdlePlan(p);
      if (!result.idlePlan) throw new Error(result.error);
      const { totalDurationSeconds: _total, ...plan } = result.idlePlan;
      if (!service.sendIdlePlan(plan)) throw new Error("Kichi idle plan was not sent");
      return { sent: true, confirmed: false };
    }
    case "clock": {
      if (p.action === "stop") {
        if (p.clock !== void 0) throw new Error("clock is only accepted when action is set");
        if (!service.sendClock("stop", void 0, optionalString("requestId"))) throw new Error("Kichi clock command was not sent");
      } else {
        if (p.clock === void 0) throw new Error("clock is required when action is set");
        const clock = p.clock;
        const fields = {
          pomodoro: ["mode", "running", "kichiSeconds", "shortBreakSeconds", "longBreakSeconds", "sessionCount", "currentSession", "phase", "remainingSeconds"],
          countDown: ["mode", "running", "durationSeconds", "remainingSeconds"],
          countUp: ["mode", "running", "elapsedSeconds"]
        };
        for (const key of Object.keys(clock)) {
          if (!fields[clock.mode].includes(key)) throw new Error(`clock.${key} is not valid for ${clock.mode}`);
        }
        const result = normalizeClockConfig(clock);
        if (!result.clock) throw new Error(result.error);
        if (!service.sendClock("set", result.clock, optionalString("requestId"))) throw new Error("Kichi clock command was not sent");
      }
      return { sent: true, confirmed: false };
    }
    case "environment": {
      const ack = await service.sendEnvironmentControl({
        ...p.weather === void 0 ? {} : { weather: p.weather },
        ...p.time === void 0 ? {} : { time: p.time },
        ...p.lightingValue === void 0 ? {} : { lightingValue: p.lightingValue },
        ...p.lightingEnabled === void 0 ? {} : { lightingEnabled: p.lightingEnabled },
        ...p.ambientLightIntensity === void 0 ? {} : { ambientLightIntensity: p.ambientLightIntensity },
        ...p.ambientLightEnabled === void 0 ? {} : { ambientLightEnabled: p.ambientLightEnabled },
        ...p.musicAlbumTitle === void 0 ? {} : { musicAlbumTitle: p.musicAlbumTitle },
        ...p.musicTitle === void 0 ? {} : { musicTitle: p.musicTitle },
        ...p.musicPaused === void 0 ? {} : { musicPaused: p.musicPaused },
        ...p.musicAction === void 0 ? {} : { musicAction: p.musicAction },
        ...p.musicPlayType === void 0 ? {} : { musicPlayType: p.musicPlayType }
      }, optionalString("requestId"));
      return {
        sent: true,
        requestId: ack.requestId,
        environment: ack.environment
      };
    }
    case "query_status": {
      const result = await service.queryStatus(optionalString("requestId"));
      requireSuccess(operation, result);
      return result;
    }
    case "music_album_create": {
      const titles = normalizeMusicTitles(p.musicTitles);
      if (titles.invalidTitles.length > 0) throw new Error(`Unknown music titles: ${titles.invalidTitles.join(", ")}`);
      if (titles.titles.length === 0) throw new Error("musicTitles must contain at least one known track");
      const requestId = service.createMusicAlbum(string("albumTitle"), titles.titles, optionalString("requestId"));
      return { sent: true, confirmed: false, requestId };
    }
    case "noteboard_create":
      service.createNotesBoardNote(string("propId"), string("data"));
      return { sent: true, confirmed: false };
    case "bot_message": {
      if (p.poseType === void 0 !== (p.action === void 0)) throw new Error("poseType and action must be supplied together");
      const poseType = p.poseType;
      const action = poseType ? getActionDefinition(poseType, string("action")) : void 0;
      const result = await service.sendBotMessage(string("toAvatarId"), p.depth, string("bubble"), {
        ...poseType && action ? { poseType, action: action.name, playback: getActionPlayback(action) } : {},
        ...p.log === void 0 ? {} : { log: string("log") }
      });
      requireSuccess(operation, result);
      return result;
    }
  }
}

export {
  loadEnvironmentsConfig,
  KichiForwarderService,
  KICHI_JOIN_PARAMETERS,
  listKichiOperations,
  describeKichiOperation,
  executeKichiOperation
};
