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

class File implements File$ {
  private STREAM_FINISH: string = 'finish';
  private STREAM_ERROR: string = 'error';
  private STREAM_CLOSE: string = 'close';
  private STREAM_END: string = 'end';
  private STREAM_DATA: string = 'data';
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
        const ws = this.writeStream;
        ws.on(this.STREAM_ERROR, err => {
          reject(err);
        });
        ws.on(this.STREAM_FINISH, () => {
          resolve(this);
        });
        ws.end();
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
            .on(this.STREAM_DATA, d => {
              rdata += d;
            })
            .on(this.STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(this.STREAM_CLOSE, () => {
              err ? reject(err) : resolve(rdata);
            });
          break;
        // if pass the string or buffer
        case typeof input === 'string' || input instanceof Buffer:
          writeStream = this.writeStream;
          writeStream
            .on(this.STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(this.STREAM_FINISH, () => {
              finish = true;
            })
            .on(this.STREAM_CLOSE, () => {
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

          writeStream.setDefaultEncoding(encoding).on(this.STREAM_END, () => {
            err ? reject(err) : resolve(this);
          });

          readStream = <Stream.Readable>input;
          readStream
            .on(this.STREAM_DATA, chunk => {
              writeStream.write(chunk);
            })
            .on(this.STREAM_ERROR, (error: Error) => {
              err = error;
            })
            .on(this.STREAM_END, () => {
              writeStream.end();
            });
          break;
        default:
          reject(new Error(`Invalid input`));
      }
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
   * move the file and delete the file after move success
   * @param toFilePath
   * @returns {Promise.<File>}
   */
  async move(toFilePath: string): Promise<File> {
    await this.copy(toFilePath);
    await this.remove();
    return this;
  }

  /**
   * copy the file, do not delete the origin file
   * @param {string} toFilePath
   * @returns {Promise<File>}
   */
  async copy(toFilePath: string): Promise<File> {
    return <Promise<File>>new Promise((resolve, reject) => {
      this.readStream
        .pipe($(toFilePath).writeStream)
        .on('error', (err: Error) => {
          reject(err);
        })
        .on('finish', () => {
          resolve(this);
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
      const rs = this.readStream;
      const hash = crypto.createHash(algorithm);
      rs.on('data', data => {
        hash.update(data);
      });
      rs.on('error', err => {
        reject(err);
      });
      rs.on('end', async () => {
        resolve(hash.digest(encoding));
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
    return <Promise<File>>new Promise((resolve, reject) => {
      const ws = this.writeStream;
      ws.on('error', err => {
        reject(err);
      });
      ws.on('finish', () => {
        resolve(this);
      });
      ws.end('');
    });
  }
}

export default function $(filePath: string): File {
  return new File(filePath);
}
