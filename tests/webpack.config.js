const { join } = require('path');
const { sync: glob } = require('glob');

module.exports = {
	entry: {
		tests: glob(join(__dirname, 'unit', '**', '*.ts'))
	},
	output: {
		path: join(__dirname, 'build'),
		filename: '[name].js'
	},
	devtool: 'source-map',
	module: {
		rules: [
			{
				oneOf: [
					{
						test: /tests\/integration\/.*\.ts$/,
						use: 'raw-loader'
					},
					{
						test: /tests\/.*\.ts$/,
						use: [
							{
								loader: 'ts-loader',
								options: {
									configFile: join(__dirname, 'tsconfig.json')
								}
							}
						]
					},
					{
						test: /\.ts$/,
						use: [
							'@theintern/istanbul-loader',
							{
								loader: 'ts-loader',
								options: {
									configFile: join(__dirname, 'tsconfig.json')
								}
							}
						]
					},
					{
						test: /\.txt$/,
						use: 'raw-loader'
					}
				]
			}
		]
	},
	resolve: {
		extensions: ['.ts', '.js']
	}
};
