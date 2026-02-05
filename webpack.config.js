const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = (_, { mode }) => {
  const isProduction = mode === 'production';

  return {
    entry: "./src/components/embeddableWidget/EmbeddableWidget.jsx",
    output: {
      path: path.resolve(__dirname, "build"),
      publicPath: isProduction ? "https://widget.docsbot.ai/" : "/",
      filename: "chat.js",
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
      client: {
        overlay: {
          runtimeErrors: (error) => {
            if (
              error &&
              typeof error.message === "string" &&
              error.message.includes(
                "ResizeObserver loop completed with undelivered notifications"
              )
            ) {
              return false;
            }
            return true;
          },
        },
      },
	  watchFiles: ["src/assets/scss/**/*.scss"],
    },
    module: {
      rules: [
        {
			test: /\.svg$/i,
			use: [{
			  loader: '@svgr/webpack',
			  options: {
				svgoConfig: {
					plugins: [
					  {
						name: 'preset-default',
						params: {
						  overrides: {
							// disable plugins
							removeViewBox: false,
						  },
						},
					  },
					],
				  },
			  }
			}]
        },
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
