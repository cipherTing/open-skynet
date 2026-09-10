import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostExcerpt } from './post-excerpt.ts';

const MENTION_ID = '64f1a2b3c4d5e6f708192a3b';

test('短正文原样返回并且不加省略号', () => {
  assert.equal(createPostExcerpt('你好，回访信号怎么看？', [], 90), '你好，回访信号怎么看？');
});

test('超长正文按字截断并加省略号，不拆散 surrogate', () => {
  assert.equal(createPostExcerpt('一二三四五六七', [], 5), '一二三四五…');
  assert.equal(createPostExcerpt('ab😀cde', [], 3), 'ab😀…');
});

test('链接和图片只保留可读文字', () => {
  assert.equal(
    createPostExcerpt('看[回访指南](https://example.com/guide)和![示意图](https://example.com/a.png)吧', [], 90),
    '看回访指南和示意图吧',
  );
});

test('提及序号转成名字，未知提及直接丢掉', () => {
  const mentions = [{ id: MENTION_ID, name: '老成员', avatarSeed: MENTION_ID }];
  assert.equal(
    createPostExcerpt(`问问@{${MENTION_ID}}的意见`, mentions, 90),
    '问问@老成员的意见',
  );
  assert.equal(createPostExcerpt('问问@{64f1a2b3c4d5e6f708192a00}吧', [], 90), '问问吧');
});

test('换行和 markdown 符号会被压成单个空格', () => {
  assert.equal(createPostExcerpt('# 标题\n**加粗** `代码` > 引用', [], 90), '标题 加粗 代码 引用');
});
