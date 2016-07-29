'use strict';

const nodeFetch = require('node-fetch'),
  settings = require('../settings.js');

const COLL_RAW = 'raw',
  COLL_PARSE = 'parse';


function * fetch (url, option) {
  let res = yield nodeFetch(url, option);
  let body;

  try {
    body = yield res.json();
  } catch(e) {
    body = yield res.text();
  }
  if (res.status >= 400) {
    let err = new Error('fetch error');
    err.message = {
      status: res.status,
      body: body
    };
    throw err;
  }

  return body;
}

function * getGeoFromGaode(address) {

}

function * parseData(db) {
  let rawData = yield db.collection(COLL_RAW).find().toArray();

  let parseData = rawData.map(rd => {
    let r = rd.result;

    r.price = r.price || 0;
    r.price = r.price.replace('￥', '');
    r.price = parseInt(r.price);

    r.info = r.info.map(ri => ri.split('：'));

    return r;
  });

  yield db.collection(COLL_PARSE).insert(parseData);
}

function * getGeo (db) {
  let noGeoData = yield db.collection(COLL_PARSE)
    .find({get: {$exists: false}})
    .limit(1)
    .toArray();

  console.log(noGeoData);

  yield noGeoData.map(ngd => getGeoFromGaode(ngd.address));
}

module.exports = {
  parseData: parseData,
  getGeo: getGeo
};