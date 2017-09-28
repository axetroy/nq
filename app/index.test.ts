import test from 'ava';
import $ from './index';

test('base', async t => {
  const $testFile = await $(`${Math.random()}.md`).ensure();
  try {
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

test('test file ext', async t => {
  const $testFile = await $(`${Math.random()}.md`);
  try {
    t.deepEqual(await $testFile.ext, '.md');
  } catch (err) {
    throw err;
  }
});

test('test file size', async t => {
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

test('test file pipe', async t => {
  const $file1 = await $(`${Math.random()}.md`).ensure();
  try {
    const buff = new Buffer('stdout test');
    await $file1.text(buff);

    const stdout = process.stdout;

    const stream = $file1.pipe(stdout);

    t.pass();
  } catch (err) {
    t.fail(err);
  } finally {
    await $file1.remove();
  }
});
