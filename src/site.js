const axios = require('axios');
const axiosRetry = require('axios-retry');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const { parse } = require('node-html-parser');
const parseTorrent = require('parse-torrent');
const request = require('request');
const retryRequest = require('retry-request');

const fs = require('fs');

module.exports = class Site {
  constructor(config, client) {
    this.config = config;
    this.client = client;

    this.urls = [];

    this.axios = axios.create({
      baseURL: this.config.url,
      headers: {
        Cookie: this.config.cookie,
      },
    });
    axiosRetry(this.axios, { retryDelay: axiosRetry.exponentialDelay });

    this.request = request.defaults({
      baseUrl: this.config.url,
      headers: {
        Cookie: this.config.cookie,
      },
    });

    switch (this.config.name) {
      case 'haidan':
        this.itemSelector = '.torrent_group';
        break;
      default:
        this.itemSelector = 'table.torrentname';
        break;
    }
    switch (this.config.name) {
      case '52pt':
        this.linkSelector = 'td:nth-child(2) a:nth-child(1)';
        break;
      case 'discfan':
        this.linkSelector = 'td:nth-child(2) a:nth-child(1)';
        break;
      case 'haidan':
        this.linkSelector = '[title="下载本种"]';
        break;
      case 'hdarea':
        this.linkSelector = 'td:nth-child(4) a:nth-child(1)';
        break;
      case 'hddolby':
        this.linkSelector = 'td:nth-child(2) td:nth-child(2) a:nth-child(1)';
        break;
      case 'hdzone':
        this.linkSelector = 'td:nth-child(2) td:nth-child(2) a:nth-child(1)';
        break;
      case 'msg':
        this.linkSelector = 'td:nth-child(2) a:nth-child(1)';
        break;
      case 'piggo':
        this.linkSelector = 'td:nth-child(4) a:nth-child(1)';
        break;
      case 'pttime':
        this.linkSelector =
          'td:nth-last-child(1) td:nth-child(2) a:nth-child(1)';
        break;
      default:
        this.linkSelector = 'td:nth-child(3) a:nth-child(1)';
        break;
    }
  }

  async crawl() {
    await this.fetchAll();
    await this.downloadAll();
  }

  async fetchAll() {
    for (const name of this.client.names) {
      console.log(chalk.blue(name));

      try {
        this.urls = this.urls.concat(await this.fetch(name));
      } catch (e) {
        console.log(chalk.red(e.toString()));
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async fetch(name) {
    let urls = [];

    if (/cXcY@FRDS/.test(name)) {
      const index = name.indexOf('S');
      name = [name.slice(0, index), name.slice(index)].join('.');
    }

    let data;
    try {
      data = (
        await this.axios.get('/torrents.php', { params: { search: name } })
      ).data;
    } catch (e) {
      throw '网络请求失败';
    }

    try {
      const dom = parse(data);
      const els = dom
        .querySelectorAll(this.itemSelector)
        .filter((el) => el.querySelector('[title="置顶促销"]') === null);
      if (els.length === 0) {
        console.log(chalk.yellow('没有种子'));
      } else {
        urls = els.map(
          (el) => el.querySelector(this.linkSelector).attributes['href']
        );
        console.log(chalk.green(`${urls.length}个种子`));
      }
    } catch (e) {
      throw '解析失败';
    }

    return urls;
  }

  async downloadAll() {
    this.bar = new cliProgress.SingleBar(
      {
        format: `下载中: ${chalk.blue(
          '{bar}'
        )} {value}/{total} | {size} kbit | {url}`,
        stopOnComplete: true,
        clearOnComplete: true,
      },
      cliProgress.Presets.shades_classic
    );
    this.bar.start(this.urls.length, 0, { url: '', size: 0 });
    if (this.urls.length === 0) {
      this.bar.stop();
    }

    let index = 0;
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.bar.value === this.urls.length) {
          clearInterval(interval);
          resolve();
        } else if (this.bar.value === index) {
          const url = this.urls[index++];
          this.bar.update({ url, size: 0 });
          this.download(url);
        }
      }, 1000);
    });
  }

  download(url) {
    const id = url.match(/.*id=(\d+).*/)[1];
    const filename = `${this.config.name}-${id}.torrent`;
    const path = `${this.client.config.directory}/${filename}`;

    retryRequest({ url }, { request: this.request })
      .on('data', (chunk) => {
        this.bar.update({ size: this.bar.payload.size + chunk.length });
      })
      .pipe(fs.createWriteStream(path))
      .on('finish', () => {
        const data = parseTorrent(fs.readFileSync(path));
        const sameTorrent = this.client.torrents.find(
          (torrent) => torrent.hash === data.infoHash
        );
        const similarTorrent = this.client.torrents.find(
          (torrent) => torrent.name === data.name
        );

        if (
          sameTorrent ||
          !similarTorrent ||
          similarTorrent.total_size !== data.length
        ) {
          fs.unlinkSync(path);
        }
        this.bar.increment();
      });
  }
};
