// use with node, 20k smaller without deps

module.exports = {
  mode: 'production',
  target: 'node',
  output: {
    path: require('path').resolve(__dirname, '../dist'),
    library: 'RiTa',
    filename: 'rita-nodeps.js',
    libraryTarget: 'umd',
  },  
  node: {
    fs: "empty",
    __dirname: false,
    __filename: false,
  },
  watchOptions: {
    ignored: /node_modules/
  },
  externals: ['he', 'flatted/cjs', 'deepmerge', 'antlr4', /^antlr4\/.+$/ ],
  entry: './src/rita.js',
  plugins: [new (require('webpack').DefinePlugin)({
    __VERSION__: JSON.stringify(require("../package.json").version)
  })]
};
