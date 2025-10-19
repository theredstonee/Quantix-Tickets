module.exports = {
  apps: [{
    name: 'quantix-tickets',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 10000,
    kill_timeout: 5000,
    wait_ready: false,
    // Restart-Verzögerung nach Crash
    restart_delay: 4000,
    // Exponentieller Backoff bei schnellen Restarts
    exp_backoff_restart_delay: 100,
    // Merge Logs
    merge_logs: true,
    // Cron Restart (optional, z.B. täglich um 3 Uhr nachts)
    // cron_restart: '0 3 * * *',
    // Post-Update Hook
    post_update: ['npm install'],
    // Git Tracking
    versioning: {
      type: 'git'
    }
  }]
};
