'use strict';

const co = require('co'),
  mongoClient = require('mongodb').MongoClient;

const mongoUrl = 'mongodb://localhost:27017/ziroom',
  COLL_RAW = 'raw',
  COLL_PARSE = 'parse';

let db;

co(function *() {
  db = yield mongoClient.connect(mongoUrl);

  yield parseData(db);


  db.close();
})
.catch(err => {
  console.trace(err);
  db.close();
});


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