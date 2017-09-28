import test from 'ava';
import $ from './index';

test('base', async t => {
  const $testFile = $('test.md');
  await $testFile.ensure();
  // $testFile
  const md51: string = await $testFile.md5;
  await $testFile.text('hello world');
  const md52: string = await $testFile.md5;

  t.deepEqual(await $testFile.text(), 'hello world');

  t.notDeepEqual(md51, md52);

  await $testFile.remove();
});
