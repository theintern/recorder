const { join } = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: {
		background: join(__dirname, 'src', 'background.ts'),
		content: join(__dirname, 'src', 'content.ts'),
		devtools: join(__dirname, 'src', 'devtools.ts'),
		Recorder: join(__dirname, 'src', 'Recorder.ts'),
		RecorderProxy: join(__dirname, 'src', 'RecorderProxy.ts')
	},
	output: {
		path: join(__dirname, 'build'),
		filename: join('lib', '[name].js')
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader'
			}
		]
	},
	resolve: {
		extensions: ['.ts', '.js']
	},
	plugins: [
		// minify
		// new webpack.optimize.UglifyJsPlugin()
		new CopyWebpackPlugin([
			{ from: 'lib', to: 'lib' },
			{ from: 'resources', to: 'resources' },
			{ from: 'lib', to: 'lib' },
			{ from: 'manifest.json' }
		])
	]
};
