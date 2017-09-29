import * as fs from 'fs-extra';
import * as Stream from 'stream';
import * as crypto from 'crypto';
import * as path from 'path';
import ReadStream = NodeJS.ReadStream;
import WriteStream = NodeJS.WriteStream;
import { Stats } from 'fs';
import { error } from 'util';

type HexBase64Latin1Encoding = 'latin1' | 'hex' | 'base64';

interface FileConstructor$ {
  new (selector: String): File;
}

interface File$ {
  readonly name: string;
  readonly ext: string;
  readonly isAbsolute: boolean;
  readonly isFile: Promise<boolean>;
  readonly isExist: Promise<boolean>;
  readonly info: Promise<Stats>;
  readonly size: Promise<number>;
  readonly readStream: Stream.Readable;
  readonly writeStream: Stream.Writable;
  ensure(): Promise<File>;
  // pipe(nextStream: WriteStream | Stream.Writable | File): Promise<File>;
  text(
    input?: void | string | Buffer | Stream.Readable | WriteStream | File
  ): Promise<String | Buffer | File>;
  remove(): Promise<File>;
  move(toFilePath: string): Promise<File>;
  copy(toFilePath: string): Promise<File>;
  hash(algorithm: string, encoding: HexBase64Latin1Encoding): Promise<string>;
  readonly md5: Promise<string>;
  empty(): Promise<File>;
}

const STREAM_OPEN: string = 'open'; // read/write
const STREAM_CLOSE: string = 'close'; // read/write
const STREAM_ERROR: string = 'error'; // read/write
const READ_STREAM_END: string = 'end'; // read
const READ_STREAM_DATA: string = 'data'; // read
const WRITE_STREAM_FINISH: string = 'finish'; // read

class File implements File$ {
  private ENCODING: string = 'utf8';

  constructor(private selector: string) {
    if (this instanceof File === false) {
      return new File(this.selector);
    }
  }
  get readStream(): Stream.Readable {
    return fs.createReadStream(this.selector);
  }
  get writeStream(): Stream.Writable {
    return fs.createWriteStream(this.selector);
  }

  get isAbsolute(): boolean {
    return path.isAbsolute(this.selector);
  }

  get name(): string {
    return path.parse(this.selector).name;
  }

  get ext(): string {
    return path.extname(this.selector);
  }

  /**
   * get the file info
   * @returns {Promise<"fs".Stats>}
   */
  get info(): Promise<Stats> {
    return fs.stat(this.selector);
  }

  /**
   * the path is file or not
   * @returns {Promise<boolean>}
   */
  get isFile(): Promise<boolean> {
    return this.info
      .then(stat => {
        return stat.isFile();
      })
      .catch(() => Promise.resolve(false));
  }

  /**
   * get the file is exist or not
   * @returns {Promise<boolean>}
   */
  get isExist(): Promise<boolean> {
    return this.info
      .then(() => Promise.resolve(true))
      .catch(() => Promise.resolve(false));
  }

  /**
   * get the file size
   * @returns {Promise<number>}
   */
  get size(): Promise<number> {
    return this.info.then((stat: Stats) => Promise.resolve(stat.size));
  }

  /**
   * ensure the file exist
   * @returns {Promise<File>}
   */
  async ensure(): Promise<File> {
    try {
      await this.info;
      return this;
    } catch (err) {
      return <Promise<File>>new Promise((resolve, reject) => {
        let err: Error;
        this.writeStream
          .on(STREAM_ERROR, (error: Error) => {
            err = error;
          })
          .on(STREAM_CLOSE, () => {
            err ? reject(err) : resolve(this);
          })
          .end();
      });
    }
  }

  /**
   * pipe the file stream
   * @param nextStream
   * @returns {File}
   */
  pipe(
    nextStream: WriteStream | Stream.Writable | File
  ): WriteStream | Stream.Writable {
    if (nextStream instanceof Stream) {
      return this.readStream.pipe(<WriteStream>nextStream);
    } else if (nextStream instanceof File) {
      return this.readStream.pipe((<File>nextStream).writeStream);
    } else {
      throw new Error(`Invalid Stream to Pipe`);
    }
  }

  /**
   * get/set file text
   * @param {void | string | Buffer | "stream".internal.Readable | NodeJS.WriteStream | File} input
   * @param {string} encoding
   * @returns {Promise<String | Buffer | "stream".internal | File>}
   */
  async text(
    input?: void | string | Buffer | Stream.Readable | WriteStream | File,
    encoding: string = this.ENCODING
  ): Promise<String | Buffer | File> {
    return <Promise<String | Buffer | File>>new Promise((resolve, reject) => {
      let readStream: Stream.Readable;
      let writeStream: Stream.Writable;
      let err: Error;
      let finish: boolean = false;
      switch (true) {
        // if no input, then read the file text
        case input === void 0:
          let rdata = '';
          this.readStream
            .setEncoding(encoding)
            .on(READ_STREAM_DATA, d => {
              rdata += d;
            })
            .on(STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(STREAM_CLOSE, () => {
              err ? reject(err) : resolve(rdata);
            });
          break;
        // if pass the string or buffer
        case typeof input === 'string' || input instanceof Buffer:
          writeStream = this.writeStream;
          writeStream
            .on(STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(WRITE_STREAM_FINISH, () => {
              finish = true;
            })
            .on(STREAM_CLOSE, () => {
              err ? reject(err) : resolve(this);
            });
          writeStream.setDefaultEncoding(encoding);
          writeStream.end(input);
          break;
        // if pass the file entity
        case input instanceof File:
          readStream = (<File>input).readStream;
        // if pass a readable stream
        case input instanceof Stream.Readable:
          writeStream = this.writeStream;

          writeStream.setDefaultEncoding(encoding).on(READ_STREAM_END, () => {
            err ? reject(err) : resolve(this);
          });

          readStream = <Stream.Readable>input;
          readStream
            .on(READ_STREAM_DATA, chunk => {
              writeStream.write(chunk);
            })
            .on(STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(READ_STREAM_END, () => {
              writeStream.end();
            });
          break;
        default:
          reject(new Error(`Invalid input`));
      }
    });
  }

  /**
   * 获取文件的buffer
   * @returns {Promise<Buffer>}
   */
  get buffer(): Promise<Buffer> {
    return <Promise<Buffer>>new Promise((resolve, reject) => {
      let arr: Buffer[] = [];
      let err: Error;
      this.readStream
        .on(READ_STREAM_DATA, (chunk: Buffer) => {
          arr.push(chunk);
        })
        .on(STREAM_ERROR, (error: Error) => {
          err = error;
        })
        .on(STREAM_CLOSE, () => {
          err ? reject(err) : resolve(Buffer.concat(arr));
        });
    });
  }

  /**
   * delete a file
   * @returns {Promise.<File>}
   */
  async remove(): Promise<File> {
    await fs.remove(this.selector);
    return this;
  }

  /**
   * move the file and delete the file after move success, return a new File
   * @param {string} toFilePath
   * @param {string|object} options
   * @returns {Promise.<File>}
   */
  async move(
    toFilePath: string,
    options?:
      | string
      | {
          flags?: string;
          encoding?: string;
          fd?: number;
          mode?: number;
          autoClose?: boolean;
          start?: number;
        }
  ): Promise<File> {
    const file: File = await this.copy(toFilePath, options);
    await this.remove();
    return file;
  }

  /**
   * copy the file, do not delete the origin file, return a new File()
   * @param {string} toFilePath
   * @param {string|object} options
   * @returns {Promise<File>}
   */
  async copy(
    toFilePath: string,
    options?:
      | string
      | {
          flags?: string;
          encoding?: string;
          fd?: number;
          mode?: number;
          autoClose?: boolean;
          start?: number;
        }
  ): Promise<File> {
    return <Promise<File>>new Promise((resolve, reject) => {
      let err: Error;
      this.readStream
        .pipe(fs.createWriteStream(toFilePath, options))
        .on(STREAM_ERROR, (error: Error) => {
          err = error;
        })
        .on(STREAM_CLOSE, () => {
          err ? reject(err) : resolve(new File(toFilePath));
        });
    });
  }

  /**
   * calculate the file hash
   * @returns {Promise}
   */
  async hash(
    algorithm: string,
    encoding: HexBase64Latin1Encoding
  ): Promise<string> {
    return <Promise<string>>new Promise((resolve, reject) => {
      let err: Error;
      const hash = crypto.createHash(algorithm);
      this.readStream
        .on(READ_STREAM_DATA, data => {
          hash.update(data);
        })
        .on(STREAM_ERROR, (error: Error) => {
          err = error;
        })
        .on(READ_STREAM_END, async () => {
          err ? reject(err) : resolve(hash.digest(encoding));
        });
    });
  }

  /**
   * get the file md5 string
   * @returns {Promise<string>}
   */
  get md5(): Promise<string> {
    return this.hash('md5', 'hex');
  }

  /**
   * make a file empty
   * @returns {Promise<File>}
   */
  async empty(): Promise<File> {
    const isExist: boolean = await this.isExist;
    return <Promise<File>>new Promise((resolve, reject) => {
      if (!isExist) {
        resolve();
      } else {
        let err: Error;
        this.writeStream
          .on(STREAM_ERROR, (error: Error) => {
            err = error;
          })
          .on(STREAM_CLOSE, () => {
            err ? reject(err) : resolve(this);
          })
          .end('');
      }
    });
  }
}

export default function $(filePath: string): File {
  return new File(filePath);
}
