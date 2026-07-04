module.exports = {
  appId: 'io.bloxd.translation-layer',
  productName: 'Bloxd Translation Layer',
  directories: {
    output: 'release'
  },
  files: [
    'dist-main/**',
    'dist-preload/**',
    'dist-renderer/**',
    'bloxd/**',
    'physics/**',
    'server.js',
    'index.js',
    'package.json'
  ],
  win: {
    target: ['nsis', 'zip']
  }
};
