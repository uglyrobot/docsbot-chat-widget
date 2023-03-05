const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const increaseSpecificity = require("postcss-increase-specificity");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

function getCssConfig(mode) {
  if (mode === "production") {
    return [
      MiniCssExtractPlugin.loader,
      "css-loader",
      "cssimportant-loader",
      {
        loader: "postcss-loader",
        options: {
          postcssOptions: {
            plugins: [
              increaseSpecificity({
                stackableRoot: ".cleanslate",
                repeat: 1,
              }),
            ],
          },
        },
      },
    ];
  }

  return ["style-loader", "css-loader", "cssimportant-loader"];
}

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
      new MiniCssExtractPlugin({
        filename:
          mode === "production" ? "[name].[contenthash].css" : "[name].css",
        chunkFilename:
          mode === "production" ? "[name].[contenthash].css" : "[name].css",
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
          use: getCssConfig(mode),
        },
      ],
    },

    resolve: {
      extensions: ["*", ".js", ".jsx"],
    },
  };
};
