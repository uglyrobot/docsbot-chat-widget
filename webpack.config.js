const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = (_, { mode }) => {
  return {
    entry: "./src/components/embeddableWidget/EmbeddableWidget.jsx",
    output: {
      path: path.resolve(__dirname, "build"),
      publicPath: "/",
      filename: "docsbotai-widget.js",
      library: "DocsbotAI",
      libraryExport: "default",
      libraryTarget: "window",
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.join(__dirname, "public", "index.html"),
      }),
      new CleanWebpackPlugin({
        protectWebpackAssets: false,
        cleanAfterEveryBuildPatterns: ["*.LICENSE.txt"],
      }),
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

    resolve: {
      extensions: ["*", ".js", ".jsx"],
    },
  };
};
