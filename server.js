// server.js
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs'
    }
});

require('./src/server/GameServer.ts');
