const chalk = require('chalk');
const yaml = require('js-yaml');

const fs = require('fs');

const package = require('../package.json');
const Client = require('./client.js');
const Site = require('./site.js');

(async () => {
  console.log(`${package.name} version ${package.version}\n`);

  const config = yaml.load(fs.readFileSync('config.yml', 'utf8'));

  if (!fs.existsSync(config.qbittorrent.directory)) {
    fs.mkdirSync(config.qbittorrent.directory);
  }

  const client = new Client(config.qbittorrent);
  await client.login();
  await client.fetchAll();

  for (const site of config.sites.filter(
    (site) => site.enable && site.cookie !== null
  )) {
    console.log(chalk.cyan(site.name));
    await new Site(site, client).crawl();
  }
})();
