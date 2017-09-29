import test from 'ava';
import $ from './index';

test('base', async t => {
  const filename = `${Math.random()}.md`;
  const $testFile = await $(filename).ensure();
  try {
    t.deepEqual((await $testFile.name) + (await $testFile.ext), filename);

    await $testFile.info;

    // $testFile
    const md51: string = await $testFile.md5;
    await $testFile.text('hello world');
    const md52: string = await $testFile.md5;

    t.deepEqual(await $testFile.text(), 'hello world');

    t.notDeepEqual(md51, md52);
  } catch (err) {
    t.fail(err);
  } finally {
    await $testFile.remove();
  }
});

test('test file .ensure()', async t => {
  const $testFile = await $(`${Math.random()}.md`);
  try {
    t.false(await $testFile.isExist);

    await $testFile.ensure();

    t.true(await $testFile.isExist);

    t.deepEqual(await $testFile.text(), '');
    t.deepEqual((await $testFile.buffer).length, 0);
  } catch (err) {
    throw err;
  } finally {
    await $testFile.remove();
  }
});

test('test file .isFile()', async t => {
  const $testFile = await $(`${Math.random()}.md`).ensure();
  try {
    t.true(await $testFile.isFile);

    t.false(await $('node_modules').isFile);
  } catch (err) {
    throw err;
  } finally {
    await $testFile.remove();
  }
});

test('test file .ext', async t => {
  const $testFile = await $(`${Math.random()}.md`);
  try {
    t.deepEqual(await $testFile.ext, '.md');
  } catch (err) {
    throw err;
  }
});

test('test file .size', async t => {
  const $testFile = await $(`${Math.random()}.md`).ensure();
  try {
    t.deepEqual(await $testFile.size, 0);

    const buff = new Buffer('hello world');

    await $testFile.text(buff);

    t.deepEqual(await $testFile.size, buff.length);
  } catch (err) {
    t.fail(err.message);
  } finally {
    await $testFile.remove();
  }
});

test('test file .pipe()', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  try {
    const buff = new Buffer('stdout test');
    await $file1.text(buff);

    const stdout = process.stdout;

    // const stream = $file1.pipe(stdout);

    t.pass();
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
  }
});

test('test file buffer is always buffer', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  try {
    const newBuffer = new Buffer('hello world');

    await $file1.text(newBuffer); // 写入文件

    const buff = await $file1.buffer;

    t.true(buff instanceof Buffer);
    t.deepEqual(buff.length, newBuffer.length);
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
  }
});

test('test file .empty()', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  try {
    const newBuffer = new Buffer('hello world');

    await $file1.text(newBuffer);

    await $file1.empty();

    t.deepEqual(await $file1.text(), ''); // 内容为0
    t.deepEqual((await $file1.buffer).length, 0); // buffer长度为0
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
  }
});

test('test file .copy()', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  let $file2;
  try {
    const newBuffer = new Buffer('hello world');

    await $file1.text(newBuffer);

    const file2 = `${Math.random()}.md`;

    $file2 = await $file1.copy(file2);

    t.deepEqual(await $file2.text(), 'hello world'); // 内容相同
    t.deepEqual((await $file2.buffer).length, newBuffer.length); // buffer长度相同
    t.deepEqual(await $file1.md5, await $file2.md5); // md5相同

    // the old file still exist

    t.true(await $file1.isExist);
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
    $file2 && (await $file2.remove());
  }
});

test('test file .move()', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  let $file2;
  try {
    const newBuffer = new Buffer('hello world');

    await $file1.text(newBuffer);

    const oldMd5 = await $file1.md5;

    const file2 = `${Math.random()}.md`;

    $file2 = await $file1.move(file2);

    t.deepEqual(await $file2.text(), 'hello world'); // 内容相同
    t.deepEqual((await $file2.buffer).length, newBuffer.length); // buffer长度相同
    t.deepEqual(oldMd5, await $file2.md5); // md5相同

    // the old file have been remove
    t.false(await $file1.isExist);
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
    $file2 && (await $file2.remove());
  }
});
