module.exports = {
  apps: [{
    name: 'cheating-daddy-server',
    script: './server.js',
    cwd: './',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      WS_HOST: '0.0.0.0',
      WS_PORT: 8080
    },
    env_production: {
      NODE_ENV: 'production',
      WS_HOST: '0.0.0.0',
      WS_PORT: 8080
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
