const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = (_, { mode }) => {
  return {
    entry: {
      chat: "./src/components/embeddableWidget/EmbeddableWidget.jsx",
      main: "./src/components/iframeChat/index.js"
    },
    output: {
      path: path.resolve(__dirname, "build"),
      publicPath: "/",
      filename: "[name].js",
      library: "DocsBotAI",
      libraryExport: "default",
      libraryTarget: "window",
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.join(__dirname, "public", "index.html"),
      }),
      new CleanWebpackPlugin(),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, "public"),
      },
      port: 3000,
    },
    module: {
      // exclude node_modules
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: ["babel-loader"],
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"],
        },
        { resourceQuery: /raw/, type: "asset/source" },
      ],
    },
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
        }),
      ],
    },
    resolve: {
      extensions: ["*", ".js", ".jsx"],
    },
  };
};
