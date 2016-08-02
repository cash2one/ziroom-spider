'use strict';

const nodeFetch = require('node-fetch'),
  settings = require('../settings.js'),
  querystring = require('querystring'),
  ObjectId = require('mongodb').ObjectId,
  fs = require('fs-extra');

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
  const geoAPI = 'http://restapi.amap.com/v3/geocode/geo?';
  let params = {
    key: settings.gaode.webAPIKey,
    city: 'beijing',
    output: 'json',
    address: address
  };

  const url = `${geoAPI}${querystring.encode(params)}`;
  return yield fetch(url);
}

function * parseData(db) {
  let rawData = yield db.collection(COLL_RAW).find().toArray();

  let parseData = rawData.map(rd => {
    let r = rd.result;

    r.price = r.price || 0;
    r.price = r.price.replace('￥', '');
    r.price = parseInt(r.price);

    r.info = r.info.map(ri => ri.split('：').map(rim => rim.trim()));

    r.area = r.info.find(i => i[0] == '面积')[1];
    r.area = r.area.replace(/㎡/g, '').trim() - 0;
    r.centarePrice = r.price / r.area;
    r.centarePrice = r.centarePrice.toFixed(1) - 0;

    let room = r.info.find(i => i[0] == '户型')[1];
    r.type = room.endsWith('合') ? '合' : (room.endsWith('整') ? '整' : '-');

    return r;
  });

  yield db.collection(COLL_PARSE).insert(parseData);
}

let count = 0;
function * getGeo (db) {
  let step = 5;

  let noGeoDatas = yield db.collection(COLL_PARSE)
  .find({geo: {$exists: false}})
  .limit(step)
  .toArray();

  let results = yield noGeoDatas.map(ngd => getGeoFromGaode(ngd.address));

  for (var i = 0; i < noGeoDatas.length; i++) {
    let nGData = noGeoDatas[i];
    let geoResult = results[i];

    if (geoResult.count !== '1') {
      console.log('geo count not 1: ',nGData, geoResult);
    }
    console.log('get geo status', geoResult.status, nGData._id);

    let location = geoResult.geocodes[0].location.split(',');

    yield db.collection(COLL_PARSE)
    .updateOne({
      _id: new ObjectId(nGData._id)
    }, {
      $set: {
        geo: geoResult,
        lng: location[0] - 0,
        lat: location[1] - 0
      }
    });

    count += 1;
    console.log('count: ', count);
  }

  if (noGeoDatas.length) {
    yield new Promise(resolve => {
      setTimeout(() => resolve(), 1000);
    });

    yield getGeo(db);
  }
}

function * update (db) {
  let data = yield db.collection(COLL_PARSE)
    .find({}, {
      location: 1,
      price: 1,
      centarePrice: 1,
      lng: 1,
      lat: 1
    })
    .toArray();

  // data.sort((a,b) => b.price - a.price);
  // let maxPrice = data[0]['price'];
  // let minPrice = data[data.length -1]['price'];

  data.sort((a,b) => b.centarePrice - a.centarePrice)[0]['centarePrice'];
  let maxCentarePrice = data[0]['centarePrice'];
  let minCentarePrice = data[data.length -1]['centarePrice'];

  // console.log(maxPrice, maxCentarePrice, minPrice, minCentarePrice);

  let heatmapData = {
    min: minCentarePrice,
    max: maxCentarePrice,
    data: data.map(d => {
      return {
        lng: d.lng,
        lat: d.lat,
        count: d.centarePrice
      };
    })
  };

  var dataSetString = `var heatmapData = ${JSON.stringify(heatmapData)}`;
  fs.outputFileSync(__dirname + '/../src/heatmapData.js',dataSetString);
}

module.exports = {
  parseData: parseData,
  getGeo: getGeo,
  update: update
};