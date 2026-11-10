// ZHAC fork: the energy request carries the panel's current offset from UTC
// in seconds, so the ZHAC Cloud plugin cuts Today/Week/Month/Year at the
// panel's midnight (it knows no time zone). Only with a set clock; upstream's
// Bridge ignores the field.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const source = readRepoFile('src/network/mqtt/mqtt_handlers.cpp').replace(/\r\n?/g, '\n');
const fn = name => {
  const found = cppFunctionDefinitions(source).find(item => item.name === name);
  assert.ok(found, name);
  return found.source;
};

const request = fn('mqttPublishEnergyRequest');
assert.match(request, /if \(has_valid_local_time_for_history\(\)\) \{[\s\S]{0,120}\\"utc_offset\\":/,
             'utc_offset only with a set clock');
assert.ok(request.indexOf('utc_offset') < request.indexOf('payload += "}";'), 'inside the JSON object');

const offset = fn('local_utc_offset_seconds');
assert.ok(offset.includes('localtime_r(&now, &local);') && offset.includes('gmtime_r(&now, &utc);'));
// Across midnight or New Year the day differs: the year decides first.
assert.ok(offset.includes('local.tm_year != utc.tm_year'));

console.log('cloud energy offset ok');
