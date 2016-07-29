'use strict';

const co = require('co'),
  mongoClient = require('mongodb').MongoClient,
  funcLib = require('./funcLib');

const mongoUrl = 'mongodb://localhost:27017/ziroom';

const arg = process.argv[2];
let db;

co(function *() {
  db = yield mongoClient.connect(mongoUrl);

  console.log(arg);
  yield funcLib[arg](db);

  db.close();
})
.catch(err => {
  console.trace(err);
  db.close();
});

