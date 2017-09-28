import * as fs from 'fs-extra';
import * as Stream from 'stream';
import * as crypto from 'crypto';
import ReadStream = NodeJS.ReadStream;
import WriteStream = NodeJS.WriteStream;
import { Stats } from 'fs';

type HexBase64Latin1Encoding = 'latin1' | 'hex' | 'base64';

interface File$ {
  readStream: Stream.Readable;
  writeStream: Stream.Writable;
}

class File implements File$ {
  constructor(private path: string) {
    if (this instanceof File === false) {
      return new File(path);
    }
  }
  get readStream(): Stream.Readable {
    return fs.createReadStream(this.path);
  }
  get writeStream(): Stream.Writable {
    return fs.createWriteStream(this.path);
  }

  get info(): Promise<Stats> {
    return fs.stat(this.path);
  }

  get isFile(): Promise<boolean> {
    return this.info
      .then(stat => {
        return stat.isFile();
      })
      .catch(() => false);
  }
  async ensure(): Promise<File> {
    try {
      await this.info;
    } catch (err) {
      // 文件不存在
      this.writeStream;
    }
    return this;
  }

  /**
   * 开通管道
   * @param nextStream
   * @returns {File}
   */
  pipe(nextStream: WriteStream | Stream.Writable | File): File {
    if (nextStream instanceof Stream) {
      this.readStream.pipe(<Stream.Writable | WriteStream>nextStream);
    } else if (nextStream instanceof File) {
      this.readStream.pipe((<File>nextStream).writeStream);
    } else {
      throw new Error(`Invalid Stream to Pipe`);
    }
    return this;
  }

  /**
   * 获取/设置文件的text
   * @param input
   * @returns {Promise.<*>}
   */
  async text(
    input?: void | string | Buffer | Stream.Readable | WriteStream | File
  ): Promise<String | Buffer | Stream | File> {
    if (input === void 0) {
      return fs.readFileSync(this.path, { encoding: 'utf8' });
    } else {
      if (typeof input === 'string' || input instanceof Buffer) {
        return <Promise<File>>new Promise((resolve, reject) => {
          const ws: Stream.Writable = this.writeStream;
          ws.on('error', err => {
            reject(err);
          });
          ws.on('finish', () => {
            console.info(`write finish and resolve`);
            resolve(this);
          });
          ws.end(input, 'utf8');
        });
      } else if (input instanceof Stream.Readable) {
        return (<Stream.Readable>input).pipe(this.writeStream);
      } else if (input instanceof File) {
        return (<File>input).pipe(this.writeStream);
      } else {
        throw new Error(`Invalid input`);
      }
    }
  }

  /**
   * 删除文件
   * @returns {Promise.<File>}
   */
  async remove(): Promise<File> {
    await fs.remove(this.path);
    return this;
  }

  /**
   * 移动文件
   * @param toFilePath
   * @returns {Promise.<File>}
   */
  async move(toFilePath) {
    await fs.move(this.path, toFilePath);
    this.path = toFilePath;
    return this;
  }

  /**
   * 计算文件hash值
   * @returns {Promise}
   */
  hash(algorithm: string, encoding: HexBase64Latin1Encoding): Promise<string> {
    return new Promise((resolve, reject) => {
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
   * 获取文件md5
   * @returns {Promise<string>}
   */
  get md5(): Promise<string> {
    return this.hash('md5', 'hex');
  }

  /**
   * 置空一个文件
   * @returns {Promise<any>}
   */
  async empty(): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = this.writeStream;
      ws.on('error', err => {
        reject(err);
      });
      ws.on('finish', () => {
        resolve();
      });
      ws.end('');
    });
  }
}

export default function $(filePath): File {
  return new File(filePath);
}
