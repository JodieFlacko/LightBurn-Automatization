const fs = require('fs');
const serverPkg = require('../server/package.json');
const rootPkg = require('../package.json');

// Sync versions from server to root
rootPkg.dependencies = {
  ...rootPkg.dependencies,
  ...serverPkg.dependencies
};

fs.writeFileSync('./package.json', JSON.stringify(rootPkg, null, 2));
console.log('✅ Dependencies synced from server to root');
