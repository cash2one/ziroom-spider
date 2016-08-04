'use strict';

const sqlite3 = require('sqlite3').verbose(),
  nodeFetch = require('node-fetch'),
  settings = require('../settings.js'),
  querystring = require('querystring'),
  ObjectId = require('mongodb').ObjectId,
  fs = require('fs-extra');

const COLL_PARSE = 'parse';


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


function parseData(rawData) {
  return rawData.map(rd => {
    rd.price = rd.price || 0;
    rd.price = rd.price.replace('￥', '');
    rd.price = parseInt(rd.price);

    rd.info = rd.info.map(ri => ri.split('：').map(rim => rim.trim()));

    rd.area = rd.info.find(i => i[0] == '面积')[1];
    rd.area = rd.area.replace(/㎡/g, '').trim() - 0;
    rd.centarePrice = rd.price / rd.area;
    rd.centarePrice = rd.centarePrice.toFixed(1) - 0;

    let room = rd.info.find(i => i[0] == '户型')[1];
    rd.type = room.endsWith('合') ? '合' : (room.endsWith('整') ? '整' : '-');

    return rd;
  });
}

function * getDataFromFetchDb (limit, skip) {
  let db = new sqlite3.Database(__dirname + '/../data/result.db');

  let rows = yield new Promise((resolve, reject) => {
    db.all(`select result from resultdb_ziroom limit ${limit || 1} offset ${skip || 0}`, function (err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  var result = rows.map(r => {
    let res = r.result.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
      return String.fromCharCode(parseInt(grp, 16));
    });
    return JSON.parse(res);
  });

  return result;
}

let count = 0;
function * getGeo (db) {
  let step = 10;

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

  if (noGeoDatas.length  && count < 500) {
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


  // console.log(maxPrice, maxCentarePrice, minPrice, minCentarePrice);

  let heatmapData = data.map(d => {
    return {
      lng: d.lng,
      lat: d.lat,
      count: d.price
    };
  });

  var dataSetString = `var heatmapData = ${JSON.stringify(heatmapData, null, 2)}`;
  fs.outputFileSync(__dirname + '/../src/heatmapData.js',dataSetString);
}

function * format (db) {
  let rows = yield getDataFromFetchDb(10000);
  rows = parseData(rows);

  for(let row of rows) {
    yield db.collection(COLL_PARSE).update({
      url: row.url
    }, {
      $set: row
    }, {
      upsert: true
    });
  }
}

module.exports = {
  getGeo: getGeo,
  update: update,
  format: format
};