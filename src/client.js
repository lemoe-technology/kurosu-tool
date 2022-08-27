const axios = require('axios');

module.exports = class Client {
  constructor(config) {
    this.config = config;

    this.axios = axios.create({
      baseURL: this.config.url,
    });
  }

  async login() {
    const res = await this.axios.get('/api/v2/auth/login', {
      params: {
        username: this.config.username,
        password: this.config.password,
      },
    });
    const cookie = res.headers['set-cookie'][0].split(';')[0];
    this.axios.defaults.headers.common['Cookie'] = cookie;
  }

  async fetchAll() {
    this.torrents = (
      await this.axios.get('/api/v2/torrents/info', {
        params: this.config.params,
      })
    ).data;
    this.names = [...new Set(this.torrents.map((item) => item.name))].sort();
  }
};
