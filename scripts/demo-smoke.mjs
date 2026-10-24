import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../operacion/demo/index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../operacion/demo/demo.js',import.meta.url),'utf8');
assert.match(html,/id="demoRole"/);
assert.match(html,/demo-banner/);
assert.match(html,/demo\.js/);
assert.ok(!script.includes("fetch('/api/"),'La demo no debe usar el backend de producción');
const helper=String.raw