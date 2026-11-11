// Entry point. Everything is built in src/index.js; the port is bound only
// when this file is run directly (`node server.js`), never when required.
const app = require('./src/index');
if (require.main === module) app.start();
module.exports = app; // { app, server, io, matchmaking, buildPgnFromMoveLog, start }
