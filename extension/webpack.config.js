import path from "path";
import { fileURLToPath } from "url";
import CopyPlugin from "copy-webpack-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: {
    "service-worker": "./src/background/service-worker.ts",
    "content-script": "./src/content/content-script.ts",
    popup: "./src/popup/popup.ts",
    sidepanel: "./src/sidepanel/sidepanel.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/sidepanel/sidepanel.html", to: "sidepanel.html" },
      ],
    }),
  ],
  devtool: "cheap-module-source-map",
};
